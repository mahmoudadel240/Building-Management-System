import React, { useState } from 'react';
import { PageHead, Empty, FormDialog, Field } from '../components/ui';
import { money, num } from '../lib/format';
import { monthCollection, outstanding, treasuryBalance, feeOf } from '../lib/stats';
import { supabase } from '../lib/supabase';

export default function Buildings({ data, me, scoped, act }) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function addBuilding(fd) {
    setBusy(true);
    const count = Number(fd.get('count'));
    const err = await act(async () => {
      const { data: b, error } = await supabase.from('buildings')
        .insert({ name: fd.get('name'), address: fd.get('address'), apartment_count: count, created_by: me.id }).select().single();
      if (error) return { error };
      const [s, t] = await Promise.all([
        supabase.from('subscription_settings').insert({ building_id: b.id, monthly_amount: Number(fd.get('fee')), updated_by: me.id }),
        supabase.from('treasury_accounts').insert({ building_id: b.id, name: 'الخزنة الرئيسية', opening_balance: Number(fd.get('opening') || 0) }),
      ]);
      if (s.error || t.error) return { error: s.error || t.error };
      if (count) {
        const units = Array.from({ length: count }, (_, i) => ({ building_id: b.id, unit_number: String(i + 1) }));
        const a = await supabase.from('apartments').insert(units);
        if (a.error) return a;
      }
      return supabase.rpc('generate_monthly_dues', { p_building: b.id });
    }, 'اتضافت العمارة بالشقق والخزنة');
    setBusy(false); setError(err);
    return !err;
  }

  async function saveFee(fd) {
    setBusy(true);
    const err = await act(() => supabase.from('subscription_settings')
      .update({ monthly_amount: Number(fd.get('fee')), updated_by: me.id, updated_at: new Date().toISOString() })
      .eq('building_id', editing.id), 'اتعدل الاشتراك — هيتطبق من الشهر الجاي');
    setBusy(false); setError(err);
    return !err;
  }

  return (
    <>
      <PageHead
        title="العمارات"
        subtitle="كل عمارة ليها شقق وخزنة واشتراك شهري"
        action={me.isOwner && <button className="primary" onClick={() => { setError(''); setAdding(true); }}>＋ إضافة عمارة</button>}
      />
      {scoped.buildings.length === 0 && <Empty>لا توجد عمارات بعد</Empty>}
      <div className="cards-grid">
        {scoped.buildings.map((b) => {
          const one = (r) => r.building_id === b.id;
          const c = monthCollection(data, one);
          return (
            <article key={b.id} className="building-card">
              <h3>{b.name}</h3>
              <p>{b.address || '—'}</p>
              <dl className="facts">
                <div><dt>الشقق</dt><dd>{num(b.apartment_count)}</dd></div>
                <div><dt>الاشتراك</dt><dd>{money(feeOf(data, b.id))}</dd></div>
                <div><dt>الخزنة</dt><dd>{money(treasuryBalance(data, one))}</dd></div>
                <div><dt>متأخرات</dt><dd>{money(outstanding(data, one).amount)}</dd></div>
              </dl>
              <div className="meter-row"><span>تحصيل الشهر</span><b>{c.rate}%</b></div>
              <div className="meter"><i style={{ width: c.rate + '%' }} /></div>
              {me.isOwner && <button className="outline full" onClick={() => { setError(''); setEditing(b); }}>تعديل الاشتراك الشهري</button>}
            </article>
          );
        })}
      </div>

      <FormDialog
        open={adding} onClose={() => setAdding(false)} title="إضافة عمارة" submitLabel="حفظ العمارة" error={error} busy={busy} onSubmit={addBuilding}
        steps={[
          { title: 'بيانات العمارة', content: (
            <>
              <Field full label="اسم العمارة" name="name" required placeholder="مثلاً: عمارة النخيل" />
              <Field full label="العنوان" name="address" placeholder="الشارع والمنطقة" />
              <Field label="عدد الشقق" name="count" type="number" required min="1" max="500" hint="هتتعمل الشقق بالأرقام من 1" />
            </>
          ) },
          { title: 'الاشتراك والخزنة', content: (
            <>
              <Field label="الاشتراك الشهري للشقة" name="fee" type="number" required min="0" step="0.01" hint="بالجنيه" />
              <Field label="رصيد الخزنة الحالي" name="opening" type="number" min="0" step="0.01" defaultValue="0" hint="لو فيه فلوس موجودة قبل استخدام النظام" />
            </>
          ) },
        ]}
      />

      <FormDialog
        open={!!editing} onClose={() => setEditing(null)} title="تعديل الاشتراك الشهري" subtitle={editing?.name}
        submitLabel="حفظ" error={error} busy={busy} onSubmit={saveFee}
        steps={[{ content: (
          <Field full label="الاشتراك الشهري للشقة" name="fee" type="number" required min="0" step="0.01"
            defaultValue={editing ? feeOf(data, editing.id) : ''} hint="الشهور اللي اتعملت قبل كده مش هتتغير" />
        ) }]}
      />
    </>
  );
}
