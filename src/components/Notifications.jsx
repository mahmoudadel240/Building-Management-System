import React, { useEffect, useMemo, useRef, useState } from 'react';
import { money, date, personName } from '../lib/format';
import { balanceOf, nextPayment } from '../lib/stats';

const rtf = new Intl.RelativeTimeFormat('ar-EG-u-nu-latn', { numeric: 'auto' });
function ago(t) {
  const s = (new Date(t).getTime() - Date.now()) / 1000;
  const abs = Math.abs(s);
  if (abs < 60) return 'دلوقتي';
  if (abs < 3600) return rtf.format(Math.round(s / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(s / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(s / 86400), 'day');
  return date(t);
}

// Builds the notifications for the signed-in user from data they can already see.
// Owner: things waiting for approval. Building admin: requests in their building and
// the outcome of what they submitted. Resident: their payments' outcome and their dues.
function build(data, me) {
  const out = [];
  const apt = (id) => data.apartments.find((a) => a.id === id);
  const bName = (id) => data.buildings.find((b) => b.id === id)?.name || '';
  const who = (id) => personName(data.profiles.find((p) => p.id === id));
  const aptLabel = (id) => `شقة ${apt(id)?.unit_number || ''} – ${bName(apt(id)?.building_id)}`;
  const push = (n) => out.push(n);

  if (me.isOwner) {
    data.payments.filter((p) => p.status === 'pending').forEach((p) => push({
      id: 'pp' + p.id, at: p.created_at, tone: 'warn', page: 'payments',
      title: 'تحصيل مستني اعتمادك', text: `${aptLabel(p.apartment_id)} · ${money(p.amount)} · سجّله ${who(p.submitted_by)}`,
    }));
    data.expenses.filter((x) => x.status === 'pending').forEach((x) => push({
      id: 'pe' + x.id, at: x.created_at, tone: 'warn', page: 'expenses',
      title: 'مصروف مستني اعتمادك', text: `${x.title} · ${money(x.amount)} · ${bName(x.building_id)}`,
    }));
  }

  if (me.isAdmin) {
    data.links.filter((l) => l.status === 'pending' && me.canManage(apt(l.apartment_id)?.building_id)).forEach((l) => push({
      id: 'lr' + l.id, at: l.created_at, tone: 'info', page: 'users',
      title: 'طلب ربط بشقة', text: `${who(l.user_id)} طالب يتربط بـ${aptLabel(l.apartment_id)}`,
    }));
  }

  if (me.isAdmin && !me.isOwner) {
    // Payments a resident recorded in my building (I don't approve, but I should know)
    data.payments.filter((p) => p.status === 'pending' && p.submitted_by !== me.id && me.canManage(p.building_id)).forEach((p) => push({
      id: 'rp' + p.id, at: p.created_at, tone: 'info', page: 'payments',
      title: 'ساكن سجّل دفعة', text: `${aptLabel(p.apartment_id)} · ${money(p.amount)} — مستنية اعتماد المالك`,
    }));
    // Outcome of what I submitted
    data.payments.filter((p) => p.submitted_by === me.id && p.status !== 'pending' && p.approved_at).forEach((p) => push({
      id: 'mp' + p.id + p.status, at: p.approved_at, tone: p.status === 'approved' ? 'good' : 'bad', page: 'payments',
      title: p.status === 'approved' ? 'اتعتمد التحصيل' : 'اترفض التحصيل', text: `${aptLabel(p.apartment_id)} · ${money(p.amount)}`,
    }));
    data.expenses.filter((x) => x.submitted_by === me.id && x.status !== 'pending' && x.approved_at).forEach((x) => push({
      id: 'me' + x.id + x.status, at: x.approved_at, tone: x.status === 'approved' ? 'good' : 'bad', page: 'expenses',
      title: x.status === 'approved' ? 'اتعتمد المصروف' : 'اترفض المصروف', text: `${x.title} · ${money(x.amount)}`,
    }));
  }

  if (!me.isAdmin) {
    data.payments.filter((p) => me.myApartments.includes(p.apartment_id) && p.status !== 'pending' && p.approved_at).forEach((p) => push({
      id: 'yp' + p.id + p.status, at: p.approved_at, tone: p.status === 'approved' ? 'good' : 'bad', page: 'payments',
      title: p.status === 'approved' ? 'دفعتك اتعتمدت' : 'دفعتك اترفضت',
      text: p.status === 'approved' ? `${money(p.amount)} لـ${aptLabel(p.apartment_id)}` : `${money(p.amount)} — راجع الإدارة أو سجّلها تاني`,
    }));
    data.links.filter((l) => l.user_id === me.id && ['approved', 'rejected'].includes(l.status) && l.reviewed_at).forEach((l) => push({
      id: 'yl' + l.id + l.status, at: l.reviewed_at, tone: l.status === 'approved' ? 'good' : 'bad', page: 'home',
      title: l.status === 'approved' ? 'اتربطت بشقتك' : 'طلب الربط اترفض', text: aptLabel(l.apartment_id),
    }));
    // Dues: overdue now, or due within the next 7 days
    me.myApartments.forEach((id) => {
      const owed = Number(balanceOf(data, id)?.balance || 0);
      const next = nextPayment(data, id);
      if (!next) return;
      const dueAt = next.date + 'T00:00:00';
      if (owed > 0) {
        push({ id: 'od' + id + next.date + owed, at: dueAt, tone: 'bad', page: 'home', sticky: true,
          title: 'عليك متأخرات', text: `${aptLabel(id)} · ${money(owed)}` });
      } else if (new Date(dueAt).getTime() - Date.now() < 7 * 86400 * 1000) {
        push({ id: 'nd' + id + next.date, at: dueAt, tone: 'info', page: 'home', sticky: true,
          title: 'الدفعة الجاية قربت', text: `${aptLabel(id)} · ${money(next.amount)} يوم ${date(dueAt)}` });
      }
    });
  }

  return out.sort((a, b) => (a.sticky === b.sticky ? (a.at < b.at ? 1 : -1) : a.sticky ? -1 : 1)).slice(0, 25);
}

export default function Notifications({ data, me, go }) {
  const key = 'bms-notif-seen-' + me.id;
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(() => { try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; } });
  const ref = useRef(null);
  const items = useMemo(() => build(data, me), [data, me]);
  const unread = items.filter((n) => !seen.includes(n.id));
  const [ringing, setRinging] = useState(false);
  const lastCount = useRef(0);
  useEffect(() => {
    // shake the bell when something new arrives (and once when the page opens with news)
    if (unread.length > lastCount.current) {
      setRinging(true); const t = setTimeout(() => setRinging(false), 1000); lastCount.current = unread.length; return () => clearTimeout(t);
    }
    lastCount.current = unread.length; return undefined;
  }, [unread.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (e.key === 'Escape' || (e.type === 'mousedown' && !ref.current?.contains(e.target))) setOpen(false); };
    window.addEventListener('mousedown', close); window.addEventListener('keydown', close);
    return () => { window.removeEventListener('mousedown', close); window.removeEventListener('keydown', close); };
  }, [open]);

  const markAll = () => {
    const ids = [...new Set([...seen, ...items.map((n) => n.id)])].slice(-300);
    setSeen(ids);
    try { localStorage.setItem(key, JSON.stringify(ids)); } catch { /* storage unavailable */ }
  };
  const openItem = (n) => {
    const ids = [...new Set([...seen, n.id])].slice(-300);
    setSeen(ids);
    try { localStorage.setItem(key, JSON.stringify(ids)); } catch { /* storage unavailable */ }
    setOpen(false); go(n.page);
  };

  return (
    <div className="notif" ref={ref}>
      <button type="button" className={'notif-btn' + (ringing ? ' ringing' : '')} onClick={() => setOpen((o) => !o)} aria-expanded={open}
        aria-label={unread.length ? `الإشعارات، ${unread.length} جديد` : 'الإشعارات'}>
        <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 8a6 6 0 1112 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 003.4 0" />
        </svg>
        {unread.length > 0 && <span key={unread.length} className="notif-count">{unread.length > 9 ? '9+' : unread.length}</span>}
      </button>
      {open && (
        <div className="notif-panel" role="dialog" aria-label="الإشعارات">
          <header>
            <b>الإشعارات</b>
            {unread.length > 0 && <button type="button" className="text-btn" onClick={markAll}>تحديد الكل كمقروء</button>}
          </header>
          {items.length === 0 ? <p className="notif-empty">مفيش إشعارات</p> : (
            <ul>
              {items.map((n) => (
                <li key={n.id}>
                  <button type="button" className={'notif-item ' + n.tone + (seen.includes(n.id) ? '' : ' unread')} onClick={() => openItem(n)}>
                    <i aria-hidden="true" />
                    <span>
                      <b>{n.title}</b>
                      <small>{n.text}</small>
                      <time>{ago(n.at)}</time>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
