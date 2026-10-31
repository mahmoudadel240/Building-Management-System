-- Per-building limit of users per apartment, and disabled (removed) accounts.
-- Applied to the live project (vebrbzqzjuqpsgcznbba) on 2026-11-01.

alter table public.buildings
  add column if not exists max_residents_per_apartment smallint not null default 2;
do $$ begin
  alter table public.buildings add constraint buildings_max_residents_check check (max_residents_per_apartment between 1 and 10);
exception when duplicate_object then null; end $$;

-- The limit now comes from the building (it was a fixed 2). Security definer so the
-- count sees every approved link, whatever the caller can read.
create or replace function private.enforce_two_approved_residents()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_limit smallint;
begin
  if new.status = 'approved'::public.review_status then
    select b.max_residents_per_apartment into v_limit
      from public.apartments a join public.buildings b on b.id = a.building_id
     where a.id = new.apartment_id;
    if (select count(*) from public.apartment_residents ar
         where ar.apartment_id = new.apartment_id
           and ar.status = 'approved'::public.review_status
           and ar.id is distinct from new.id) >= coalesce(v_limit, 2) then
      raise exception 'الشقة دي وصلت للحد الأقصى: % مستخدم', coalesce(v_limit, 2);
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.enforce_two_approved_residents() from public, anon, authenticated;

-- A removed account keeps its history (payments, approvals) but can't sign in and is
-- hidden from lists. Set only by the manage-user Edge Function.
alter table public.profiles add column if not exists disabled_at timestamptz;
