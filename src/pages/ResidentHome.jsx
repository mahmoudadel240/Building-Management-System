import React, { useState } from 'react';
import { PageHead, Panel, Table, StatusPill, Empty, FormDialog, SelectField } from '../components/ui';
import { money, month, date, num, METHOD_LABEL } from '../lib/format';
import { balanceOf } from '../lib/stats';
import { supabase } from '../lib/supabase';
import PaymentDialog from './PaymentDialog.jsx';

// What a resident sees first: their apartment, what they owe, and their payments.
export default function ResidentHome({ data, me, act }) {
  const [paying, setPaying] = useState(null);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const mine = data.apartments.filter((a) => me.myApartments.includes(a.id));
  const pendingLinks = data.links.filter((l) => l.user_id === me.id && l.status === 'pending');
  const bName = (id) => data.buildings.find((b) => b.id === id)?.name;

  async function request(fd) {
    setBusy(true);
    const err = await act(() => supabase.from('apartment_residents').insert({ apartment_id: fd.get('apartment_id'), user_id: me.id, requested_by: me.id, status: 'pending' }), 'تم إرسال الطلب للمراجعة');
    setBusy(false); setError(err);
    return !err;
  }

  return (
    <>
      <PageHead title={`أهلاً ${me.profile?.display_name || ''}`.trim()} subtitle="شقتك ومستحقاتك ودفعاتك" />

      {mine.length === 0 && (
        <Panel>
          <Empty>
            {pendingLinks.length ? 'طلب ربط شقتك قيد المراجعة من الإدارة.'
              : data.apartments.length ? 'حسابك مش مربوط بشقة لسه.'
              : 'حسابك مش مربوط بأي عمارة لسه. تواصل مع إدارة العمارة.'}
            {!pendingLinks.length && data.apartments.length > 0 && <div><button className="primary" onClick={() => { setError(''); setRequesting(true); }}>اطلب ربط شقتك</button></div>}
          </Empty>
        </Panel>
      )}

      <div className="cards-grid">
        {mine.map((a) => {
          const bal = balanceOf(data, a.id);
          const owes = Number(bal?.balance || 0) > 0;
          return (
            <div key={a.id} className={'apt-card ' + (owes ? 'owes' : 'clear')}>
              <span className="muted-text">{bName(a.building_id)}</span>
              <h3>شقة {a.unit_number}{a.floor_label ? ` · الدور ${a.floor_label}` : ''}</h3>
              <div className="apt-balance">
                <small>{owes ? 'المطلوب سداده' : 'مفيش مستحقات'}</small>
                <strong>{money(bal?.balance || 0)}</strong>
                {owes && <small>{num(bal.unpaid_months)} شهر غير مسدد</small>}
              </div>
              <button className="primary full" onClick={() => setPaying(a)}>سجّل دفعة</button>
            </div>
          );
        })}
      </div>

      {mine.length > 0 && (
        <Panel title="المستحقات الشهرية">
          <Table empty="لا توجد مستحقات بعد" headers={['الشهر', 'الشقة', 'المستحق', 'المدفوع', 'الحالة']} rows={data.dues.filter((d) => me.myApartments.includes(d.apartment_id)).map((d) => {
            const done = Number(d.paid_amount) >= Number(d.amount_due);
            return (
              <tr key={d.id}>
                <td><b>{month(d.period_month)}</b></td>
                <td>{data.apartments.find((a) => a.id === d.apartment_id)?.unit_number}</td>
                <td>{money(d.amount_due)}</td>
                <td>{money(d.paid_amount)}</td>
                <td><span className={'pill ' + (done ? 'success' : Number(d.paid_amount) > 0 ? 'warning' : 'danger')}>{done ? 'مسدد' : Number(d.paid_amount) > 0 ? 'مسدد جزئياً' : 'غير مسدد'}</span></td>
              </tr>
            );
          })} />
        </Panel>
      )}

      {mine.length > 0 && (
        <Panel title="دفعاتي">
          <Table empty="مفيش دفعات مسجلة" headers={['التاريخ', 'الشقة', 'المبلغ', 'الطريقة', 'الحالة']} rows={data.payments.filter((p) => me.myApartments.includes(p.apartment_id)).map((p) => (
            <tr key={p.id}>
              <td>{date(p.created_at)}</td>
              <td>{data.apartments.find((a) => a.id === p.apartment_id)?.unit_number}</td>
              <td><b>{money(p.amount)}</b></td>
              <td>{METHOD_LABEL[p.payment_method] || p.payment_method}</td>
              <td><StatusPill status={p.status} /></td>
            </tr>
          ))} />
        </Panel>
      )}

      <PaymentDialog open={!!paying} onClose={() => setPaying(null)} data={data} me={me} act={act} apartment={paying} />

      <FormDialog
        open={requesting} onClose={() => setRequesting(false)} title="طلب ربط شقة" subtitle="الإدارة هتراجع الطلب وتوافق عليه"
        submitLabel="إرسال الطلب" error={error} busy={busy} onSubmit={request}
        steps={[{ content: (
          <SelectField full label="الشقة" name="apartment_id" required placeholder="اختار شقتك"
            options={data.apartments.map((a) => ({ value: a.id, label: `${bName(a.building_id)} – شقة ${a.unit_number}` }))} />
        ) }]}
      />
    </>
  );
}
