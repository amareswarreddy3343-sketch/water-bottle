import { parseLocalDate } from '../utils/date';

const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 0 });
const inr2 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 });

export const toNumber = (v) => {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

/** ₹1,23,450 (Indian grouping; paise shown only when present) */
export function money(v) {
  const n = toNumber(v);
  const s = Number.isInteger(Math.round(n * 100) / 100) ? inr.format(n) : inr2.format(n);
  return `${n < 0 ? '−' : ''}₹${s.replace('-', '')}`;
}

/** ₹1,23,450.00 — for receipts */
export const money2 = (v) => {
  const n = toNumber(v);
  return `${n < 0 ? '−' : ''}₹${inr2.format(Math.abs(n))}`;
};

const dateFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const shortFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' });
const longFmt = new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const timeFmt = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit' });

const toDate = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? parseLocalDate(v) : new Date(v));

export const fmtDate = (v) => (v ? dateFmt.format(toDate(v)) : '');
export const fmtLongDate = (v) => (v ? longFmt.format(toDate(v)) : '');
export const fmtTime = (v) => (v ? timeFmt.format(new Date(v)) : '');

/** "12 Mar" this year, "12 Mar 2025" otherwise */
export function fmtShort(v) {
  if (!v) return '';
  const d = toDate(v);
  return d.getFullYear() === new Date().getFullYear() ? shortFmt.format(d) : dateFmt.format(d);
}

/** "10:30" (24-hour, as saved) → "10:30 am" */
export function fmtClock(hhmm) {
  if (!hhmm || !/^\d{2}:\d{2}$/.test(hhmm)) return '';
  const [h, m] = hhmm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h >= 12 ? 'pm' : 'am'}`;
}

export const fmtDateTime = (v) => (v ? `${fmtShort(v)}, ${fmtTime(v)}` : '');

export const genderLabel = (g) => ({ male: 'Male', female: 'Female', other: 'Other' })[g] || g || '';

/** "Female, 52" */
export const patientFacts = (p) => [genderLabel(p?.gender), p?.age != null ? `${p.age} yrs` : null].filter(Boolean).join(', ');

export const initials = (name = '') =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('') || '?';

export function greeting(date = new Date()) {
  const h = date.getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
  'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function belowHundred(n) {
  if (n < 20) return ONES[n];
  return `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ''}`;
}

function belowThousand(n) {
  const h = Math.floor(n / 100);
  const r = n % 100;
  return [h ? `${ONES[h]} Hundred` : '', r ? belowHundred(r) : ''].filter(Boolean).join(' ');
}

/** 125050.5 → "One Lakh Twenty Five Thousand Fifty Rupees and Fifty Paise" (Indian system) */
export function rupeesInWords(value) {
  const n = Math.abs(toNumber(value));
  let rupees = Math.floor(n);
  const paise = Math.round((n - rupees) * 100);
  if (rupees === 0 && paise === 0) return 'Zero Rupees';
  const parts = [];
  const crore = Math.floor(rupees / 10000000);
  rupees %= 10000000;
  const lakh = Math.floor(rupees / 100000);
  rupees %= 100000;
  const thousand = Math.floor(rupees / 1000);
  rupees %= 1000;
  if (crore) parts.push(`${belowThousand(crore)} Crore`);
  if (lakh) parts.push(`${belowHundred(lakh)} Lakh`);
  if (thousand) parts.push(`${belowHundred(thousand)} Thousand`);
  if (rupees) parts.push(belowThousand(rupees));
  let out = parts.length ? `${parts.join(' ')} Rupees` : '';
  if (paise) out += `${out ? ' and ' : ''}${belowHundred(paise)} Paise`;
  return out;
}
