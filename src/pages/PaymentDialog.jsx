import React, { useEffect, useState } from 'react';
import { FormDialog, Field, SelectField } from '../components/ui';
import { money, METHOD_LABEL } from '../lib/format';
import { balanceOf, feeOf } from '../lib/stats';
import { supabase } from '../lib/supabase';

// Record a payment for an apartment. Residents only get their own apartments;
// admins get the apartments of the buildings they manage.
export default function PaymentDialog({ open, onClose, data, me, act, apartment }) {
  const allowed = data.apartments.filter((a) => (me.isAdmin ? me.canManage(a.building_id) : me.myApartments.includes(a.id)));
  const buildings = data.buildings.filter((b) => allowed.some((a) => a.building_id === b.id));
  const [buildingId, setBuildingId] = useState('');
  const [apartmentId, setApartmentId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError('');
    const a = apartment || (allowed.length === 1 ? allowed[0] : null);
    setBuildingId(a?.building_id || (buildings.length === 1 ? buildings[0].id : ''));
    setApartmentId(a?.id || '');
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const apts = allowed.filter((a) => a.building_id === buildingId);
  const bal = balanceOf(data, apartmentId);
  const owed = Number(bal?.balance || 0);
  const credit = Number(bal?.credit || 0);
  const fee = Number(feeOf(data, buildingId) || 0);

  async function submit(fd) {
    setBusy(true);
    const err = await act(() => supabase.from('payments').insert({
      building_id: buildingId, apartment_id: apartmentId, amount: Number(fd.get('amount')),
      payment_method: fd.get('method'), reference: fd.get('reference') || null, notes: fd.get('notes') || '',
      submitted_by: me.id, status: 'pending',
    }), 'اتسجلت الدفعة وهتتراجع قبل ما تدخل الخزنة');
    setBusy(false); setError(err);
    return !err;
  }

  return (
    <FormDialog
      open={open} onClose={onClose} title="تسجيل دفعة" subtitle="الدفعة بتدخل الخزنة بعد اعتمادها"
      submitLabel="تسجيل الدفعة" error={error} busy={busy} onSubmit={submit}
      steps={[{ content: (
        <>
          {buildings.length > 1 && (
            <SelectField label="العمارة" name="building_id" required placeholder="اختار العمارة" value={buildingId}
              onChange={(e) => { setBuildingId(e.target.value); setApartmentId(''); }}
              options={buildings.map((b) => ({ value: b.id, label: b.name }))} />
          )}
          <SelectField label="الشقة" name="apartment_id" required placeholder={buildingId ? 'اختار الشقة' : 'اختار العمارة الأول'} value={apartmentId}
            disabled={!buildingId} onChange={(e) => setApartmentId(e.target.value)}
            options={apts.map((a) => ({ value: a.id, label: `شقة ${a.unit_number}` }))}
            hint={apartmentId ? (owed > 0 ? `عليها ${money(owed)}` : credit > 0 ? `دافعة مقدم ${money(credit)}` : 'مفيش مستحقات عليها') : undefined} />
          <Field label="المبلغ" name="amount" type="number" required min="1" step="0.01" key={apartmentId} data-money
            defaultValue={owed > 0 ? owed : fee || ''} inputMode="decimal"
            hint={apartmentId && owed <= 0 ? 'أي مبلغ زيادة بيتسجل دفع مقدم ويتخصم من الشهور الجاية' : undefined} />
          <SelectField label="طريقة الدفع" name="method" required options={Object.entries(METHOD_LABEL).map(([value, label]) => ({ value, label }))} />
          <Field full label="رقم العملية (اختياري)" name="reference" hint="مثلاً رقم التحويل أو الإيصال" />
        </>
      ) }]}
    />
  );
}
