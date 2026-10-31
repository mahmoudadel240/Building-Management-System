import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from './lib/supabase';
import { ROLE_LABEL, personName } from './lib/format';
import { errorText } from './lib/errors';
import Login from './pages/Login.jsx';
import Overview from './pages/Overview.jsx';
import ResidentHome from './pages/ResidentHome.jsx';
import Buildings from './pages/Buildings.jsx';
import Apartments from './pages/Apartments.jsx';
import Payments from './pages/Payments.jsx';
import Expenses from './pages/Expenses.jsx';
import Treasury from './pages/Treasury.jsx';
import Users from './pages/Users.jsx';
import Activity from './pages/Activity.jsx';

const EMPTY = {
  profiles: [], buildings: [], members: [], apartments: [], links: [], payments: [], expenses: [],
  dues: [], balances: [], accounts: [], transactions: [], subscriptions: [], audit: [],
};

const PAGES = {
  home: { title: 'الرئيسية', icon: 'M3 11l9-8 9 8M5 10v10h14V10' },
  buildings: { title: 'العمارات', icon: 'M4 21V5l8-3 8 3v16M9 9h1M14 9h1M9 13h1M14 13h1M10 21v-4h4v4' },
  apartments: { title: 'الشقق والسكان', icon: 'M3 21h18M5 21V8h14v13M9 12h2M13 12h2M9 16h2M13 16h2' },
  payments: { title: 'التحصيلات', icon: 'M3 7h18v10H3zM7 12h.01M17 12h.01M12 10a2 2 0 100 4 2 2 0 000-4' },
  expenses: { title: 'المصروفات', icon: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6' },
  treasury: { title: 'الخزنة', icon: 'M4 7h16v12H4zM4 11h16M16 15h1' },
  users: { title: 'المستخدمين', icon: 'M16 20v-1a4 4 0 00-8 0v1M12 11a3 3 0 100-6 3 3 0 000 6M20 20v-1a3 3 0 00-3-3M4 20v-1a3 3 0 013-3' },
  activity: { title: 'سجل النشاط', icon: 'M12 8v4l3 2M12 3a9 9 0 100 18 9 9 0 000-18' },
};

function Icon({ d }) {
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
}

export default function App() {
  const [session, setSession] = useState(null);
  const [checking, setChecking] = useState(true);
  const [data, setData] = useState(EMPTY);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [page, setPage] = useState('home');
  const [buildingId, setBuildingId] = useState('all');
  const [toast, setToast] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [theme, setTheme] = useState(() => { try { return localStorage.getItem('bms-theme') || 'light'; } catch { return 'light'; } });
  useEffect(() => { try { localStorage.setItem('bms-theme', theme); } catch { /* storage unavailable */ } }, [theme]);

  const userId = session?.user?.id;

  // ---------- session ----------
  useEffect(() => {
    if (!supabase) { setChecking(false); return; }
    let alive = true;
    supabase.auth.getSession().then(({ data }) => { if (alive) { setSession(data.session); setChecking(false); } });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => { alive = false; subscription.unsubscribe(); };
  }, []);

  // ---------- data ----------
  const load = useCallback(async ({ generateDues = false } = {}) => {
    if (!userId) return;
    setLoading(true); setLoadError('');
    try {
      if (generateDues) await supabase.rpc('generate_monthly_dues'); // creates any missing months; harmless for residents
      const q = (table, build = (x) => x) => build(supabase.from(table).select('*'));
      const results = await Promise.all([
        q('profiles'),
        q('buildings', (x) => x.order('name')),
        q('building_members'),
        q('apartments', (x) => x.order('unit_number')),
        q('apartment_residents', (x) => x.order('created_at', { ascending: false })),
        q('payments', (x) => x.order('created_at', { ascending: false })),
        q('expenses', (x) => x.order('created_at', { ascending: false })),
        q('monthly_dues', (x) => x.order('period_month', { ascending: false })),
        q('apartment_balances'),
        q('treasury_accounts'),
        q('treasury_transactions', (x) => x.order('created_at', { ascending: false })),
        q('subscription_settings'),
        q('audit_logs', (x) => x.order('created_at', { ascending: false }).limit(150)),
      ]);
      const failed = results.find((r) => r.error);
      if (failed) throw failed.error;
      const [profiles, buildings, members, apartments, links, payments, expenses, dues, balances, accounts, transactions, subscriptions, audit] = results.map((r) => r.data || []);
      setData({ profiles, buildings, members, apartments, links, payments, expenses, dues, balances, accounts, transactions, subscriptions, audit });
    } catch (e) {
      setLoadError(e.message || 'تعذر تحميل البيانات');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { if (userId) load({ generateDues: true }); else setData(EMPTY); }, [userId, load]);

  // ---------- who am I ----------
  const me = useMemo(() => {
    const profile = data.profiles.find((p) => p.id === userId);
    const isOwner = ['owner', 'superuser'].includes(profile?.role);
    const adminOf = data.members.filter((m) => m.user_id === userId && m.member_role === 'admin' && m.status === 'approved').map((m) => m.building_id);
    const myApartments = data.links.filter((l) => l.user_id === userId && l.status === 'approved').map((l) => l.apartment_id);
    const isAdmin = isOwner || adminOf.length > 0;
    const role = isOwner ? profile.role : adminOf.length ? 'admin' : 'resident';
    const canManage = (bid) => isOwner || adminOf.includes(bid);
    return { id: userId, profile, isOwner, isAdmin, adminOf, myApartments, role, canManage };
  }, [data, userId]);

  // Buildings the current filter covers
  const scoped = useMemo(() => {
    const visible = data.buildings.filter((b) => buildingId === 'all' || b.id === buildingId);
    const ids = new Set(visible.map((b) => b.id));
    return { buildings: visible, ids, has: (row) => ids.has(row.building_id) };
  }, [data.buildings, buildingId]);

  const notify = (t) => { setToast(t); setTimeout(() => setToast(''), 3500); };

  // Runs a database action; returns '' on success or the error message.
  const act = async (fn, successMessage) => {
    try {
      const res = await fn();
      if (res?.error) throw res.error;
      if (res?.data?.error) throw new Error(res.data.error);
      await load();
      if (successMessage) notify(successMessage);
      return '';
    } catch (e) {
      return (await errorText(e)) || 'حدث خطأ';
    }
  };

  // ---------- screens ----------
  if (!supabase) {
    return <main className="center-screen"><div className="panel narrow"><h1>إعداد الاتصال مطلوب</h1><p>أضف VITE_SUPABASE_URL وVITE_SUPABASE_PUBLISHABLE_KEY في إعدادات Vercel.</p></div></main>;
  }
  if (checking) return <main className="center-screen"><p>جارٍ التحقق من الجلسة…</p></main>;
  if (!session) return <Login />;

  const nav = me.isAdmin
    ? ['home', 'buildings', 'apartments', 'payments', 'expenses', 'treasury', 'users', 'activity']
    : ['home', 'payments', 'expenses', 'treasury'];
  const current = nav.includes(page) ? page : 'home';
  const props = { data, me, scoped, act, notify, load, setPage };
  const go = (p) => { setPage(p); setMenuOpen(false); window.scrollTo(0, 0); };

  return (
    <div className={'app theme-' + theme} dir="rtl">
      <aside className={'sidebar' + (menuOpen ? ' show' : '')}>
        <div className="brand">
          <div className="brand-mark">B</div>
          <div><b>إدارة العمارات</b><small>BUILDING MANAGEMENT</small></div>
          <button type="button" className="mobile-close" onClick={() => setMenuOpen(false)} aria-label="إغلاق القائمة">×</button>
        </div>
        <div className="workspace">
          <div className="avatar">{personName(me.profile || session.user).slice(0, 1).toUpperCase()}</div>
          <div><b>{personName(me.profile || session.user)}</b><small>{ROLE_LABEL[me.role]}</small></div>
        </div>
        <nav>
          {nav.map((n) => (
            <button key={n} className={current === n ? 'active' : ''} onClick={() => go(n)}>
              <Icon d={PAGES[n].icon} /><span>{PAGES[n].title}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button className="outline full" onClick={() => supabase.auth.signOut()}>تسجيل الخروج</button>
        </div>
      </aside>
      {menuOpen && <div className="sidebar-scrim" onClick={() => setMenuOpen(false)} />}

      <main className="main">
        <header className="topbar">
          <button type="button" className="menu-btn" onClick={() => setMenuOpen(true)} aria-label="فتح القائمة">
            <Icon d="M4 6h16M4 12h16M4 18h16" />
          </button>
          <div className="top-actions">
            {data.buildings.length > 1 && (
              <label className="building-filter">
                <span>عرض</span>
                <select value={buildingId} onChange={(e) => setBuildingId(e.target.value)}>
                  <option value="all">كل العمارات</option>
                  {data.buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </label>
            )}
            <button type="button" className="theme-toggle" onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))} aria-label="تغيير المظهر">{theme === 'light' ? '☾' : '☀'}</button>
            <button type="button" className="refresh-btn" onClick={() => load()} disabled={loading} aria-label="تحديث البيانات">
              <Icon d="M20 7v5h-5M4 17v-5h5M5.6 9a7 7 0 0111.6-2L20 12M4 12l2.8 5a7 7 0 0011.6-2" />
            </button>
          </div>
        </header>

        <section className="content">
          {loadError && <div className="notice error" role="alert">{loadError}</div>}
          {current === 'home' && (me.isAdmin ? <Overview {...props} /> : <ResidentHome {...props} />)}
          {current === 'buildings' && <Buildings {...props} />}
          {current === 'apartments' && <Apartments {...props} />}
          {current === 'payments' && <Payments {...props} />}
          {current === 'expenses' && <Expenses {...props} />}
          {current === 'treasury' && <Treasury {...props} />}
          {current === 'users' && <Users {...props} />}
          {current === 'activity' && <Activity {...props} />}
        </section>
      </main>
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
