/**
 * Error helpers.
 *
 * Response shapes intentionally match the original Django REST Framework API so the
 * React frontend keeps working unchanged:
 *   - simple errors:      { "error": "Patient ABC123 not found" }
 *   - field validation:   { "error": { "email": ["Enter a valid email address."] } }
 *   - auth (401) errors:  { "detail": "Authentication credentials were not provided." }
 */

export class HttpError extends Error {
  constructor(status, body) {
    super(typeof body?.error === 'string' ? body.error : body?.detail || `HTTP ${status}`);
    this.name = 'HttpError';
    this.status = status;
    this.body = body;
  }
}

/** { error: "message" } with the given status */
export const apiError = (status, message) => new HttpError(status, { error: message });

export const badRequest = (message) => apiError(400, message);
export const forbidden = (message) => apiError(403, message);
export const notFound = (message) => apiError(404, message);

/** DRF-style field errors: { error: { field: [messages] } } */
export const fieldErrors = (errors, status = 400) => new HttpError(status, { error: errors });

/** DRF-style authentication failure: { detail, code? } with 401 */
export const authError = (detail, code, extra = {}) =>
  new HttpError(401, { detail, ...(code ? { code } : {}), ...extra });
