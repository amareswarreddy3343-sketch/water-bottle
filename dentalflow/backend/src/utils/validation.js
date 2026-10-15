/**
 * Small field parsers that reproduce Django REST Framework's validation rules and
 * error messages, so the API behaves exactly like the original backend.
 *
 * Usage:
 *   const v = new Validator(req.body);
 *   const email = v.email('email');
 *   const age   = v.integer('age', { min: 0 });
 *   v.throwIfErrors();          // -> 400 { error: { field: [msg] } }
 */
import { fieldErrors } from './errors.js';

const SKIP = Symbol('skip');

const TRUE_VALUES = new Set(['t', 'T', 'y', 'Y', 'yes', 'Yes', 'YES', 'true', 'True', 'TRUE', 'on', 'On', 'ON', '1', 1, true]);
const FALSE_VALUES = new Set(['f', 'F', 'n', 'N', 'no', 'No', 'NO', 'false', 'False', 'FALSE', 'off', 'Off', 'OFF', '0', 0, 0.0, false]);

// Same pattern Django's EmailValidator accepts for the common cases
const EMAIL_RE =
  /^[-!#$%&'*+/=?^_`{}|~0-9A-Z]+(\.[-!#$%&'*+/=?^_`{}|~0-9A-Z]+)*@((?:[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?\.)+[A-Z0-9-]{2,63}(?<!-))$/i;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export class FieldError extends Error {
  constructor(message) {
    super(message);
    this.name = 'FieldError';
  }
}

const fail = (message) => {
  throw new FieldError(message);
};

/** Returns true when the value is a real calendar date in YYYY-MM-DD form. */
export function isValidDateString(value) {
  if (typeof value !== 'string') return false;
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

// ── Individual field parsers (throw FieldError) ─────────────────────────────

/** Handles missing / null exactly like DRF's Field.validate_empty_values */
function handleEmpty(value, { required = true, allowNull = false, defaultValue } = {}) {
  if (value === undefined) {
    if (defaultValue !== undefined) return { done: true, value: defaultValue };
    if (required) fail('This field is required.');
    return { done: true, value: SKIP };
  }
  if (value === null) {
    if (!allowNull) fail('This field may not be null.');
    return { done: true, value: null };
  }
  return { done: false };
}

export function parseChar(value, opts = {}) {
  const { allowBlank = false, trim = true, maxLength, minLength } = opts;
  const empty = handleEmpty(value, opts);
  if (empty.done) return empty.value;

  if (typeof value === 'boolean' || !['string', 'number'].includes(typeof value)) {
    fail('Not a valid string.');
  }
  let str = String(value);
  if (trim) str = str.trim();
  if (str === '') {
    if (!allowBlank) fail('This field may not be blank.');
    return '';
  }
  if (maxLength !== undefined && str.length > maxLength) {
    fail(`Ensure this field has no more than ${maxLength} characters.`);
  }
  if (minLength !== undefined && str.length < minLength) {
    fail(`Ensure this field has at least ${minLength} characters.`);
  }
  return str;
}

export function parseEmail(value, opts = {}) {
  const str = parseChar(value, { maxLength: 254, ...opts });
  if (str === SKIP || str === null || str === '') return str;
  if (!EMAIL_RE.test(str)) fail('Enter a valid email address.');
  return str;
}

export function parseInteger(value, opts = {}) {
  const { min, max = 2147483647 } = opts;
  const empty = handleEmpty(value, opts);
  if (empty.done) return empty.value;

  let n;
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) fail('A valid integer is required.');
    n = value;
  } else if (typeof value === 'string') {
    const s = value.trim().replace(/\.0*\s*$/, '');
    if (s === '' || s.length > 1000 || !/^[-+]?\d+$/.test(s)) fail('A valid integer is required.');
    n = Number(s);
  } else {
    fail('A valid integer is required.');
  }
  if (min !== undefined && n < min) fail(`Ensure this value is greater than or equal to ${min}.`);
  if (max !== undefined && n > max) fail(`Ensure this value is less than or equal to ${max}.`);
  return n;
}

/** DRF DecimalField(max_digits, decimal_places) — returns a JS number rounded to `decimalPlaces` */
export function parseDecimal(value, opts = {}) {
  const { maxDigits = 10, decimalPlaces = 2, min } = opts;
  const empty = handleEmpty(value, opts);
  if (empty.done) return empty.value;

  if (typeof value === 'boolean' || !['string', 'number'].includes(typeof value)) {
    fail('A valid number is required.');
  }
  const s = String(value).trim();
  if (s === '' || s.length > 1000 || !/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s)) {
    fail('A valid number is required.');
  }
  const n = Number(s);
  if (!Number.isFinite(n)) fail('A valid number is required.');

  // Same precision rules as DRF's DecimalField.validate_precision (based on Decimal.as_tuple())
  const { digits, exponent } = decimalTuple(s);
  let total;
  let whole;
  let places;
  if (exponent >= 0) {
    total = digits + exponent;
    whole = total;
    places = 0;
  } else if (digits > -exponent) {
    total = digits;
    whole = total + exponent;
    places = -exponent;
  } else {
    total = -exponent;
    whole = 0;
    places = total;
  }
  if (total > maxDigits) fail(`Ensure that there are no more than ${maxDigits} digits in total.`);
  if (places > decimalPlaces) fail(`Ensure that there are no more than ${decimalPlaces} decimal places.`);
  if (whole > maxDigits - decimalPlaces) {
    fail(`Ensure that there are no more than ${maxDigits - decimalPlaces} digits before the decimal point.`);
  }
  if (min !== undefined && n < min) fail(`Ensure this value is greater than or equal to ${min}.`);
  return Number(n.toFixed(decimalPlaces));
}

/** Mimics Python's Decimal(s).as_tuple() → number of digits and exponent */
function decimalTuple(s) {
  let str = s.replace(/^[-+]/, '');
  let exponent = 0;
  const eIdx = str.search(/[eE]/);
  if (eIdx >= 0) {
    exponent = parseInt(str.slice(eIdx + 1), 10);
    str = str.slice(0, eIdx);
  }
  const [intPart = '', fracPart = ''] = str.split('.');
  exponent -= fracPart.length;
  const digits = (intPart + fracPart).replace(/^0+/, '') || '0';
  return { digits: digits.length, exponent };
}

export function parseChoice(value, choices, opts = {}) {
  const empty = handleEmpty(value, opts);
  if (empty.done) return empty.value;
  const key = typeof value === 'string' ? value : String(value);
  if (!choices.includes(key)) fail(`"${value}" is not a valid choice.`);
  return key;
}

export function parseBoolean(value, opts = {}) {
  const empty = handleEmpty(value, opts);
  if (empty.done) return empty.value;
  if (TRUE_VALUES.has(value)) return true;
  if (FALSE_VALUES.has(value)) return false;
  fail('Must be a valid boolean.');
  return undefined;
}

export function parseDate(value, opts = {}) {
  const empty = handleEmpty(value, opts);
  if (empty.done) return empty.value;
  if (typeof value !== 'string' || !isValidDateString(value.trim())) {
    fail('Date has wrong format. Use one of these formats instead: YYYY-MM-DD.');
  }
  return value.trim();
}

/**
 * A list of short texts (e.g. comorbidities). Trims each item, drops blanks and
 * case-insensitive duplicates (first spelling wins).
 */
export function parseStringList(value, opts = {}) {
  const { maxItems = 50, maxLength = 60 } = opts;
  const empty = handleEmpty(value, opts);
  if (empty.done) return empty.value;
  if (!Array.isArray(value)) fail('Expected a list of items but got type "' + typeof value + '".');
  const seen = new Set();
  const out = [];
  for (const item of value) {
    if (typeof item !== 'string' && typeof item !== 'number') fail('Not a valid string.');
    const str = String(item).trim().replace(/\s+/g, ' ');
    if (!str) continue;
    if (str.length > maxLength) fail(`Ensure each item has no more than ${maxLength} characters.`);
    const key = str.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(str);
  }
  if (out.length > maxItems) fail(`Ensure this list has no more than ${maxItems} items.`);
  return out;
}

// ── Collector ───────────────────────────────────────────────────────────────

export class Validator {
  constructor(data) {
    this.data = data && typeof data === 'object' ? data : {};
    this.errors = {};
  }

  run(field, fn) {
    try {
      const v = fn(this.data[field]);
      return v === SKIP ? undefined : v;
    } catch (err) {
      if (err instanceof FieldError) {
        this.addError(field, err.message);
        return undefined;
      }
      throw err;
    }
  }

  has(field) {
    return Object.prototype.hasOwnProperty.call(this.data, field);
  }

  addError(field, message) {
    (this.errors[field] ||= []).push(message);
  }

  hasErrors(field) {
    return field ? Boolean(this.errors[field]) : Object.keys(this.errors).length > 0;
  }

  char(field, opts) { return this.run(field, (v) => parseChar(v, opts)); }
  email(field, opts) { return this.run(field, (v) => parseEmail(v, opts)); }
  integer(field, opts) { return this.run(field, (v) => parseInteger(v, opts)); }
  decimal(field, opts) { return this.run(field, (v) => parseDecimal(v, opts)); }
  choice(field, choices, opts) { return this.run(field, (v) => parseChoice(v, choices, opts)); }
  boolean(field, opts) { return this.run(field, (v) => parseBoolean(v, opts)); }
  date(field, opts) { return this.run(field, (v) => parseDate(v, opts)); }
  stringList(field, opts) { return this.run(field, (v) => parseStringList(v, opts)); }

  throwIfErrors(status = 400) {
    if (this.hasErrors()) throw fieldErrors(this.errors, status);
  }
}

export default Validator;
