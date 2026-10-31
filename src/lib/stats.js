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

// Where an apartment stands going forward: the month it's paid through (counting any
// advance credit) and the date + amount of its next payment.
export function nextPayment(data, apartmentId) {
  const apt = data.apartments.find((a) => a.id === apartmentId);
  if (!apt) return null;
  const sub = data.subscriptions.find((s) => s.building_id === apt.building_id);
  const fee = Number(sub?.monthly_amount || 0);
  if (!fee) return null;
  const dueDay = Number(sub?.due_day || 1);
  const dues = data.dues.filter((d) => d.apartment_id === apartmentId).sort((a, b) => (a.period_month < b.period_month ? -1 : 1));
  const firstUnpaid = dues.find((d) => Number(d.paid_amount) < Number(d.amount_due));
  const at = (ym) => `${ym.slice(0, 7)}-${String(dueDay).padStart(2, '0')}`;
  const addMonth = (ym) => { const [y, m] = ym.split('-').map(Number); return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`; };

  // Something is still owed: the next payment is that month's remainder.
  if (firstUnpaid) {
    const lastPaid = dues.filter((d) => d.period_month < firstUnpaid.period_month && Number(d.paid_amount) >= Number(d.amount_due)).pop();
    return { paidThrough: lastPaid?.period_month || null, date: at(firstUnpaid.period_month), amount: Number(firstUnpaid.amount_due) - Number(firstUnpaid.paid_amount), overdue: true };
  }

  // All generated months are paid; spend the advance credit on the coming months.
  let credit = Number(data.balances.find((b) => b.apartment_id === apartmentId)?.credit || 0);
  let paidThrough = dues.length ? dues[dues.length - 1].period_month : null;
  let m = paidThrough ? addMonth(paidThrough) : new Date().toISOString().slice(0, 7) + '-01';
  while (credit >= fee) { credit -= fee; paidThrough = m; m = addMonth(m); }
  return { paidThrough, date: at(m), amount: fee - credit, overdue: false };
}
