/**
 * Money helpers. Amounts are stored as numbers rounded to 2 decimal places
 * (the original schema used DECIMAL(10,2)).
 */

/** Round half away from zero to 2 decimal places without binary float surprises */
export function roundMoney(value) {
  const n = Number(value) || 0;
  const rounded = Math.round(Math.abs(n) * 100 + Number.EPSILON * 100) / 100;
  return n < 0 ? -rounded : rounded;
}

/** "1500.00" — the string format Django REST Framework used for DecimalFields */
export function moneyString(value) {
  return roundMoney(value).toFixed(2);
}

/** Like moneyString but keeps null as null (for nullable decimal fields) */
export function moneyStringOrNull(value) {
  return value === null || value === undefined ? null : moneyString(value);
}

/** Sum a list of amounts safely (works in integer paise to avoid float drift) */
export function sumMoney(values) {
  const paise = values.reduce((acc, v) => acc + Math.round((Number(v) || 0) * 100), 0);
  return paise / 100;
}
