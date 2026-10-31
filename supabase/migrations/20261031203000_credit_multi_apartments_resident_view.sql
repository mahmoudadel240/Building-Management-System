-- Advance payments (credit), one user on several apartments, residents can see
-- their building's approved expenses and treasury, admins can edit apartments.
-- Applied to the live project (vebrbzqzjuqpsgcznbba) on 2026-10-31.

-- 1) Credit ------------------------------------------------------------------------------
-- An apartment's credit = approved payments not yet used on a month. It is spent on the
-- oldest unpaid months, now and whenever new months are generated.
create or replace function private.apply_credit(p_apartment uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare left_amount numeric; d record; part numeric;
begin
  left_amount := coalesce((select sum(amount) from public.payments where apartment_id = p_apartment and status = 'approved'), 0)
               - coalesce((select sum(paid_amount) from public.monthly_dues where apartment_id = p_apartment), 0);
  if left_amount <= 0 then return; end if;
  for d in
    select id, amount_due - paid_amount as remaining from public.monthly_dues
     where apartment_id = p_apartment and paid_amount < amount_due
     order by period_month for update
  loop
    exit when left_amount <= 0;
    part := least(left_amount, d.remaining);
    update public.monthly_dues set paid_amount = paid_amount + part where id = d.id;
    left_amount := left_amount - part;
  end loop;
end;
$$;
revoke all on function private.apply_credit(uuid) from public, anon, authenticated;

create or replace function public.approve_payment(p uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare v public.payments%rowtype; aid uuid;
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
  end if;
  update public.payments set status = 'approved', approved_by = (select auth.uid()), approved_at = now() where id = p;
  perform private.apply_credit(v.apartment_id);
  insert into public.treasury_transactions (building_id, account_id, direction, amount, source_type, source_id, description, created_by)
  values (v.building_id, aid, 'in', v.amount, 'payment', v.id, 'تحصيل شقة', (select auth.uid()));
end;
$$;

-- Same generator as before, then spends any credit on the new months.
create or replace function public.generate_monthly_dues(p_building uuid default null)
returns integer language plpgsql security definer set search_path = ''
as $$
declare
  s record; m date; created integer := 0; n integer; a record;
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
      select a2.building_id, a2.id, m, s.monthly_amount
        from public.apartments a2
       where a2.building_id = s.building_id and a2.is_active
      on conflict (apartment_id, period_month) do nothing;
      get diagnostics n = row_count;
      created := created + n;
      m := (m + interval '1 month')::date;
    end loop;
    for a in select id from public.apartments where building_id = s.building_id loop
      perform private.apply_credit(a.id);
    end loop;
  end loop;
  return created;
end;
$$;

-- Balances per apartment, now with total payments and credit (respects RLS).
drop view if exists public.apartment_balances;
create view public.apartment_balances with (security_invoker = true) as
select a.id as apartment_id, a.building_id,
       coalesce(d.total_due, 0) as total_due,
       coalesce(d.total_paid, 0) as total_paid,
       coalesce(d.balance, 0) as balance,
       coalesce(d.unpaid_months, 0) as unpaid_months,
       coalesce(p.total_payments, 0) as total_payments,
       greatest(coalesce(p.total_payments, 0) - coalesce(d.total_paid, 0), 0) as credit
  from public.apartments a
  left join (select apartment_id, sum(amount_due) total_due, sum(paid_amount) total_paid,
                    sum(amount_due - paid_amount) balance,
                    count(*) filter (where paid_amount < amount_due) unpaid_months
               from public.monthly_dues group by apartment_id) d on d.apartment_id = a.id
  left join (select apartment_id, sum(amount) total_payments
               from public.payments where status = 'approved' group by apartment_id) p on p.apartment_id = a.id
 where d.apartment_id is not null or p.apartment_id is not null;
revoke all on public.apartment_balances from anon;
grant select on public.apartment_balances to authenticated;

-- 2) Residents see their building's approved expenses and its treasury ---------------
drop policy if exists expenses_scope on public.expenses;
create policy expenses_scope on public.expenses for select to authenticated
  using (private.can_admin(building_id) or (status = 'approved' and private.can_building(building_id)));
drop policy if exists treasury_scope on public.treasury_accounts;
create policy treasury_scope on public.treasury_accounts for select to authenticated
  using (private.can_building(building_id));
drop policy if exists tx_scope on public.treasury_transactions;
create policy tx_scope on public.treasury_transactions for select to authenticated
  using (private.can_building(building_id));

-- 3) One user on several apartments -----------------------------------------------------
-- Building admins can link any user to apartments in their building (approved right away).
drop policy if exists ar_admin_link on public.apartment_residents;
create policy ar_admin_link on public.apartment_residents for insert to authenticated
  with check (exists (select 1 from public.apartments a where a.id = apartment_id and private.can_admin(a.building_id)));
-- No duplicate active link between the same user and apartment.
create unique index if not exists apartment_residents_active_unique
  on public.apartment_residents (apartment_id, user_id) where status in ('pending', 'approved');

-- 4) Building admins can edit apartments (owner still adds/removes them) --------------
drop policy if exists apartments_admin_update on public.apartments;
create policy apartments_admin_update on public.apartments for update to authenticated
  using (private.can_admin(building_id)) with check (private.can_admin(building_id));

-- 5) Spend existing credit now ------------------------------------------------------------
do $$ declare a record; begin
  for a in select id from public.apartments loop perform private.apply_credit(a.id); end loop;
end $$;
