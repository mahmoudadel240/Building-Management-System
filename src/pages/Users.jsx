import React, { useEffect, useState } from 'react';
import { PageHead, Panel, Table, FormDialog, Field, SelectField, ConfirmDialog } from '../components/ui';
import { ROLE_LABEL, personName, date } from '../lib/format';
import { supabase } from '../lib/supabase';

export default function Users({ data, me, scoped, act }) {
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [role, setRole] = useState('resident');
  const [buildingId, setBuildingId] = useState('');
  const [confirm, setConfirm] = useState(null); // { title, message, run }

  const manageable = data.buildings.filter((b) => me.canManage(b.id));
  useEffect(() => {
    if (adding) { setRole('resident'); setBuildingId(manageable.length === 1 ? manageable[0].id : ''); setError(''); }
  }, [adding]); // eslint-disable-line react-hooks/exhaustive-deps

  const bName = (id) => data.buildings.find((b) => b.id === id)?.name;
  const apt = (id) => data.apartments.find((a) => a.id === id);

  // Everyone the current user can see, with where they belong.
  const people = data.profiles
    .map((p) => ({
      p,
      memberships: data.members.filter((m) => m.user_id === p.id && m.status === 'approved' && scoped.ids.has(m.building_id)),
      homes: data.links.filter((l) => l.user_id === p.id && l.status === 'approved' && scoped.ids.has(apt(l.apartment_id)?.building_id)),
    }))
    .filter((x) => ['owner', 'superuser'].includes(x.p.role) || x.memberships.length || x.homes.length)
    .sort((a, b) => personName(a.p).localeCompare(personName(b.p), 'ar'));

  const requests = data.links.filter((l) => l.status === 'pending' && scoped.ids.has(apt(l.apartment_id)?.building_id));

  async function invite(fd) {
    setBusy(true);
    const err = await act(() => supabase.functions.invoke('invite-building-user', { body: {
      username: fd.get('username'), email: fd.get('email') || null, password: fd.get('password') || null,
      member_role: role, building_id: role === 'superuser' ? null : buildingId, apartment_id: fd.get('apartment_id') || null,
    } }), fd.get('email') ? 'اتعمل الحساب واتبعتت دعوة على البريد' : 'اتعمل الحساب');
    setBusy(false); setError(err);
    return !err;
  }

  const ask = (title, message, run) => setConfirm({ title, message, run });
  const doConfirm = async () => { const err = await confirm.run(); if (!err) setConfirm(null); else setConfirm({ ...confirm, error: err }); };

  const setMemberRole = (m, r) => ask(r === 'admin' ? 'تعيين مدير عمارة؟' : 'إلغاء صلاحية المدير؟',
    r === 'admin' ? `هيقدر يدير ${bName(m.building_id)}: الشقق والتحصيلات والمصروفات والسكان.` : `هيبقى ساكن عادي في ${bName(m.building_id)}.`,
    () => act(() => supabase.from('building_members').update({ member_role: r }).eq('id', m.id), 'اتغيرت الصلاحية'));
  const removeMember = (m, p) => ask('إزالة من العمارة؟', `${personName(p)} مش هيقدر يشوف ${bName(m.building_id)} تاني.`,
    () => act(() => supabase.from('building_members').delete().eq('id', m.id), 'اتشال من العمارة'));
  const unlink = (l, p) => ask('فك الربط بالشقة؟', `${personName(p)} مش هيبقى مربوط بشقة ${apt(l.apartment_id)?.unit_number}.`,
    () => act(() => supabase.from('apartment_residents').update({ status: 'voided', reviewed_by: me.id, reviewed_at: new Date().toISOString() }).eq('id', l.id), 'اتفك الربط'));
  const review = (l, status) => act(() => supabase.from('apartment_residents')
    .update({ status, reviewed_by: me.id, reviewed_at: new Date().toISOString() }).eq('id', l.id), status === 'approved' ? 'اتربط الساكن بالشقة' : 'اترفض الطلب');

  const roleOptions = [
    { value: 'resident', label: 'ساكن' },
    ...(me.isOwner ? [{ value: 'admin', label: 'مدير عمارة' }] : []),
    ...(me.profile?.role === 'owner' ? [{ value: 'superuser', label: 'مدير أعلى (كل العمارات)' }] : []),
  ];
  const freeApartments = data.apartments.filter((a) => a.building_id === buildingId);

  return (
    <>
      <PageHead
        title="المستخدمين"
        subtitle="مين له صلاحية على أنهي عمارة وشقة"
        action={<button className="primary" onClick={() => setAdding(true)}>＋ إضافة مستخدم</button>}
      />

      {requests.length > 0 && (
        <Panel title="طلبات ربط شقق">
          <Table headers={['المستخدم', 'العمارة', 'الشقة', 'التاريخ', '']} rows={requests.map((l) => (
            <tr key={l.id}>
              <td><b>{personName(data.profiles.find((p) => p.id === l.user_id))}</b></td>
              <td>{bName(apt(l.apartment_id)?.building_id)}</td>
              <td>شقة {apt(l.apartment_id)?.unit_number}</td>
              <td>{date(l.created_at)}</td>
              <td><div className="row-actions">
                <button className="approve" onClick={() => review(l, 'approved')}>موافقة</button>
                <button className="reject" onClick={() => review(l, 'rejected')}>رفض</button>
              </div></td>
            </tr>
          ))} />
        </Panel>
      )}

      <Panel title="الحسابات">
        <Table empty="مفيش مستخدمين لسه" headers={['الاسم', 'الدور', 'العمارة', 'الشقة', '']} rows={people.map(({ p, memberships, homes }) => {
          const global = ['owner', 'superuser'].includes(p.role);
          return (
            <tr key={p.id}>
              <td><b>{personName(p)}</b><span className="cell-sub">{p.username ? '@' + p.username : p.email}</span></td>
              <td>{global ? ROLE_LABEL[p.role] : memberships.map((m) => <span key={m.id} className="chip">{ROLE_LABEL[m.member_role]}</span>)}</td>
              <td>{global ? 'كل العمارات' : memberships.map((m) => (
                <span key={m.id} className="chip">{bName(m.building_id)}
                  {me.isOwner && <button className="chip-x" aria-label="إزالة من العمارة" onClick={() => removeMember(m, p)}>×</button>}
                </span>))}</td>
              <td>{homes.length ? homes.map((l) => (
                <span key={l.id} className="chip">شقة {apt(l.apartment_id)?.unit_number}
                  {me.canManage(apt(l.apartment_id)?.building_id) && <button className="chip-x" aria-label="فك الربط" onClick={() => unlink(l, p)}>×</button>}
                </span>)) : '—'}</td>
              <td>{me.isOwner && !global && memberships.map((m) => (
                <button key={m.id} className="text-btn" onClick={() => setMemberRole(m, m.member_role === 'admin' ? 'resident' : 'admin')}>
                  {m.member_role === 'admin' ? 'إلغاء الإدارة' : 'اجعله مدير'}{memberships.length > 1 ? ` (${bName(m.building_id)})` : ''}
                </button>))}</td>
            </tr>
          );
        })} />
      </Panel>

      <FormDialog
        open={adding} onClose={() => setAdding(false)} title="إضافة مستخدم" submitLabel="إنشاء الحساب" error={error} busy={busy} onSubmit={invite}
        steps={[
          { title: 'الصلاحية', content: (
            <>
              <SelectField full label="الدور" name="member_role" required value={role} onChange={(e) => setRole(e.target.value)} options={roleOptions} />
              {role !== 'superuser' && (
                <SelectField label="العمارة" name="building_id" required value={buildingId} onChange={(e) => setBuildingId(e.target.value)}
                  placeholder={manageable.length === 1 ? undefined : 'اختار العمارة'} options={manageable.map((b) => ({ value: b.id, label: b.name }))} />
              )}
              {role === 'resident' && (
                <SelectField label="الشقة" name="apartment_id" disabled={!buildingId} placeholder="بدون شقة دلوقتي"
                  options={freeApartments.map((a) => ({ value: a.id, label: `شقة ${a.unit_number}` }))} hint="لو اخترت شقة، الساكن هيتربط بيها على طول" />
              )}
            </>
          ) },
          { title: 'بيانات الدخول', content: (
            <>
              <Field label="اسم المستخدم" name="username" required pattern="[a-zA-Z0-9_.\-]{3,32}"
                data-pattern-message="من 3 لـ 32 حرف: حروف إنجليزي وأرقام و . _ -" dir="ltr" autoComplete="off" />
              <Field label="البريد الإلكتروني (اختياري)" name="email" type="email" dir="ltr" hint="لو كتبته، هيوصله رابط يعمل منه كلمة المرور" />
              <Field full label="كلمة مرور مؤقتة" name="password" type="password" minLength="8" autoComplete="new-password" hint="مطلوبة لو مفيش بريد" />
            </>
          ) },
        ]}
      />

      <ConfirmDialog open={!!confirm} title={confirm?.title} tone="danger" confirmLabel="تأكيد" onCancel={() => setConfirm(null)} onConfirm={doConfirm}
        message={<>{confirm?.message}{confirm?.error && <span className="field-error block">{confirm.error}</span>}</>} />
    </>
  );
}
