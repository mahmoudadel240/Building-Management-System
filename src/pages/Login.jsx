import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { errorText } from '../lib/errors';

export default function Login() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  async function signIn(e) {
    e.preventDefault();
    setBusy(true); setError(''); setInfo('');
    try {
      const { data, error } = await supabase.functions.invoke('login-with-username', { body: { identifier: identifier.trim(), password } });
      if (error) throw new Error(await errorText(error));
      if (data?.error) throw new Error(data.error);
      if (!data?.session) throw new Error('تعذر تسجيل الدخول');
      const { error: setErr } = await supabase.auth.setSession(data.session);
      if (setErr) throw setErr;
    } catch (err) {
      setError(err.message || 'بيانات الدخول غير صحيحة');
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    setError(''); setInfo('');
    if (!identifier.trim()) { setError('اكتب اسم المستخدم أو البريد الأول'); return; }
    setBusy(true);
    const { data, error } = await supabase.functions.invoke('request-password-reset', { body: { identifier: identifier.trim() } });
    setBusy(false);
    if (error) setError(await errorText(error));
    else setInfo(data?.message || 'لو الحساب مرتبط ببريد إلكتروني، هيوصله رابط إعادة التعيين.');
  }

  return (
    <main className="center-screen login" dir="rtl">
      <div className="panel narrow">
        <div className="brand-mark big">B</div>
        <h1>إدارة العمارات</h1>
        <p className="muted-text">سجّل الدخول باسم المستخدم أو البريد الإلكتروني.</p>
        <form onSubmit={signIn} className="login-form">
          <label className="field">
            <span>اسم المستخدم أو البريد الإلكتروني</span>
            <input required autoComplete="username" value={identifier} onChange={(e) => setIdentifier(e.target.value)} />
          </label>
          <label className="field">
            <span>كلمة المرور</span>
            <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          {error && <div className="notice error" role="alert">{error}</div>}
          {info && <div className="notice" role="status">{info}</div>}
          <button className="primary full" disabled={busy}>{busy ? 'جارٍ الدخول…' : 'تسجيل الدخول'}</button>
        </form>
        <button type="button" className="link-btn" disabled={busy} onClick={reset}>نسيت كلمة المرور؟</button>
      </div>
    </main>
  );
}
