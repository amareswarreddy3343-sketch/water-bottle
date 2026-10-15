/**
 * Turn any API error into a readable string.
 *
 * The API returns errors as { error: "message" }, { error: { field: ["message"] } }
 * or { detail: "message" }. Rendering the object form directly used to crash React
 * ("Objects are not valid as a React child"), so every error shown in the UI goes
 * through this helper.
 *
 * @param {unknown} err              axios error
 * @param {string}  fallback         message when nothing usable is found
 * @param {string[]} preferredFields field names to report first (in order)
 */
export function getErrorMessage(err, fallback = 'Something went wrong.', preferredFields = []) {
  const data = err?.response?.data;
  const payload = data?.error ?? data?.detail ?? data?.message;
  return firstMessage(payload, preferredFields) || fallback;
}

function firstMessage(value, preferred = []) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      const msg = firstMessage(item);
      if (msg) return msg;
    }
    return null;
  }
  if (typeof value === 'object') {
    for (const key of preferred) {
      const msg = firstMessage(value[key]);
      if (msg) return msg;
    }
    for (const item of Object.values(value)) {
      const msg = firstMessage(item);
      if (msg) return msg;
    }
  }
  return null;
}
