import React, { useState } from 'react';
import { PageHead, Panel, Table, FormDialog, Field, SelectField, Empty } from '../components/ui';
import { money, num, months, personName } from '../lib/format';
import { balanceOf, residentsOf } from '../lib/stats';
import { supabase } from '../lib/supabase';
import ApartmentDetails from './ApartmentDetails.jsx';
import PaymentDialog from './PaymentDialog.jsx';

export default function Apartments({ data, me, scoped, act }) {
  const [details, setDetails] = useState(null);
  const [editing, setEditing] = useState(null);
  const [paying, setPaying] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('all'); // all | owing | credit

  async function save(fd) {
    setBusy(true);
    const area = fd.get('area_sqm');
    const err = await act(() => supabase.from('apartments').update({
      unit_number: fd.get('unit_number').trim(),
      floor_label: fd.get('floor_label').trim() || null,
      area_sqm: area ? Number(area) : null,
      is_active: fd.get('is_active') === 'true',
    }).eq('id', editing.id), 'اتعدلت بيانات الشقة');
    setBusy(false);
    setError(err && err.includes('duplicate') ? 'رقم الشقة ده موجود بالفعل في العمارة' : err);
    return !err;
  }

  const openEdit = (a) => { setError(''); setDetails(null); setEditing(a); };

  return (
    <>
      <PageHead title="الشقق والسكان" subtitle="مين ساكن فين، وكل شقة عليها كام أو دافعة مقدم" />
      <div className="tabs" role="tablist">
        {[['all', 'كل الشقق'], ['owing', 'عليها متأخرات'], ['credit', 'دافعة مقدم']].map(([k, l]) => (
          <button key={k} role="tab" aria-selected={filter === k} className={filter === k ? 'active' : ''} onClick={() => setFilter(k)}>{l}</button>
        ))}
      </div>

      {scoped.buildings.length === 0 && <Empty>لا توجد عمارات بعد</Empty>}
      {scoped.buildings.map((b) => {
        const apts = data.apartments.filter((a) => a.building_id === b.id)
          .filter((a) => {
            const bal = balanceOf(data, a.id);
            if (filter === 'owing') return Number(bal?.balance || 0) > 0;
            if (filter === 'credit') return Number(bal?.credit || 0) > 0;
            return true;
          })
          .sort((x, y) => x.unit_number.localeCompare(y.unit_number, 'ar', { numeric: true }));
        return (
          <Panel key={b.id} title={b.name} action={<span className="muted-text">{num(apts.length)} شقة</span>}>
            <Table empty={filter === 'owing' ? 'كل الشقق مسددة' : filter === 'credit' ? 'مفيش شقق دافعة مقدم' : 'لا توجد شقق'}
              headers={['الشقة', 'الدور', 'السكان', 'الحساب', '']} rows={apts.map((a) => {
                const bal = balanceOf(data, a.id);
                const owed = Number(bal?.balance || 0);
                const credit = Number(bal?.credit || 0);
                const people = residentsOf(data, a.id);
                return (
                  <tr key={a.id} className={a.is_active === false ? 'inactive' : ''}>
                    <td><b>شقة {a.unit_number}</b>{a.is_active === false && <span className="cell-sub">موقوفة</span>}</td>
                    <td>{a.floor_label || '—'}</td>
                    <td>{people.length ? people.map(personName).join('، ') : <span className="muted-text">بدون ساكن</span>}</td>
                    <td>
                      {owed > 0 && <span className="pill danger">متأخر {money(owed)}</span>}
                      {owed <= 0 && credit > 0 && <span className="pill success">مقدم {money(credit)}</span>}
                      {owed <= 0 && credit <= 0 && <span className="pill muted">مسدد</span>}
                      {owed > 0 && <span className="cell-sub">{months(bal.unpaid_months)}</span>}
                    </td>
                    <td><div className="row-actions">
                      <button className="outline small" onClick={() => setDetails(a)}>التفاصيل</button>
                      {me.canManage(a.building_id) && <button className="outline small" onClick={() => openEdit(a)} aria-label={`تعديل شقة ${a.unit_number}`}>تعديل</button>}
                    </div></td>
                  </tr>
                );
              })} />
          </Panel>
        );
      })}

      <ApartmentDetails open={!!details} onClose={() => setDetails(null)} data={data} apartment={details}
        onEdit={details && me.canManage(details.building_id) ? () => openEdit(details) : null}
        onPay={() => { setPaying(details); setDetails(null); }} />

      <PaymentDialog open={!!paying} onClose={() => setPaying(null)} data={data} me={me} act={act} apartment={paying} />

      <FormDialog
        open={!!editing} onClose={() => setEditing(null)} title={`تعديل شقة ${editing?.unit_number || ''}`}
        subtitle={data.buildings.find((x) => x.id === editing?.building_id)?.name}
        submitLabel="حفظ التعديل" error={error} busy={busy} onSubmit={save}
        steps={[{ content: editing && (
          <>
            <Field label="رقم الشقة" name="unit_number" required defaultValue={editing.unit_number} />
            <Field label="الدور" name="floor_label" defaultValue={editing.floor_label || ''} />
            <Field label="المساحة (م²)" name="area_sqm" type="number" min="0" step="0.01" defaultValue={editing.area_sqm ?? ''} />
            <SelectField label="الحالة" name="is_active" defaultValue={String(editing.is_active !== false)}
              options={[{ value: 'true', label: 'نشطة' }, { value: 'false', label: 'موقوفة (مفيش مستحقات جديدة)' }]} />
          </>
        ) }]}
      />
    </>
  );
}
