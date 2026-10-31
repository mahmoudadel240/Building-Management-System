import React, { useState } from 'react';
import { ConfirmDialog } from './ui';
import { money } from '../lib/format';
import { supabase } from '../lib/supabase';

// Approve / reject buttons for a pending payment or expense, with a confirmation step.
export function ReviewButtons({ kind, row, act, label }) {
  const [ask, setAsk] = useState(null); // 'approve' | 'reject'
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const what = kind === 'payment' ? 'التحصيل' : 'المصروف';

  async function confirm() {
    setBusy(true);
    const fn = `${ask}_${kind}`;
    const err = await act(() => supabase.rpc(fn, { p: row.id }),
      ask === 'approve' ? `اتعتمد ${what}` : `اترفض ${what}`);
    setBusy(false);
    if (err) setError(err); else setAsk(null);
  }

  return (
    <>
      <div className="row-actions">
        <button className="approve" onClick={() => { setError(''); setAsk('approve'); }}>اعتماد</button>
        <button className="reject" onClick={() => { setError(''); setAsk('reject'); }}>رفض</button>
      </div>
      <ConfirmDialog
        open={!!ask} busy={busy} onCancel={() => setAsk(null)} onConfirm={confirm}
        title={ask === 'approve' ? `اعتماد ${what}؟` : `رفض ${what}؟`}
        tone={ask === 'reject' ? 'danger' : 'primary'}
        confirmLabel={ask === 'approve' ? 'اعتماد' : 'رفض'}
        message={<>
          {label} — <b>{money(row.amount)}</b>
          <br />
          {ask === 'approve'
            ? (kind === 'payment' ? 'المبلغ هيدخل الخزنة ويتخصم من أقدم مستحقات على الشقة.' : 'المبلغ هيتخصم من الخزنة.')
            : 'مش هيدخل الخزنة. ممكن يتسجل من جديد لو كان فيه غلط.'}
          {error && <span className="field-error block">{error}</span>}
        </>}
      />
    </>
  );
}
