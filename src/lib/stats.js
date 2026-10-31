import { thisMonth } from './format';

const sum = (rows, f) => rows.reduce((s, r) => s + Number(f(r) || 0), 0);

export function treasuryBalance(data, has) {
  const opening = sum(data.accounts.filter(has), (a) => a.opening_balance);
  const moves = sum(data.transactions.filter(has), (t) => (t.direction === 'in' ? 1 : -1) * t.amount);
  return opening + moves;
}

export function monthCollection(data, has, period = thisMonth()) {
  const dues = data.dues.filter((d) => has(d) && d.period_month === period);
  const due = sum(dues, (d) => d.amount_due);
  const paid = sum(dues, (d) => d.paid_amount);
  return { due, paid, rate: due ? Math.round((paid / due) * 100) : 0, count: dues.length, paidCount: dues.filter((d) => Number(d.paid_amount) >= Number(d.amount_due)).length };
}

export function outstanding(data, has) {
  const rows = data.balances.filter(has);
  return { amount: sum(rows, (b) => b.balance), apartments: rows.filter((b) => Number(b.balance) > 0).length };
}

export const balanceOf = (data, apartmentId) => data.balances.find((b) => b.apartment_id === apartmentId);

export function residentsOf(data, apartmentId) {
  return data.links
    .filter((l) => l.apartment_id === apartmentId && l.status === 'approved')
    .map((l) => data.profiles.find((p) => p.id === l.user_id))
    .filter(Boolean);
}

export const feeOf = (data, buildingId) => data.subscriptions.find((s) => s.building_id === buildingId)?.monthly_amount;
