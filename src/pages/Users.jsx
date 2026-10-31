import React, { useState } from 'react';
import { PageHead, Panel, FormDialog, Field, SelectField, ConfirmDialog, Dialog, Empty } from '../components/ui';
import { ROLE_LABEL, personName, date, num } from '../lib/format';
import { supabase } from '../lib/supabase';

const ICON = {
  edit: 'M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  plus: 'M12 5v14M5 12h14',
};
const Svg = ({ d }) => <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
const IconBtn = ({ icon, label, onClick, tone = '' }) => (
  <button type="button" className={'icon-btn ' + tone} onClick={onClick} aria-label={label} title={label}><Svg d={ICON[icon]} /></button>
);

export default function Users({ data, me, scoped, act }) {
  const [add, setAdd] = useState(null);       // { mode: 'resident'|'admin'|'superuser', building, apartment }
  const [source, setSource] = useState('new'); // 'existing' | 'new'
  const [editing, setEditing] = useState(null);
  const [removing, setRemoving] = useState(null); // { person, link? }
  const [limitFor, setLimitFor] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const active = data.profiles.filter((p) => !p.disabled_at);
  const byId = (id) => active.find((p) => p.id === id);
  const apt = (id) => data.apartments.find((a) => a.id === id);
  const bName = (id) => data.buildings.find((b) => b.id === id)?.name;
  const isTop = (p) => ['owner', 'superuser'].includes(p?.role);
  const linksOf = (aptId) => data.links.filter((l) => l.apartment_id === aptId && l.status === 'approved' && byId(l.user_id));
  const admins = (bid) => data.members.filter((m) => m.building_id === bid && m.member_role === 'admin' && m.status === 'approved' && byId(m.user_id));
  const requests = data.links.filter((l) => l.status === 'pending' && scoped.ids.has(apt(l.apartment_id)?.building_id));
  const buildings = scoped.buildings.filter((b) => me.canManage(b.id));
  const top = active.filter(isTop).sort((a) => (a.role === 'owner' ? -1 : 1));

  // What the signed-in user may do to someone (the server checks the same rules)
  const canEdit = (p) => {
    if (!p) return false;
    if (p.id === me.id) return true;
    if (p.role === 'owner') return false;
    if (p.role === 'superuser') return me.profile?.role === 'owner';
    if (me.isOwner) return true;
    const adminSomewhere = data.members.some((m) => m.user_id === p.id && m.member_role === 'admin');
    return !adminSomewhere;
  };
  const canRemove = (p) => p && p.id !== me.id && canEdit(p);

  const run = async (fn, msg) => { setBusy(true); const err = await act(fn, msg); setBusy(false); setError(err); return !err; };
  const manage = (body, msg) => run(() => supabase.functions.invoke('manage-user', { body }), msg);

  // ---------- add person (existing or new) ----------
  function openAdd(mode, building = null, apartment = null) {
    setError(''); setSource(mode === 'superuser' ? 'new' : 'existing'); setAdd({ mode, building, apartment });
  }
  const candidates = !add ? [] : active.filter((p) => {
    if (isTop(p) || p.id === me.id) return false;
    if (add.mode === 'resident') return !data.links.some((l) => l.user_id === p.id && l.apartment_id === add.apartment?.id && ['approved', 'pending'].includes(l.status));
    if (add.mode === 'admin') return !admins(add.building?.id).some((m) => m.user_id === p.id);
    return false;
  }).sort((a, b) => personName(a).localeCompare(personName(b), 'ar'));

  async function submitAdd(fd) {
    const { mode, building, apartment } = add;
    if (source === 'existing') {
      const uid = fd.get('user_id');
      return mode === 'admin'
        ? manage({ action: 'make_admin', user_id: uid, building_id: building.id }, 'اتعيّن مدير للعمارة')
        : manage({ action: 'link', user_id: uid, apartment_ids: [apartment.id] }, `اتربط بشقة ${apartment.unit_number}`);
    }
    const email = fd.get('email') || null;
    return run(() => supabase.functions.invoke('invite-building-user', { body: {
      username: fd.get('username'), email, password: fd.get('password') || null,
      member_role: mode, building_id: building?.id || null, apartment_ids: apartment ? [apartment.id] : [],
    } }), email ? 'اتعمل الحساب واتبعتت دعوة على البريد' : 'اتعمل الحساب');
  }

  const addTitle = !add ? '' : add.mode === 'resident' ? `إضافة ساكن — شقة ${add.apartment.unit_number}` : add.mode === 'admin' ? 'إضافة مدير للعمارة' : 'إضافة مدير أعلى';
  const addSubtitle = !add ? '' : add.mode === 'superuser' ? 'بيدير كل العمارات' : add.building?.name;

  // ---------- edit ----------
  async function submitEdit(fd) {
    const body = { action: 'update', user_id: editing.id, display_name: fd.get('display_name'), username: fd.get('username'), phone: fd.get('phone') || null };
    if (fd.get('email')) body.email = fd.get('email');
    if (fd.get('password')) body.password = fd.get('password');
    return manage(body, 'اتحفظت البيانات');
  }
  const realEmail = (p) => (p?.email && !p.email.endsWith('@username.invalid') ? p.email : '');

  // ---------- limit ----------
  const saveLimit = (fd) => run(() => supabase.from('buildings').update({ max_residents_per_apartment: Number(fd.get('limit')) }).eq('id', limitFor.id), 'اتعدل الحد');

  const Person = ({ p, sub, onRemove, removeLabel = 'حذف' }) => (
    <div className="person">
      <span className="avatar sm">{personName(p).slice(0, 1).toUpperCase()}</span>
      <span className="person-text"><b>{personName(p)}</b><small>{sub ?? (p.username ? '@' + p.username : realEmail(p))}</small></span>
      <span className="person-actions">
        {canEdit(p) && <IconBtn icon="edit" label={`تعديل ${personName(p)}`} onClick={() => { setError(''); setEditing(p); }} />}
        {onRemove && <IconBtn icon="trash" tone="danger" label={`${removeLabel} ${personName(p)}`} onClick={onRemove} />}
      </span>
    </div>
  );

  return (
    <>
      <PageHead title="المستخدمين" subtitle="الإدارة العليا، وكل عمارة بمديرينها وسكان شققها" />

      {requests.length > 0 && (
        <Panel title="طلبات ربط شقق">
          <div className="person-list">
            {requests.map((l) => {
              const p = byId(l.user_id);
              return (
                <div key={l.id} className="person">
                  <span className="avatar sm">{personName(p).slice(0, 1)}</span>
                  <span className="person-text"><b>{personName(p)}</b><small>طالب شقة {apt(l.apartment_id)?.unit_number} – {bName(apt(l.apartment_id)?.building_id)} · {date(l.created_at)}</small></span>
                  <span className="row-actions">
                    <button className="approve" onClick={() => run(() => supabase.from('apartment_residents').update({ status: 'approved', reviewed_by: me.id, reviewed_at: new Date().toISOString() }).eq('id', l.id), 'اتربط الساكن بالشقة')}>موافقة</button>
                    <button className="reject" onClick={() => run(() => supabase.from('apartment_residents').update({ status: 'rejected', reviewed_by: me.id, reviewed_at: new Date().toISOString() }).eq('id', l.id), 'اترفض الطلب')}>رفض</button>
                  </span>
                </div>
              );
            })}
          </div>
          {error && !add && !editing && <div className="notice error">{error}</div>}
        </Panel>
      )}

      {me.isOwner && (
        <Panel title="الإدارة العليا" action={me.profile?.role === 'owner' && <button className="outline sm-btn" onClick={() => openAdd('superuser')}>＋ مدير أعلى</button>}>
          <div className="person-list">
            {top.map((p) => (
              <Person key={p.id} p={p} sub={ROLE_LABEL[p.role] + (p.id === me.id ? ' · إنت' : '')}
                onRemove={canRemove(p) ? () => setRemoving({ person: p }) : null} removeLabel="حذف حساب" />
            ))}
          </div>
        </Panel>
      )}

      {buildings.length === 0 && <Empty>لا توجد عمارات بعد</Empty>}
      {buildings.map((b) => {
        const apts = data.apartments.filter((a) => a.building_id === b.id && a.is_active !== false)
          .sort((x, y) => x.unit_number.localeCompare(y.unit_number, 'ar', { numeric: true }));
        const limit = Number(b.max_residents_per_apartment || 2);
        const residentsCount = new Set(apts.flatMap((a) => linksOf(a.id).map((l) => l.user_id))).size;
        const empty = apts.filter((a) => linksOf(a.id).length === 0).length;
        const bAdmins = admins(b.id);
        const unplaced = data.members.filter((m) => m.building_id === b.id && m.member_role === 'resident' && m.status === 'approved' && byId(m.user_id)
          && !data.links.some((l) => l.user_id === m.user_id && l.status === 'approved' && apt(l.apartment_id)?.building_id === b.id));
        return (
          <section key={b.id} className="panel building-users">
            <header className="bu-head">
              <div>
                <h3>{b.name}</h3>
                <p className="muted-text">{num(apts.length)} شقة · {num(residentsCount)} ساكن · {num(empty)} فاضية · الحد {num(limit)} لكل شقة</p>
              </div>
              {me.isOwner && <button className="outline sm-btn" onClick={() => { setError(''); setLimitFor(b); }}>تعديل الحد</button>}
            </header>

            <div className="bu-admins">
              <span className="muted-text">المديرين</span>
              {bAdmins.map((m) => (
                <span key={m.id} className="chip">{personName(byId(m.user_id))}
                  {canEdit(byId(m.user_id)) && <button className="chip-x" aria-label="تعديل" onClick={() => { setError(''); setEditing(byId(m.user_id)); }}><Svg d={ICON.edit} /></button>}
                  {me.isOwner && <button className="chip-x" aria-label="شيل الإدارة" onClick={() => setConfirm({
                    title: 'شيل صلاحية المدير؟', message: `${personName(byId(m.user_id))} هيبقى ساكن عادي في ${b.name}.`,
                    run: () => act(() => supabase.from('building_members').update({ member_role: 'resident' }).eq('id', m.id), 'اتشالت صلاحية المدير'),
                  })}>×</button>}
                </span>
              ))}
              {!bAdmins.length && <span className="muted-text">مفيش مدير</span>}
              {me.isOwner && <button className="chip add" onClick={() => openAdd('admin', b)}>＋ مدير</button>}
            </div>

            <div className="apt-tiles">
              {apts.map((a) => {
                const links = linksOf(a.id);
                const full = links.length >= limit;
                return (
                  <div key={a.id} className={'apt-tile' + (links.length ? '' : ' is-empty') + (full ? ' full' : '')}>
                    <div className="apt-tile-head">
                      <b>شقة {a.unit_number}</b>
                      <span className={'count ' + (full ? 'full' : '')}>{links.length}/{limit}</span>
                    </div>
                    {links.length === 0 && <span className="muted-text tiny">فاضية</span>}
                    {links.map((l) => (
                      <Person key={l.id} p={byId(l.user_id)} sub={byId(l.user_id)?.username ? '@' + byId(l.user_id).username : ''}
                        onRemove={canEdit(byId(l.user_id)) || me.canManage(b.id) ? () => setRemoving({ person: byId(l.user_id), link: l, apartment: a }) : null} />
                    ))}
                    {full ? <span className="muted-text tiny">مكتملة</span>
                      : <button className="tile-add" onClick={() => openAdd('resident', b, a)}><Svg d={ICON.plus} /> إضافة ساكن</button>}
                  </div>
                );
              })}
            </div>

            {unplaced.length > 0 && (
              <div className="bu-unplaced">
                <span className="muted-text">في العمارة من غير شقة</span>
                <div className="person-list">
                  {unplaced.map((m) => (
                    <Person key={m.id} p={byId(m.user_id)} onRemove={canRemove(byId(m.user_id)) ? () => setRemoving({ person: byId(m.user_id) }) : null} />
                  ))}
                </div>
              </div>
            )}
          </section>
        );
      })}

      {/* add: existing user or a new account */}
      <FormDialog open={!!add} onClose={() => setAdd(null)} title={addTitle} subtitle={addSubtitle}
        submitLabel={source === 'existing' ? (add?.mode === 'admin' ? 'تعيين مدير' : 'ربط بالشقة') : 'إنشاء الحساب'}
        error={error} busy={busy} onSubmit={submitAdd}
        steps={[{ content: add && (
          <>
            {add.mode !== 'superuser' && (
              <div className="segmented full" role="tablist">
                <button type="button" role="tab" aria-selected={source === 'existing'} className={source === 'existing' ? 'active' : ''} onClick={() => setSource('existing')}>مستخدم موجود</button>
                <button type="button" role="tab" aria-selected={source === 'new'} className={source === 'new' ? 'active' : ''} onClick={() => setSource('new')}>حساب جديد</button>
              </div>
            )}
            {source === 'existing' ? (
              candidates.length
                ? <SelectField full label="المستخدم" name="user_id" required placeholder="اختار من الحسابات" key="existing"
                    options={candidates.map((p) => ({ value: p.id, label: `${personName(p)}${p.username ? ' — @' + p.username : ''}` }))}
                    hint={add.mode === 'resident' ? 'نفس الشخص ممكن يكون في أكتر من شقة' : 'هيقدر يدير الشقق والتحصيلات والمصروفات والسكان'} />
                : <p className="muted-text full">مفيش حسابات تانية تقدر تضيفها هنا — اعمل حساب جديد.</p>
            ) : (
              <>
                <Field label="اسم المستخدم" name="username" required key="u" pattern="[a-zA-Z0-9_.\-]{3,32}" dir="ltr" autoComplete="off"
                  data-pattern-message="من 3 لـ 32 حرف: حروف إنجليزي وأرقام و . _ -" />
                <Field label="البريد الإلكتروني (اختياري)" name="email" type="email" dir="ltr" key="e" hint="هيوصله رابط يعمل منه كلمة المرور" />
                <Field full label="كلمة مرور مؤقتة" name="password" type="password" minLength="8" key="p" autoComplete="new-password" hint="مطلوبة لو مفيش بريد" />
              </>
            )}
          </>
        ) }]}
      />

      {/* edit */}
      <FormDialog open={!!editing} onClose={() => setEditing(null)} title="تعديل المستخدم" subtitle={editing && personName(editing)}
        submitLabel="حفظ" error={error} busy={busy} onSubmit={submitEdit}
        steps={[{ content: editing && (
          <>
            <Field label="الاسم" name="display_name" required defaultValue={editing.display_name || ''} />
            <Field label="اسم المستخدم" name="username" required defaultValue={editing.username || ''} dir="ltr" pattern="[a-zA-Z0-9_.\-]{3,32}"
              data-pattern-message="من 3 لـ 32 حرف: حروف إنجليزي وأرقام و . _ -" />
            <Field label="الموبايل" name="phone" type="tel" dir="ltr" defaultValue={editing.phone || ''} />
            <Field label="البريد الإلكتروني" name="email" type="email" dir="ltr" defaultValue={realEmail(editing)} />
            <Field full label="كلمة مرور جديدة (اختياري)" name="password" type="password" minLength="8" autoComplete="new-password" hint="سيبها فاضية لو مش عايز تغيرها" />
            {canRemove(editing) && (
              <div className="danger-zone full" data-no-review>
                <span><b>حذف الحساب</b><small>هيتشال من كل العمارات والشقق ومش هيقدر يدخل، والدفعات القديمة هتفضل باسمه.</small></span>
                <button type="button" className="reject" onClick={() => { const p = editing; setEditing(null); setRemoving({ person: p }); }}>حذف</button>
              </div>
            )}
          </>
        ) }]}
      />

      {/* remove: unlink from this apartment, or remove the account */}
      <Dialog open={!!removing} onClose={() => setRemoving(null)} size="small"
        title={removing?.link ? `${personName(removing.person)} — شقة ${removing.apartment.unit_number}` : `حذف ${personName(removing?.person)}؟`}>
        {removing?.link ? (
          <div className="choice-list">
            <button type="button" className="choice" disabled={busy} onClick={async () => {
              const ok = await run(() => supabase.from('apartment_residents').update({ status: 'voided', reviewed_by: me.id, reviewed_at: new Date().toISOString() }).eq('id', removing.link.id), 'اتفك الربط بالشقة');
              if (ok) setRemoving(null);
            }}>
              <b>شيله من الشقة دي بس</b><small>الحساب يفضل شغال ومربوط بأي شقق تانية.</small>
            </button>
            {canRemove(removing.person) && (
              <button type="button" className="choice danger" disabled={busy} onClick={async () => {
                const ok = await manage({ action: 'disable', user_id: removing.person.id }, 'اتحذف الحساب');
                if (ok) setRemoving(null);
              }}>
                <b>احذف الحساب كله</b><small>يتشال من كل العمارات والشقق ومايقدرش يدخل. الدفعات القديمة تفضل.</small>
              </button>
            )}
          </div>
        ) : (
          <p className="confirm-text">هيتشال من كل العمارات والشقق ومش هيقدر يسجل دخول تاني. الدفعات والعمليات القديمة هتفضل في السجل باسمه.</p>
        )}
        {error && <div className="notice error">{error}</div>}
        <div className="dialog-actions">
          <button type="button" className="outline" onClick={() => setRemoving(null)}>رجوع</button>
          <span className="spacer" />
          {!removing?.link && <button type="button" className="danger-btn" disabled={busy} onClick={async () => {
            const ok = await manage({ action: 'disable', user_id: removing.person.id }, 'اتحذف الحساب');
            if (ok) setRemoving(null);
          }}>حذف الحساب</button>}
        </div>
      </Dialog>

      {/* per-building limit */}
      <FormDialog open={!!limitFor} onClose={() => setLimitFor(null)} title="حد المستخدمين لكل شقة" subtitle={limitFor?.name}
        submitLabel="حفظ" error={error} busy={busy} onSubmit={saveLimit}
        steps={[{ content: limitFor && (
          <Field full label="أقصى عدد مستخدمين في الشقة" name="limit" type="number" required min="1" max="10"
            defaultValue={limitFor.max_residents_per_apartment || 2} hint="مثلاً 2 = المالك والساكن. الشقق اللي فيها أكتر من الحد مش هتتأثر، بس مش هتقبل حد جديد." />
        ) }]}
      />

      <ConfirmDialog open={!!confirm} title={confirm?.title} tone="danger" confirmLabel="تأكيد" onCancel={() => setConfirm(null)}
        onConfirm={async () => { const err = await confirm.run(); if (!err) setConfirm(null); else setConfirm({ ...confirm, error: err }); }}
        message={<>{confirm?.message}{confirm?.error && <span className="field-error block">{confirm.error}</span>}</>} />
    </>
  );
}
