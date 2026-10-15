/**
 * Date-only helpers that use the browser's LOCAL calendar day.
 *
 * `new Date().toISOString().split('T')[0]` returns the UTC date, which in India is
 * still "yesterday" between 00:00 and 05:30 — so default treatment dates and the
 * appointment "TODAY" badge were wrong in the early morning.
 */

/** 'YYYY-MM-DD' for the local calendar day */
export function localDateISO(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Parse 'YYYY-MM-DD' as a local date (avoids the UTC shift of new Date('YYYY-MM-DD')) */
export function parseLocalDate(value) {
  if (typeof value === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
  return new Date(value);
}

/** 'YYYY-MM-DD' plus n days (calendar arithmetic, no time-zone surprises) */
export function addDaysISO(value, n) {
  const d = parseLocalDate(value);
  d.setDate(d.getDate() + n);
  return localDateISO(d);
}
