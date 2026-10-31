import React from 'react';
import { PageHead, Panel, Stat, Table, StatusPill } from '../components/ui';
import { money, num, month, thisMonth, date } from '../lib/format';
import { treasuryBalance, monthCollection, outstanding, feeOf } from '../lib/stats';

export default function Overview({ data, me, scoped, setPage }) {
  const has = scoped.has;
  const balance = treasuryBalance(data, has);
  const coll = monthCollection(data, has);
  const owed = outstanding(data, has);
  const pending = [...data.payments.filter((p) => has(p) && p.status === 'pending').map((p) => ({ ...p, kind: 'payment' })),
    ...data.expenses.filter((x) => has(x) && x.status === 'pending').map((x) => ({ ...x, kind: 'expense' }))]
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  const apts = data.apartments.filter(has);
  const aptName = (id) => data.apartments.find((a) => a.id === id)?.unit_number;
  const bName = (id) => data.buildings.find((b) => b.id === id)?.name;

  return (
    <>
      <PageHead title="الرئيسية" subtitle={`ملخص ${month(thisMonth())}`} />

      <div className="stats">
        <Stat big label="الرصيد الحالي في الخزنة" value={money(balance)} hint={`${num(scoped.buildings.length)} عمارة · ${num(apts.length)} شقة`} />
        <Stat label="تحصيل الشهر" value={`${coll.rate}%`} hint={`${money(coll.paid)} من ${money(coll.due)}`} tone={coll.rate >= 80 ? 'good' : coll.rate >= 40 ? '' : 'warn'} />
        <Stat label="مستحقات متأخرة" value={money(owed.amount)} hint={`${num(owed.apartments)} شقة عليها مبالغ`} tone={owed.amount > 0 ? 'warn' : 'good'} />
        <Stat label="في انتظار الاعتماد" value={num(pending.length)} hint="تحصيلات ومصروفات" tone={pending.length ? 'warn' : ''} />
      </div>

      {pending.length > 0 && (
        <Panel title="في انتظار الاعتماد" action={<button className="text-btn" onClick={() => setPage(pending[0].kind === 'payment' ? 'payments' : 'expenses')}>عرض الكل</button>}>
          <Table headers={['النوع', 'العمارة', 'التفاصيل', 'المبلغ', 'التاريخ', 'الحالة']} rows={pending.slice(0, 6).map((r) => (
            <tr key={r.kind + r.id}>
              <td>{r.kind === 'payment' ? 'تحصيل' : 'مصروف'}</td>
              <td>{bName(r.building_id)}</td>
              <td>{r.kind === 'payment' ? `شقة ${aptName(r.apartment_id)}` : r.title}</td>
              <td><b>{money(r.amount)}</b></td>
              <td>{date(r.created_at)}</td>
              <td><StatusPill status={r.status} /></td>
            </tr>
          ))} />
          {!me.isOwner && <p className="muted-text small">الاعتماد بيكون من مالك النظام.</p>}
        </Panel>
      )}

      <Panel title="العمارات">
        <Table empty="لا توجد عمارات بعد" headers={['العمارة', 'الشقق', 'الاشتراك الشهري', 'تحصيل الشهر', 'متأخرات', 'الخزنة']} rows={scoped.buildings.map((b) => {
          const one = (r) => r.building_id === b.id;
          const c = monthCollection(data, one);
          return (
            <tr key={b.id}>
              <td><b>{b.name}</b><span className="cell-sub">{b.address}</span></td>
              <td>{num(b.apartment_count)}</td>
              <td>{money(feeOf(data, b.id))}</td>
              <td><div className="meter"><i style={{ width: c.rate + '%' }} /></div><span className="cell-sub">{c.paidCount} من {c.count} شقة</span></td>
              <td>{money(outstanding(data, one).amount)}</td>
              <td><b>{money(treasuryBalance(data, one))}</b></td>
            </tr>
          );
        })} />
      </Panel>
    </>
  );
}
