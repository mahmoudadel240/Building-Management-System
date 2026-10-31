// Formatting helpers. Arabic text with Western digits everywhere, so numbers read the same
// in money, counts and dates.
const LOCALE = 'ar-EG-u-nu-latn';

const moneyFmt = new Intl.NumberFormat(LOCALE, { style: 'currency', currency: 'EGP', maximumFractionDigits: 0 });
const numberFmt = new Intl.NumberFormat(LOCALE);
const dateFmt = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' });
const dateTimeFmt = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const monthFmt = new Intl.DateTimeFormat(LOCALE, { month: 'long', year: 'numeric' });

export const money = (n) => moneyFmt.format(Number(n || 0));
export const num = (n) => numberFmt.format(Number(n || 0));
export const date = (d) => (d ? dateFmt.format(new Date(d)) : '—');
export const dateTime = (d) => (d ? dateTimeFmt.format(new Date(d)) : '—');
// period_month is a plain date (YYYY-MM-01); parse it as local time so the month never shifts.
export const month = (d) => (d ? monthFmt.format(new Date(d + 'T00:00:00')) : '—');
export const today = () => new Date().toISOString().slice(0, 10);
export const thisMonth = () => today().slice(0, 7) + '-01';

export const STATUS = {
  pending: { label: 'قيد المراجعة', tone: 'warning' },
  approved: { label: 'معتمد', tone: 'success' },
  rejected: { label: 'مرفوض', tone: 'danger' },
  voided: { label: 'ملغي', tone: 'muted' },
};

export const ROLE_LABEL = {
  owner: 'مالك النظام',
  superuser: 'مدير أعلى',
  admin: 'مدير عمارة',
  resident: 'ساكن',
  accountant: 'محاسب',
  viewer: 'مشاهد',
};

export const METHOD_LABEL = { cash: 'نقدي', bank: 'تحويل بنكي', instapay: 'إنستاباي', wallet: 'محفظة إلكترونية' };

export const personName = (p) => p?.display_name || p?.username || (p?.email && !p.email.endsWith('@username.invalid') ? p.email : '') || 'مستخدم';

// Arabic count of months: شهر / شهرين / 3 شهور / 11 شهر
export const months = (n) => {
  n = Number(n || 0);
  if (n === 1) return 'شهر واحد';
  if (n === 2) return 'شهرين';
  if (n >= 3 && n <= 10) return `${n} شهور`;
  return `${n} شهر`;
};
