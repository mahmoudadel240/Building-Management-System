-- Fixed (recurring) expenses and a fixed / variable kind on every expense.
-- NOT applied yet: the apply call timed out waiting for approval. Apply before shipping code that uses it.

create table if not exists public.recurring_expenses (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  category text not null,
  amount numeric(12,2) not null check (amount > 0),
  vendor text,
  is_active boolean not null default true,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
alter table public.recurring_expenses enable row level security;
revoke all on public.recurring_expenses from anon;
grant select, insert, update, delete on public.recurring_expenses to authenticated;

drop policy if exists recurring_select on public.recurring_expenses;
create policy recurring_select on public.recurring_expenses for select to authenticated
  using (private.can_admin(building_id));
drop policy if exists recurring_insert on public.recurring_expenses;
create policy recurring_insert on public.recurring_expenses for insert to authenticated
  with check (private.can_admin(building_id));
drop policy if exists recurring_update on public.recurring_expenses;
create policy recurring_update on public.recurring_expenses for update to authenticated
  using (private.can_admin(building_id)) with check (private.can_admin(building_id));
drop policy if exists recurring_delete on public.recurring_expenses;
create policy recurring_delete on public.recurring_expenses for delete to authenticated
  using (private.can_admin(building_id));

drop trigger if exists recurring_expenses_audit on public.recurring_expenses;
create trigger recurring_expenses_audit after insert or update or delete on public.recurring_expenses
  for each row execute function private.write_audit();

alter table public.expenses
  add column if not exists expense_kind text not null default 'variable',
  add column if not exists recurring_id uuid references public.recurring_expenses(id) on delete set null;
do $$ begin
  alter table public.expenses add constraint expenses_kind_check check (expense_kind in ('fixed','variable'));
exception when duplicate_object then null; end $$;

-- one payment of each fixed expense per month (a rejected one can be redone)
create unique index if not exists expenses_recurring_month_uq
  on public.expenses (recurring_id, (expense_date - (extract(day from expense_date)::int - 1)))
  where recurring_id is not null and status <> 'rejected';
