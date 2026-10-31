import React from 'react';
import { Dialog, Table, StatusPill } from '../components/ui';
import { money, month, date, months, personName, METHOD_LABEL } from '../lib/format';
import { balanceOf, residentsOf, feeOf } from '../lib/stats';

// Everything about one apartment: what it owes, any advance payment, month by month,
// and every payment recorded for it.
export default function ApartmentDetails({ open, onClose, data, apartment, onEdit, onPay }) {
  if (!apartment) return null;
  const b = data.buildings.find((x) => x.id === apartment.building_id);
  const bal = balanceOf(data, apartment.id) || {};
  const owed = Number(bal.balance || 0);
  const credit = Number(bal.credit || 0);
  const fee = Number(feeOf(data, apartment.building_id) || 0);
  const coversMonths = fee > 0 ? Math.floor(credit / fee) : 0;
  const dues = data.dues.filter((d) => d.apartment_id === apartment.id).sort((x, y) => (x.period_month < y.period_month ? 1 : -1));
  const pays = data.payments.filter((p) => p.apartment_id === apartment.id);
  const people = residentsOf(data, apartment.id);
  const lastPaid = dues.filter((d) => Number(d.paid_amount) >= Number(d.amount_due)).map((d) => d.period_month).sort().pop();

  return (
    <Dialog open={open} onClose={onClose} size="wide"
      title={`شقة ${apartment.unit_number}`}
      subtitle={`${b?.name || ''}${apartment.floor_label ? ` · الدور ${apartment.floor_label}` : ''}${apartment.is_active === false ? ' · موقوفة' : ''}`}>
      <div className="detail-stats">
        <div className={owed > 0 ? 'bad' : 'good'}>
          <small>{owed > 0 ? 'متأخرات' : 'المتأخرات'}</small>
          <strong>{money(owed)}</strong>
          <span>{owed > 0 ? `متأخر ${months(bal.unpaid_months)}` : lastPaid ? `مسدد لحد ${month(lastPaid)}` : 'مفيش مستحقات لسه'}</span>
        </div>
        <div className={credit > 0 ? 'good' : ''}>
          <small>رصيد مدفوع مقدماً</small>
          <strong>{money(credit)}</strong>
          <span>{credit > 0 ? (coversMonths ? `يغطي حوالي ${months(coversMonths)} قدام` : 'هيتخصم من الشهر الجاي') : 'مفيش دفع مقدم'}</span>
        </div>
        <div>
          <small>إجمالي المدفوع المعتمد</small>
          <strong>{money(bal.total_payments || 0)}</strong>
          <span>الاشتراك الشهري {money(fee)}</span>
        </div>
      </div>

      <div className="detail-people">
        <small>السكان</small>
        {people.length ? people.map((p) => <span key={p.id} className="chip">{personName(p)}</span>) : <span className="muted-text">بدون ساكن</span>}
      </div>

      <h4 className="detail-title">المستحقات شهر بشهر</h4>
      <Table empty="لا توجد مستحقات بعد" headers={['الشهر', 'المستحق', 'المدفوع', 'الباقي', 'الحالة']} rows={dues.map((d) => {
        const left = Number(d.amount_due) - Number(d.paid_amount);
        return (
          <tr key={d.id}>
            <td><b>{month(d.period_month)}</b></td>
            <td>{money(d.amount_due)}</td>
            <td>{money(d.paid_amount)}</td>
            <td>{left > 0 ? money(left) : '—'}</td>
            <td><span className={'pill ' + (left <= 0 ? 'success' : Number(d.paid_amount) > 0 ? 'warning' : 'danger')}>{left <= 0 ? 'مسدد' : Number(d.paid_amount) > 0 ? 'مسدد جزئياً' : 'غير مسدد'}</span></td>
          </tr>
        );
      })} />

      <h4 className="detail-title">الدفعات</h4>
      <Table empty="مفيش دفعات مسجلة" headers={['التاريخ', 'المبلغ', 'الطريقة', 'الحالة']} rows={pays.map((p) => (
        <tr key={p.id}>
          <td>{date(p.created_at)}</td>
          <td><b>{money(p.amount)}</b>{p.reference && <span className="cell-sub">رقم {p.reference}</span>}</td>
          <td>{METHOD_LABEL[p.payment_method] || p.payment_method}</td>
          <td><StatusPill status={p.status} /></td>
        </tr>
      ))} />

      <div className="dialog-actions">
        {onEdit && <button type="button" className="outline" onClick={onEdit}>تعديل بيانات الشقة</button>}
        <span className="spacer" />
        {onPay && <button type="button" className="primary" onClick={onPay}>سجّل دفعة</button>}
      </div>
    </Dialog>
  );
}
