/**
 * Date helpers that work in the clinic's time zone (TIME_ZONE, default Asia/Kolkata),
 * matching Django's USE_TZ + TIME_ZONE behaviour for "today" calculations.
 */
import config from '../config/env.js';

const dateFormatters = new Map();
const offsetFormatters = new Map();

function getDateFormatter(timeZone) {
  if (!dateFormatters.has(timeZone)) {
    dateFormatters.set(
      timeZone,
      new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }),
    );
  }
  return dateFormatters.get(timeZone);
}

function getOffsetFormatter(timeZone) {
  if (!offsetFormatters.has(timeZone)) {
    offsetFormatters.set(timeZone, new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' }));
  }
  return offsetFormatters.get(timeZone);
}

/** 'YYYY-MM-DD' for the given instant in the clinic time zone */
export function localDateString(date = new Date(), timeZone = config.timeZone) {
  const parts = getDateFormatter(timeZone).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/**
 * Today's date ('YYYY-MM-DD') in the clinic time zone — like django.utils.timezone.localdate().
 * CLINIC_FAKE_TODAY=YYYY-MM-DD pretends it is another day (only for testing "on that day" features).
 */
export const today = (timeZone = config.timeZone) => {
  const fake = (process.env.CLINIC_FAKE_TODAY || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(fake)) return fake;
  return localDateString(new Date(), timeZone);
};

/** 'YYYY-MM-DD' plus n days */
export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** UTC offset of the time zone at a given instant, in minutes (e.g. +330 for Asia/Kolkata) */
function offsetMinutes(date, timeZone) {
  const name = getOffsetFormatter(timeZone)
    .formatToParts(date)
    .find((p) => p.type === 'timeZoneName')?.value;
  const m = /GMT([+-])(\d{2}):?(\d{2})?/.exec(name || '');
  if (!m) return 0; // "GMT" (UTC)
  const sign = m[1] === '-' ? -1 : 1;
  return sign * (Number(m[2]) * 60 + Number(m[3] || 0));
}

/** UTC instant of local midnight for a 'YYYY-MM-DD' date in the clinic time zone */
export function startOfLocalDay(dateStr, timeZone = config.timeZone) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const utcMidnight = Date.UTC(y, m - 1, d);
  // Two passes handle DST transitions correctly
  let guess = utcMidnight - offsetMinutes(new Date(utcMidnight), timeZone) * 60000;
  guess = utcMidnight - offsetMinutes(new Date(guess), timeZone) * 60000;
  return new Date(guess);
}

/** [start, end) UTC range covering one local calendar day */
export function localDayRange(dateStr = today(), timeZone = config.timeZone) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  return { start: startOfLocalDay(dateStr, timeZone), end: startOfLocalDay(next, timeZone) };
}
