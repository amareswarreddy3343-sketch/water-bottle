/**
 * Tooth notes are stored as JSON text with one entry per part of the tooth:
 *   G = whole tooth (general), B/L/O/M/D = crown surfaces, R = root.
 * Records written by the original app may contain plain text; that text is
 * treated as the occlusal (O) note, exactly like the original tooth chart did.
 */
export const TOOTH_PARTS = ['G', 'B', 'L', 'O', 'M', 'D', 'R'];

export function parseToothNotes(raw) {
  const out = {};
  if (!raw || typeof raw !== 'string') return out;
  const text = raw.trim();
  if (!text) return out;
  if (text.startsWith('{')) {
    try {
      const obj = JSON.parse(text);
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
        for (const part of TOOTH_PARTS) {
          if (typeof obj[part] === 'string' && obj[part].trim()) out[part] = obj[part];
        }
        return out;
      }
    } catch {
      // not JSON — fall through to plain text
    }
  }
  out.O = text;
  return out;
}

/** JSON text with only the non-empty parts ('' when nothing is left) */
export function serializeToothNotes(notes) {
  const clean = {};
  for (const part of TOOTH_PARTS) {
    const value = notes?.[part];
    if (typeof value === 'string' && value.trim()) clean[part] = value.trim();
  }
  return Object.keys(clean).length ? JSON.stringify(clean) : '';
}
