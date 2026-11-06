import React, { useState } from 'react';
import { Panel } from '../components/ui';
import { money, METHOD_LABEL, num } from '../lib/format';
import { balanceOf } from '../lib/stats';
import { supabase } from '../lib/supabase';

const KEY = 'bms-quick-method';
const savedMethod = () => { try { return localStorage.getItem(KEY) || 'cash'; } catch { return 'cash'; } };

// One screen for collecting: every apartment that owes, the amount already filled in,
// and a single button. The payment method is remembered between visits.
export default function QuickCollect({ data, me, scoped, act }) {
  const [method, setMethod] = useState(savedMethod);
  const [amounts, setAmounts] = useState({});
  const [done, setDone] = useState({});
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [q, setQ] = useState('');

  const bName = (id) => data.buildings.find((b) => b.id === id)?.name;
  const rows = data.apartments
    .filter((a) => scoped.ids.has(a.building_id) && me.canManage(a.building_id) && a.is_active !== false)
    .map((a) => ({ a, owed: Number(balanceOf(data, a.id)?.balance || 0) }))
    .filter((r) => r.owed > 0 || done[r.a.id])
    .filter((r) => !q.trim() || r.a.unit_number.includes(q.trim()))
    .sort((x, y) => bName(x.a.building_id).localeCompare(bName(y.a.building_id), 'ar') || x.a.unit_number.localeCompare(y.a.unit_number, 'ar', { numeric: true }));

  const changeMethod = (m) => { setMethod(m); try { localStorage.setItem(KEY, m); } catch { /* storage unavailable */ } };

  async function collect(r) {
    const amount = Number(amounts[r.a.id] ?? r.owed);
    if (!(amount > 0)) { setError('اكتب مبلغ أكبر من صفر'); return; }
    setBusyId(r.a.id); setError('');
    const err = await act(async () => {
      const ins = await supabase.from('payments').insert({
        building_id: r.a.building_id, apartment_id: r.a.id, amount, payment_method: method,
        reference: null, notes: '', submitted_by: me.id, status: 'pending',
      }).select('id').single();
      if (ins.error) return ins;
      // the owner is the one who approves, so for the owner it is recorded and approved in one tap
      return me.isOwner ? supabase.rpc('approve_payment', { p: ins.data.id }) : ins;
    }, me.isOwner ? `اتسجلت واتعتمدت: شقة ${r.a.unit_number} · ${money(amount)}` : `اتسجلت: شقة ${r.a.unit_number} · ${money(amount)}`);
    setBusyId('');
    if (err) setError(err); else setDone((d) => ({ ...d, [r.a.id]: amount }));
  }

  if (!me.isAdmin) return null;
  const left = rows.filter((r) => !done[r.a.id]);
  return (
    <Panel title="تحصيل سريع" action={<span className="muted-text">{num(left.length)} شقة عليها مستحقات</span>}>
      <div className="qc-tools">
        <div className="segmented" role="radiogroup" aria-label="طريقة الدفع">
          {Object.entries(METHOD_LABEL).map(([k, l]) => (
            <button key={k} type="button" role="radio" aria-checked={method === k} className={method === k ? 'active' : ''} onClick={() => changeMethod(k)}>{l}</button>
          ))}
        </div>
        <input className="qc-search" inputMode="numeric" placeholder="دوّر برقم الشقة" aria-label="دوّر برقم الشقة" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {error && <div className="notice error" role="alert">{error}</div>}
      <ul className="qc-list">
        {rows.map((r) => {
          const paid = done[r.a.id];
          return (
            <li key={r.a.id} className={'qc-row' + (paid ? ' done' : '')}>
              <span className="qc-apt"><b>شقة {r.a.unit_number}</b><small>{bName(r.a.building_id)}</small></span>
              {paid ? (
                <span className="qc-done"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3.2 3L13 4.5" /></svg>اتسجلت {money(paid)}</span>
              ) : (
                <>
                  <span className="qc-owed">عليها <b>{money(r.owed)}</b></span>
                  <input className="qc-amount" type="number" min="1" step="0.01" inputMode="decimal" aria-label={`المبلغ لشقة ${r.a.unit_number}`}
                    value={amounts[r.a.id] ?? r.owed} onChange={(e) => setAmounts((s) => ({ ...s, [r.a.id]: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === 'Enter') collect(r); }} />
                  <button type="button" className="primary" disabled={busyId === r.a.id} onClick={() => collect(r)}>{busyId === r.a.id ? '…' : 'تم الدفع'}</button>
                </>
              )}
            </li>
          );
        })}
        {rows.length === 0 && <li className="muted-text qc-empty">{q ? 'مفيش شقة بالرقم ده عليها مستحقات' : 'مفيش شقق عليها مستحقات دلوقتي'}</li>}
      </ul>
    </Panel>
  );
}
