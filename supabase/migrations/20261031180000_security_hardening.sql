-- Security hardening: grants, username/email login lookup, data consistency, rate limiting.
-- Applied to the live project (vebrbzqzjuqpsgcznbba) on 2026-10-31.

-- 1) Table grants -------------------------------------------------------------
-- The app never reads tables while signed out (login goes through Edge Functions),
-- so the anon role needs no table access at all.
revoke all on all tables in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
-- TRUNCATE bypasses RLS; TRIGGER/REFERENCES are never needed by the client.
revoke truncate, trigger, references on all tables in schema public from authenticated;
alter default privileges in schema public revoke truncate, trigger, references on tables from authenticated;

-- 2) Username lookup ------------------------------------------------------------
-- Read the real login email from auth.users (profiles.email is empty for accounts
-- created without an email, which made those accounts unable to sign in), and make
-- the function callable only by the server (Edge Functions use the service role).
create or replace function public.resolve_auth_username(p_username text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select u.email
  from public.profiles p
  join auth.users u on u.id = p.id
  where lower(p.username) = lower(trim(p_username))
  limit 1
$$;
revoke all on function public.resolve_auth_username(text) from public, anon, authenticated;
grant execute on function public.resolve_auth_username(text) to service_role;

-- 3) Approval RPCs: signed-in only (they already check owner/superuser inside) ----
revoke all on function public.approve_payment(uuid) from public, anon;
revoke all on function public.approve_expense(uuid) from public, anon;
grant execute on function public.approve_payment(uuid) to authenticated;
grant execute on function public.approve_expense(uuid) to authenticated;

-- 4) Row consistency -----------------------------------------------------------
-- A payment / due must point to an apartment inside the same building, otherwise
-- money could be posted to another building's treasury on approval.
create or replace function private.enforce_apartment_building()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.apartments a
    where a.id = new.apartment_id and a.building_id = new.building_id
  ) then
    raise exception 'الشقة لا تتبع هذه العمارة';
  end if;
  if tg_table_name = 'payments' and new.monthly_due_id is not null and not exists (
    select 1 from public.monthly_dues d
    where d.id = new.monthly_due_id and d.apartment_id = new.apartment_id
  ) then
    raise exception 'المستحق لا يخص هذه الشقة';
  end if;
  return new;
end;
$$;
revoke all on function private.enforce_apartment_building() from public, anon, authenticated;

drop trigger if exists payments_apartment_building on public.payments;
create trigger payments_apartment_building
  before insert or update of building_id, apartment_id, monthly_due_id on public.payments
  for each row execute function private.enforce_apartment_building();

drop trigger if exists monthly_dues_apartment_building on public.monthly_dues;
create trigger monthly_dues_apartment_building
  before insert or update of building_id, apartment_id on public.monthly_dues
  for each row execute function private.enforce_apartment_building();

-- 5) Rate limiting --------------------------------------------------------------
create table if not exists private.rate_limits (
  key text primary key,
  window_start timestamptz not null default now(),
  hits integer not null default 0
);
alter table private.rate_limits enable row level security;
revoke all on private.rate_limits from public, anon, authenticated;

-- Returns true when the action is allowed, false when the limit is reached.
create or replace function public.rate_limit_hit(p_key text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_hits integer;
begin
  insert into private.rate_limits as r (key, window_start, hits)
  values (p_key, now(), 1)
  on conflict (key) do update
    set hits = case when r.window_start < now() - make_interval(secs => p_window_seconds) then 1 else r.hits + 1 end,
        window_start = case when r.window_start < now() - make_interval(secs => p_window_seconds) then now() else r.window_start end
  returning hits into v_hits;

  -- light housekeeping
  if random() < 0.02 then
    delete from private.rate_limits where window_start < now() - interval '1 day';
  end if;

  return v_hits <= p_max;
end;
$$;
revoke all on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;
