import React, { useState } from 'react';
import { PageHead, Panel, Table, StatusPill } from '../components/ui';
import { ReviewButtons } from '../components/Review.jsx';
import { money, date, METHOD_LABEL, personName } from '../lib/format';
import PaymentDialog from './PaymentDialog.jsx';

const TABS = [['all', 'الكل'], ['pending', 'قيد المراجعة'], ['approved', 'معتمد'], ['rejected', 'مرفوض']];

export default function Payments({ data, me, scoped, act }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState(me.isOwner ? 'pending' : 'all');
  const rows = data.payments
    .filter((p) => (me.isAdmin ? scoped.has(p) : me.myApartments.includes(p.apartment_id)))
    .filter((p) => tab === 'all' || p.status === tab);
  const count = (s) => data.payments.filter((p) => scoped.has(p) && p.status === s).length;
  const apt = (id) => data.apartments.find((a) => a.id === id);
  const bName = (id) => data.buildings.find((b) => b.id === id)?.name;
  const who = (id) => personName(data.profiles.find((p) => p.id === id));

  return (
    <>
      <PageHead
        title="التحصيلات"
        subtitle={me.isOwner ? 'راجع الدفعات واعتمدها عشان تدخل الخزنة' : 'الدفعات بتدخل الخزنة بعد اعتماد المالك'}
        action={<button className="primary" onClick={() => setOpen(true)}>＋ تسجيل دفعة</button>}
      />
      <div className="tabs" role="tablist">
        {TABS.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>
            {l}{k === 'pending' && count('pending') > 0 && <span className="badge">{count('pending')}</span>}
          </button>
        ))}
      </div>
      <Panel>
        <Table
          empty={tab === 'pending' ? 'مفيش دفعات مستنية الاعتماد' : 'مفيش دفعات'}
          headers={['التاريخ', 'العمارة', 'الشقة', 'المبلغ', 'الطريقة', 'سجّلها', 'الحالة', '']}
          rows={rows.map((p) => (
            <tr key={p.id}>
              <td>{date(p.created_at)}</td>
              <td>{bName(p.building_id)}</td>
              <td>شقة {apt(p.apartment_id)?.unit_number}</td>
              <td><b>{money(p.amount)}</b>{p.reference && <span className="cell-sub">رقم {p.reference}</span>}</td>
              <td>{METHOD_LABEL[p.payment_method] || p.payment_method}</td>
              <td>{who(p.submitted_by)}</td>
              <td><StatusPill status={p.status} /></td>
              <td>{me.isOwner && p.status === 'pending' && (
                <ReviewButtons kind="payment" row={p} act={act} label={`${bName(p.building_id)} – شقة ${apt(p.apartment_id)?.unit_number}`} />
              )}</td>
            </tr>
          ))}
        />
      </Panel>
      <PaymentDialog open={open} onClose={() => setOpen(false)} data={data} me={me} act={act} />
    </>
  );
}
