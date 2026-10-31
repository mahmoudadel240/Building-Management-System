-- Monthly dues, rejections, audit log, apartment count sync, admins can see their people.
-- Applied to the live project (vebrbzqzjuqpsgcznbba) on 2026-10-31.

-- 1) Keep buildings.apartment_count equal to the real number of active apartments ---------
create or replace function private.sync_apartment_count()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare ids uuid[] := '{}'; b uuid;
begin
  if tg_op in ('UPDATE','DELETE') then ids := ids || old.building_id; end if;
  if tg_op in ('UPDATE','INSERT') then ids := ids || new.building_id; end if;
  foreach b in array ids loop
    update public.buildings
       set apartment_count = (select count(*) from public.apartments a where a.building_id = b and a.is_active)
     where id = b;
  end loop;
  return null;
end;
$$;
revoke all on function private.sync_apartment_count() from public, anon, authenticated;
drop trigger if exists apartments_sync_count on public.apartments;
create trigger apartments_sync_count
  after insert or delete or update of building_id, is_active on public.apartments
  for each row execute function private.sync_apartment_count();
update public.buildings b
   set apartment_count = (select count(*) from public.apartments a where a.building_id = b.id and a.is_active);

-- 2) Monthly dues ---------------------------------------------------------------------
-- Creates the missing dues (one per active apartment per month) from the subscription's
-- start month up to the current month. Safe to call any number of times.
create or replace function public.generate_monthly_dues(p_building uuid default null)
returns integer language plpgsql security definer set search_path = ''
as $$
declare
  s record; m date; created integer := 0; n integer;
  this_month date := date_trunc('month', now())::date;
begin
  for s in
    select ss.building_id, ss.monthly_amount,
           greatest(date_trunc('month', ss.effective_from)::date,
                    coalesce((select (max(d.period_month) + interval '1 month')::date
                                from public.monthly_dues d where d.building_id = ss.building_id),
                             date_trunc('month', ss.effective_from)::date)) as start_month
      from public.subscription_settings ss
      join public.buildings b on b.id = ss.building_id and b.is_active
     where ss.monthly_amount > 0
       and (p_building is null or ss.building_id = p_building)
       and private.can_admin(ss.building_id)
  loop
    m := s.start_month;
    while m <= this_month loop
      insert into public.monthly_dues (building_id, apartment_id, period_month, amount_due)
      select a.building_id, a.id, m, s.monthly_amount
        from public.apartments a
       where a.building_id = s.building_id and a.is_active
      on conflict (apartment_id, period_month) do nothing;
      get diagnostics n = row_count;
      created := created + n;
      m := (m + interval '1 month')::date;
    end loop;
  end loop;
  return created;
end;
$$;
revoke all on function public.generate_monthly_dues(uuid) from public, anon;
grant execute on function public.generate_monthly_dues(uuid) to authenticated;

-- Approving a payment now pays off the apartment's oldest unpaid months first
-- (unless the payment was tied to a specific month).
create or replace function public.approve_payment(p uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare v public.payments%rowtype; aid uuid; left_amount numeric; d record; part numeric;
begin
  if not private.is_owner() then raise exception 'الاعتماد للمالك فقط'; end if;
  select * into v from public.payments where id = p for update;
  if not found or v.status <> 'pending' then raise exception 'التحصيل غير متاح للاعتماد'; end if;
  select id into aid from public.treasury_accounts where building_id = v.building_id;
  if aid is null then raise exception 'لا توجد خزنة لهذه العمارة'; end if;

  if v.monthly_due_id is not null then
    update public.monthly_dues set paid_amount = paid_amount + v.amount
     where id = v.monthly_due_id and paid_amount + v.amount <= amount_due;
    if not found then raise exception 'المبلغ أكبر من المستحق لهذا الشهر'; end if;
  else
    left_amount := v.amount;
    for d in
      select id, amount_due - paid_amount as remaining from public.monthly_dues
       where apartment_id = v.apartment_id and paid_amount < amount_due
       order by period_month for update
    loop
      exit when left_amount <= 0;
      part := least(left_amount, d.remaining);
      update public.monthly_dues set paid_amount = paid_amount + part where id = d.id;
      left_amount := left_amount - part;
    end loop;
  end if;

  update public.payments set status = 'approved', approved_by = (select auth.uid()), approved_at = now() where id = p;
  insert into public.treasury_transactions (building_id, account_id, direction, amount, source_type, source_id, description, created_by)
  values (v.building_id, aid, 'in', v.amount, 'payment', v.id, 'تحصيل شقة', (select auth.uid()));
end;
$$;

-- 3) Rejections -------------------------------------------------------------------------
create or replace function public.reject_payment(p uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_owner() then raise exception 'الرفض للمالك فقط'; end if;
  update public.payments set status = 'rejected', approved_by = (select auth.uid()), approved_at = now()
   where id = p and status = 'pending';
  if not found then raise exception 'التحصيل غير متاح للرفض'; end if;
end;
$$;
create or replace function public.reject_expense(p uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_owner() then raise exception 'الرفض للمالك فقط'; end if;
  update public.expenses set status = 'rejected', approved_by = (select auth.uid()), approved_at = now()
   where id = p and status = 'pending';
  if not found then raise exception 'المصروف غير متاح للرفض'; end if;
end;
$$;
revoke all on function public.reject_payment(uuid) from public, anon;
revoke all on function public.reject_expense(uuid) from public, anon;
grant execute on function public.reject_payment(uuid) to authenticated;
grant execute on function public.reject_expense(uuid) to authenticated;

-- 4) Balance per apartment (respects the caller's RLS) ---------------------------------
create or replace view public.apartment_balances with (security_invoker = true) as
select d.apartment_id, d.building_id,
       sum(d.amount_due) as total_due,
       sum(d.paid_amount) as total_paid,
       sum(d.amount_due - d.paid_amount) as balance,
       count(*) filter (where d.paid_amount < d.amount_due) as unpaid_months
  from public.monthly_dues d
 group by d.apartment_id, d.building_id;
revoke all on public.apartment_balances from anon;
grant select on public.apartment_balances to authenticated;

-- 5) Audit log --------------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='audit_logs' and column_name='id' and is_identity='YES') then
    create sequence if not exists public.audit_logs_id_seq owned by public.audit_logs.id;
    perform setval('public.audit_logs_id_seq', coalesce((select max(id) from public.audit_logs), 0) + 1, false);
    alter table public.audit_logs alter column id set default nextval('public.audit_logs_id_seq');
  end if;
end $$;

create or replace function private.write_audit()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare r jsonb; b uuid; o jsonb; n jsonb;
begin
  if tg_op in ('UPDATE','DELETE') then o := to_jsonb(old); end if;
  if tg_op in ('UPDATE','INSERT') then n := to_jsonb(new); end if;
  r := coalesce(n, o);
  -- skip the automatic apartment-count refresh on buildings
  if tg_table_name = 'buildings' and tg_op = 'UPDATE'
     and (o - 'apartment_count' - 'updated_at') = (n - 'apartment_count' - 'updated_at') then
    return null;
  end if;
  b := case when tg_table_name = 'buildings' then (r->>'id')::uuid else (r->>'building_id')::uuid end;
  if b is null and r ? 'apartment_id' then
    select a.building_id into b from public.apartments a where a.id = (r->>'apartment_id')::uuid;
  end if;
  -- a deleted building can't be referenced any more
  if tg_table_name = 'buildings' and tg_op = 'DELETE' then b := null; end if;
  insert into public.audit_logs (actor_id, building_id, action, entity_table, entity_id, old_data, new_data)
  values ((select auth.uid()), b, lower(tg_op), tg_table_name, (r->>'id')::uuid,
          o, n);
  return null;
end;
$$;
revoke all on function private.write_audit() from public, anon, authenticated;

do $$ declare t text; begin
  foreach t in array array['buildings','apartments','building_members','apartment_residents','payments','expenses','subscription_settings'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_audit', t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function private.write_audit()', t || '_audit', t);
  end loop;
end $$;

-- 6) Admins can see the profiles of people in their buildings ---------------------------
create or replace function private.can_see_profile(p uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select private.is_owner() or p = (select auth.uid())
      or exists (select 1 from public.building_members m where m.user_id = p and private.can_admin(m.building_id))
      or exists (select 1 from public.apartment_residents r join public.apartments a on a.id = r.apartment_id
                  where r.user_id = p and private.can_admin(a.building_id))
$$;
revoke all on function private.can_see_profile(uuid) from public, anon;
grant execute on function private.can_see_profile(uuid) to authenticated;
drop policy if exists profiles_self_owner on public.profiles;
drop policy if exists profiles_scope on public.profiles;
create policy profiles_scope on public.profiles for select to authenticated using (private.can_see_profile(id));

-- Admins (not only the owner) can see who lives in their building's apartments.
drop policy if exists bm_scope on public.building_members;
create policy bm_scope on public.building_members for select to authenticated
  using (private.is_owner() or user_id = (select auth.uid()) or private.can_admin(building_id));

-- 7) Fix: the consistency trigger read payments-only columns on monthly_dues rows.
create or replace function private.enforce_apartment_building()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.apartments a where a.id = new.apartment_id and a.building_id = new.building_id) then
    raise exception 'الشقة لا تتبع هذه العمارة';
  end if;
  if tg_table_name = 'payments' then
    if (to_jsonb(new)->>'monthly_due_id') is not null and not exists (
      select 1 from public.monthly_dues d
       where d.id = (to_jsonb(new)->>'monthly_due_id')::uuid and d.apartment_id = new.apartment_id) then
      raise exception 'المستحق لا يخص هذه الشقة';
    end if;
  end if;
  return new;
end;
$$;

-- 8) A user added to a building (e.g. a resident not linked to an apartment yet) can see that
-- building and its apartments, so they can request their apartment.
create or replace function private.can_building(p uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select private.can_admin(p)
      or exists (select 1 from public.apartment_residents r join public.apartments a on a.id = r.apartment_id
                  where a.building_id = p and r.user_id = (select auth.uid()) and r.status = 'approved'::public.review_status)
      or exists (select 1 from public.building_members m
                  where m.building_id = p and m.user_id = (select auth.uid()) and m.status = 'approved'::public.review_status)
$$;
