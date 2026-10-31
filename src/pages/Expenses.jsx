import React, { useState } from 'react';
import { PageHead, Panel, Table, StatusPill, FormDialog, Field, SelectField } from '../components/ui';
import { ReviewButtons } from '../components/Review.jsx';
import { money, date, today } from '../lib/format';
import { supabase } from '../lib/supabase';

const TABS = [['all', 'الكل'], ['pending', 'قيد المراجعة'], ['approved', 'معتمد'], ['rejected', 'مرفوض']];
const CATEGORIES = ['صيانة', 'نظافة', 'كهرباء', 'مياه', 'أمن وحراسة', 'أسانسير', 'أخرى'];

export default function Expenses({ data, me, scoped, act }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState(me.isOwner ? 'pending' : 'all');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const mine = data.buildings.filter((b) => me.canManage(b.id) && scoped.ids.has(b.id));
  const rows = data.expenses.filter((x) => scoped.has(x) && (tab === 'all' || x.status === tab));
  const pendingCount = data.expenses.filter((x) => scoped.has(x) && x.status === 'pending').length;
  const bName = (id) => data.buildings.find((b) => b.id === id)?.name;

  async function add(fd) {
    setBusy(true);
    const err = await act(() => supabase.from('expenses').insert({
      building_id: fd.get('building_id'), title: fd.get('title'), category: fd.get('category'),
      amount: Number(fd.get('amount')), expense_date: fd.get('expense_date'), vendor: fd.get('vendor') || null,
      notes: fd.get('notes') || '', submitted_by: me.id, status: 'pending',
    }), 'اتسجل المصروف وهيتراجع قبل ما يتخصم من الخزنة');
    setBusy(false); setError(err);
    return !err;
  }

  return (
    <>
      <PageHead
        title="المصروفات"
        subtitle="المصروف بيتخصم من الخزنة بعد اعتماد المالك"
        action={<button className="primary" onClick={() => { setError(''); setOpen(true); }}>＋ تسجيل مصروف</button>}
      />
      <div className="tabs" role="tablist">
        {TABS.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>
            {l}{k === 'pending' && pendingCount > 0 && <span className="badge">{pendingCount}</span>}
          </button>
        ))}
      </div>
      <Panel>
        <Table
          empty={tab === 'pending' ? 'مفيش مصروفات مستنية الاعتماد' : 'مفيش مصروفات'}
          headers={['التاريخ', 'العمارة', 'البيان', 'التصنيف', 'المبلغ', 'الحالة', '']}
          rows={rows.map((x) => (
            <tr key={x.id}>
              <td>{date(x.expense_date)}</td>
              <td>{bName(x.building_id)}</td>
              <td><b>{x.title}</b>{x.vendor && <span className="cell-sub">{x.vendor}</span>}</td>
              <td>{x.category}</td>
              <td><b>{money(x.amount)}</b></td>
              <td><StatusPill status={x.status} /></td>
              <td>{me.isOwner && x.status === 'pending' && <ReviewButtons kind="expense" row={x} act={act} label={`${bName(x.building_id)} – ${x.title}`} />}</td>
            </tr>
          ))}
        />
      </Panel>

      <FormDialog
        open={open} onClose={() => setOpen(false)} title="تسجيل مصروف" submitLabel="تسجيل المصروف" error={error} busy={busy} onSubmit={add}
        steps={[
          { title: 'المصروف', content: (
            <>
              <SelectField full label="العمارة" name="building_id" required
                defaultValue={mine.length === 1 ? mine[0].id : ''} placeholder={mine.length === 1 ? undefined : 'اختار العمارة'}
                options={mine.map((b) => ({ value: b.id, label: b.name }))} />
              <Field full label="البيان" name="title" required placeholder="مثلاً: صيانة الأسانسير" />
              <SelectField label="التصنيف" name="category" required options={CATEGORIES.map((c) => ({ value: c, label: c }))} />
            </>
          ) },
          { title: 'المبلغ والتاريخ', content: (
            <>
              <Field label="المبلغ" name="amount" type="number" required min="1" step="0.01" inputMode="decimal" />
              <Field label="التاريخ" name="expense_date" type="date" required defaultValue={today()} />
              <Field full label="اتدفع لمين (اختياري)" name="vendor" placeholder="الشركة أو الشخص" />
            </>
          ) },
        ]}
      />
    </>
  );
}
