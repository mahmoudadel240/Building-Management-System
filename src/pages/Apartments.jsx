import React, { useState } from 'react';
import { PageHead, Panel, Table, FormDialog, Field, SelectField, Empty } from '../components/ui';
import { money, num, personName } from '../lib/format';
import { balanceOf, residentsOf } from '../lib/stats';
import { supabase } from '../lib/supabase';

export default function Apartments({ data, me, scoped, act }) {
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [onlyOwing, setOnlyOwing] = useState(false);

  async function addApartment(fd) {
    setBusy(true);
    const bid = fd.get('building_id');
    const err = await act(async () => {
      const r = await supabase.from('apartments').insert({ building_id: bid, unit_number: fd.get('unit_number').trim(), floor_label: fd.get('floor_label') || null });
      if (r.error) return r;
      return supabase.rpc('generate_monthly_dues', { p_building: bid });
    }, 'اتضافت الشقة');
    setBusy(false);
    setError(err && err.includes('duplicate') ? 'رقم الشقة ده موجود بالفعل في العمارة' : err);
    return !err;
  }

  return (
    <>
      <PageHead
        title="الشقق والسكان"
        subtitle="مين ساكن فين، وكل شقة عليها كام"
        action={me.isOwner && <button className="primary" onClick={() => { setError(''); setAdding(true); }}>＋ إضافة شقة</button>}
      />
      <label className="check"><input type="checkbox" checked={onlyOwing} onChange={(e) => setOnlyOwing(e.target.checked)} /> اعرض الشقق اللي عليها مستحقات بس</label>

      {scoped.buildings.length === 0 && <Empty>لا توجد عمارات بعد</Empty>}
      {scoped.buildings.map((b) => {
        const apts = data.apartments.filter((a) => a.building_id === b.id)
          .filter((a) => !onlyOwing || Number(balanceOf(data, a.id)?.balance || 0) > 0)
          .sort((x, y) => x.unit_number.localeCompare(y.unit_number, 'ar', { numeric: true }));
        return (
          <Panel key={b.id} title={b.name} action={<span className="muted-text">{num(apts.length)} شقة</span>}>
            <Table empty={onlyOwing ? 'كل الشقق مسددة' : 'لا توجد شقق'} headers={['الشقة', 'الدور', 'السكان', 'المستحق', 'الحالة']} rows={apts.map((a) => {
              const bal = balanceOf(data, a.id);
              const owed = Number(bal?.balance || 0);
              const people = residentsOf(data, a.id);
              return (
                <tr key={a.id}>
                  <td><b>شقة {a.unit_number}</b></td>
                  <td>{a.floor_label || '—'}</td>
                  <td>{people.length ? people.map(personName).join('، ') : <span className="muted-text">بدون ساكن</span>}</td>
                  <td>{money(owed)}</td>
                  <td>{owed > 0
                    ? <span className="pill danger">متأخر {num(bal.unpaid_months)} شهر</span>
                    : <span className="pill success">مسدد</span>}</td>
                </tr>
              );
            })} />
          </Panel>
        );
      })}

      <FormDialog
        open={adding} onClose={() => setAdding(false)} title="إضافة شقة" submitLabel="إضافة الشقة" error={error} busy={busy} onSubmit={addApartment}
        steps={[{ content: (
          <>
            <SelectField full label="العمارة" name="building_id" required
              defaultValue={scoped.buildings.length === 1 ? scoped.buildings[0].id : ''}
              placeholder={scoped.buildings.length === 1 ? undefined : 'اختار العمارة'}
              options={scoped.buildings.map((b) => ({ value: b.id, label: b.name }))} />
            <Field label="رقم الشقة" name="unit_number" required />
            <Field label="الدور (اختياري)" name="floor_label" />
          </>
        ) }]}
      />
    </>
  );
}
