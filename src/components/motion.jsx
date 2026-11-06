import React, { useEffect, useRef, useState } from 'react';

export const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// Counts the number inside a formatted string (e.g. "48,250 ج.م" or "85%") up from the
// previous value. The text around the number and its formatting stay as they were.
const fmt = new Intl.NumberFormat('ar-EG-u-nu-latn', { maximumFractionDigits: 2 });
export function CountUp({ value, ms = 900 }) {
  const text = String(value ?? '');
  const match = text.match(/\d[\d,.٬]*/);
  const target = match ? parseFloat(match[0].replace(/[,٬]/g, '')) : NaN;
  const prev = useRef(0);
  const [shown, setShown] = useState(reducedMotion() ? target : 0);

  useEffect(() => {
    if (Number.isNaN(target)) return undefined;
    if (reducedMotion()) { setShown(target); prev.current = target; return undefined; }
    const from = prev.current, t0 = performance.now();
    let raf;
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / ms);
      setShown(from + (target - from) * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick); else prev.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);

  if (!match) return text;
  const decimals = (match[0].split('.')[1] || '').length;
  const out = decimals ? shown.toFixed(decimals) : fmt.format(Math.round(shown));
  return <>{text.replace(match[0], out)}</>;
}

// A ring that fills to `pct`, pulses and turns green on reaching 100.
export function Ring({ pct = 0, size = 64 }) {
  const p = Math.max(0, Math.min(100, Number(pct) || 0));
  const r = 26, c = 2 * Math.PI * r;
  return (
    <span className={'ring' + (p >= 100 ? ' full' : '')} style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="0 0 64 64">
        <circle className="ring-bg" cx="32" cy="32" r={r} />
        <circle className="ring-fg" cx="32" cy="32" r={r} style={{ '--c': c, '--to': c * (1 - p / 100) }} />
      </svg>
    </span>
  );
}

// A few coral dots that burst outward once, around whatever they sit inside.
export function Sparks({ n = 9 }) {
  return (
    <span className="sparks" aria-hidden="true">
      {Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2, d = 46 + (i % 3) * 12;
        return <i key={i} style={{ '--x': `${Math.cos(a) * d}px`, '--y': `${Math.sin(a) * d * 0.55}px` }} />;
      })}
    </span>
  );
}

// Theme change as a circle that grows from the toggle button (browsers without View
// Transitions just switch).
export function switchTheme(apply, button) {
  const doc = document;
  if (!doc.startViewTransition || reducedMotion()) { apply(); return; }
  const r = button?.getBoundingClientRect();
  const x = r ? r.left + r.width / 2 : innerWidth / 2, y = r ? r.top + r.height / 2 : 0;
  const end = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  const t = doc.startViewTransition(apply);
  t.ready.then(() => {
    doc.documentElement.animate(
      { clipPath: [`circle(0 at ${x}px ${y}px)`, `circle(${end}px at ${x}px ${y}px)`] },
      { duration: 650, easing: 'cubic-bezier(.22,1,.36,1)', pseudoElement: '::view-transition-new(root)' });
  }).catch(() => {});
}
