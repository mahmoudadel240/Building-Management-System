import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { STATUS } from '../lib/format';

/* ---------- small building blocks ---------- */

export function StatusPill({ status }) {
  const s = STATUS[status] || { label: status, tone: 'muted' };
  return <span className={'pill ' + s.tone}>{s.label}</span>;
}

export function Empty({ children = 'لا توجد بيانات بعد' }) {
  return <div className="empty">{children}</div>;
}

export function PageHead({ title, subtitle, action }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action && <div className="page-actions">{action}</div>}
    </div>
  );
}

export function Panel({ title, action, children, className = '' }) {
  return (
    <section className={'panel ' + className}>
      {(title || action) && (
        <div className="panel-head">
          {title && <h3>{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Table({ headers, rows, empty }) {
  if (!rows.length) return <Empty>{empty}</Empty>;
  return (
    <div className="table-scroll">
      <table>
        <thead><tr>{headers.map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>{rows}</tbody>
      </table>
    </div>
  );
}

export function Stat({ label, value, hint, tone = '', big = false }) {
  return (
    <div className={'stat ' + tone + (big ? ' stat-big' : '')}>
      <span className="stat-label">{label}</span>
      <strong>{value}</strong>
      {hint && <small>{hint}</small>}
    </div>
  );
}

/* ---------- dialogs ---------- */

function useEscape(open, onEscape) {
  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (e.key === 'Escape') onEscape(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onEscape]);
}

export function Dialog({ open, onClose, title, subtitle, children, size = '' }) {
  useEscape(open, onClose);
  if (!open) return null;
  return (
    <div className="dialog-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section className={'dialog ' + size} role="dialog" aria-modal="true" aria-label={title}>
        <header className="dialog-head">
          <div>
            <h3>{title}</h3>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button type="button" className="icon-close" onClick={onClose} aria-label="إغلاق">×</button>
        </header>
        {children}
      </section>
    </div>
  );
}

export function ConfirmDialog({ open, title, message, confirmLabel = 'تأكيد', tone = 'primary', onConfirm, onCancel, busy }) {
  return (
    <Dialog open={open} onClose={onCancel} title={title} size="small">
      <p className="confirm-text">{message}</p>
      <div className="dialog-actions">
        <button type="button" className="outline" onClick={onCancel}>رجوع</button>
        <button type="button" className={tone === 'danger' ? 'danger-btn' : 'primary'} disabled={busy} onClick={onConfirm}>{confirmLabel}</button>
      </div>
    </Dialog>
  );
}

/* ---------- form dialog (simple form or step-by-step wizard) ---------- */

const FieldErrors = createContext({});

// Arabic messages instead of the browser's English validation bubbles.
function validate(el) {
  if (el.disabled || el.closest('[hidden]')) return '';
  const v = el.value.trim();
  if (el.required && !v) return 'الحقل ده مطلوب';
  if (!v) return '';
  if (el.type === 'email' && !/^\S+@\S+\.\S+$/.test(v)) return 'اكتب بريد إلكتروني صحيح';
  if (el.type === 'number') {
    const n = Number(v);
    if (Number.isNaN(n)) return 'اكتب رقم';
    if (el.min !== '' && n < Number(el.min)) return `أقل قيمة ${el.min}`;
    if (el.max !== '' && n > Number(el.max)) return `أكبر قيمة ${el.max}`;
  }
  if (el.minLength > 0 && v.length < el.minLength) return `على الأقل ${el.minLength} حروف`;
  if (el.pattern && !new RegExp('^(?:' + el.pattern + ')$').test(v)) return el.dataset.patternMessage || 'القيمة غير صحيحة';
  return '';
}

// Label/value pairs for the review step, read from the live form, grouped by step.
function describe(form, steps) {
  return steps.map((s, i) => {
    const items = [];
    form.querySelectorAll(`[data-step="${i}"] [data-label]`).forEach((el) => {
      if (el.closest('[data-no-review]') || el.disabled) return;
      let value = el.value;
      if (el.tagName === 'SELECT') value = el.selectedOptions[0]?.textContent || '';
      if (el.tagName === 'FIELDSET') value = [...el.querySelectorAll('input:checked')].map((c) => c.dataset.text).join('، ');
      if (el.type === 'password') value = value ? '••••••••' : '';
      if (el.type === 'number' && value && el.dataset.money !== undefined) value = Number(value).toLocaleString('en') + ' ج.م.';
      items.push({ label: el.dataset.label, value: value || '—' });
    });
    return { title: s.title, items };
  });
}

export function FormDialog({ open, onClose, title, subtitle, steps, submitLabel, onSubmit, error, busy }) {
  const formRef = useRef(null);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState({});
  const [dirty, setDirty] = useState(false);
  const [askDiscard, setAskDiscard] = useState(false);
  const [review, setReview] = useState([]);
  const wizard = steps.length > 1;
  const last = wizard ? steps.length : 0; // index of the review step
  const onReview = wizard && step === last;

  useEffect(() => { if (open) { setStep(0); setErrors({}); setDirty(false); setAskDiscard(false); } }, [open]);
  useEffect(() => {
    if (!open || onReview) return;
    const first = formRef.current?.querySelector(`[data-step="${step}"] input, [data-step="${step}"] select, [data-step="${step}"] textarea`);
    first?.focus();
  }, [open, step, onReview]);

  const requestClose = () => (dirty ? setAskDiscard(true) : onClose());

  function checkStep(i) {
    const scope = wizard ? formRef.current.querySelector(`[data-step="${i}"]`) : formRef.current;
    const found = {};
    scope.querySelectorAll('input[name], select[name], textarea[name]').forEach((el) => {
      const msg = validate(el);
      if (msg) found[el.name] = msg;
    });
    setErrors((e) => {
      const next = { ...e };
      scope.querySelectorAll('[name]').forEach((el) => delete next[el.name]);
      return { ...next, ...found };
    });
    const firstBad = Object.keys(found)[0];
    if (firstBad) scope.querySelector(`[name="${firstBad}"]`)?.focus();
    return !firstBad;
  }

  function next() {
    if (!checkStep(step)) return;
    if (step + 1 === last) setReview(describe(formRef.current, steps));
    setStep(step + 1);
  }

  async function submit(e) {
    e.preventDefault();
    if (wizard && !onReview) return next(); // Enter key moves forward instead of saving
    if (!wizard && !checkStep(0)) return;
    const ok = await onSubmit(new FormData(formRef.current));
    if (ok) onClose();
  }

  return (
    <>
      <Dialog open={open && !askDiscard} onClose={requestClose} title={title} subtitle={subtitle}>
        <form ref={formRef} onSubmit={submit} onInput={() => setDirty(true)} noValidate>
          {wizard && (
            <ol className="stepper" aria-label={`الخطوة ${step + 1} من ${steps.length + 1}`}>
              {[...steps.map((s) => s.title), 'مراجعة وحفظ'].map((t, i) => (
                <li key={t} className={i === step ? 'current' : i < step ? 'done' : ''} aria-current={i === step ? 'step' : undefined}>
                  <b>{i < step ? '✓' : i + 1}</b>
                  <span><small>الخطوة {i + 1}</small>{t}</span>
                </li>
              ))}
            </ol>
          )}
          <FieldErrors.Provider value={errors}>
            {steps.map((s, i) => (
              <div key={i} data-step={i} className={'step-body' + (wizard ? ' card' : '')} hidden={wizard && i !== step}>
                {wizard && s.hint && <p className="step-hint">{s.hint}</p>}
                <div className="form-grid">{s.content}</div>
              </div>
            ))}
          </FieldErrors.Provider>
          {onReview && (
            <div className="review-groups">
              <p className="step-hint">راجع البيانات قبل الحفظ. تقدر ترجع لأي خطوة وتعدّلها.</p>
              {review.map((g, i) => (
                <section key={g.title} className="review-card">
                  <header><h4>{g.title}</h4><button type="button" className="text-btn" onClick={() => setStep(i)}>تعديل</button></header>
                  <dl>{g.items.map((r) => <div key={r.label}><dt>{r.label}</dt><dd>{r.value}</dd></div>)}</dl>
                </section>
              ))}
            </div>
          )}
          {error && <div className="notice error" role="alert">{error}</div>}
          <div className="dialog-actions">
            {wizard && step > 0 && <button type="button" className="outline" onClick={() => setStep(step - 1)}>السابق</button>}
            <span className="spacer" />
            <button type="button" className="ghost" onClick={requestClose}>إلغاء</button>
            {/* different keys: React must not turn the same "Next" button into "Save" mid-click */}
            {wizard && !onReview
              ? <button key="next" type="button" className="primary" onClick={next}>التالي</button>
              : <button key="save" type="submit" className="primary" disabled={busy}>{busy ? 'جارٍ الحفظ…' : submitLabel}</button>}
          </div>
        </form>
      </Dialog>
      <ConfirmDialog
        open={open && askDiscard}
        title="تجاهل البيانات؟"
        message="البيانات اللي كتبتها مش هتتحفظ."
        confirmLabel="تجاهل وإغلاق"
        tone="danger"
        onCancel={() => setAskDiscard(false)}
        onConfirm={() => { setAskDiscard(false); onClose(); }}
      />
    </>
  );
}

export function Field({ label, name, hint, full, type = 'text', ...rest }) {
  const errors = useContext(FieldErrors);
  const err = errors[name];
  return (
    <label className={'field' + (full ? ' full' : '') + (err ? ' invalid' : '')}>
      <span>{label}{rest.required && <i aria-hidden="true"> *</i>}</span>
      <input name={name} type={type} data-label={label} aria-invalid={!!err} {...rest} />
      {err ? <small className="field-error">{err}</small> : hint && <small>{hint}</small>}
    </label>
  );
}

export function SelectField({ label, name, options, hint, full, placeholder, ...rest }) {
  const errors = useContext(FieldErrors);
  const err = errors[name];
  return (
    <label className={'field' + (full ? ' full' : '') + (err ? ' invalid' : '')}>
      <span>{label}{rest.required && <i aria-hidden="true"> *</i>}</span>
      <select name={name} data-label={label} aria-invalid={!!err} {...rest}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {err ? <small className="field-error">{err}</small> : hint && <small>{hint}</small>}
    </label>
  );
}

// Several checkboxes under one label (e.g. the apartments of one user).
export function CheckGroup({ label, name, options, hint, empty = 'لا توجد اختيارات', full = true, defaultChecked = [] }) {
  return (
    <fieldset className={'field check-group' + (full ? ' full' : '')} data-label={label}>
      <span>{label}</span>
      {options.length ? (
        <div className="check-grid">
          {options.map((o) => (
            <label key={o.value} className={'check-tile' + (o.disabled ? ' disabled' : '')}>
              <input type="checkbox" name={name} value={o.value} data-text={o.label} disabled={o.disabled} defaultChecked={defaultChecked.includes(o.value)} />
              <span>{o.label}</span>
              {o.note && <small>{o.note}</small>}
            </label>
          ))}
        </div>
      ) : <small>{empty}</small>}
      {hint && <small>{hint}</small>}
    </fieldset>
  );
}
