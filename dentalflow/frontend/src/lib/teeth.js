/**
 * Tooth chart data. Teeth are named by quadrant + position from the midline:
 * UR / UL / LR / LL and 1 (central incisor) … 8 (third molar).
 * Notes are stored per part: G whole tooth, B L O M D crown surfaces, R root.
 */

export const QUADRANTS = {
  UR: 'Upper right',
  UL: 'Upper left',
  LR: 'Lower right',
  LL: 'Lower left',
};

const POSITION_NAMES = {
  1: 'central incisor',
  2: 'lateral incisor',
  3: 'canine',
  4: 'first premolar',
  5: 'second premolar',
  6: 'first molar',
  7: 'second molar',
  8: 'third molar',
};

/** Chart order, as seen when facing the patient */
export const UPPER = [
  ...[8, 7, 6, 5, 4, 3, 2, 1].map((n) => `UR${n}`),
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => `UL${n}`),
];
export const LOWER = [
  ...[8, 7, 6, 5, 4, 3, 2, 1].map((n) => `LR${n}`),
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => `LL${n}`),
];
export const ALL_TEETH = [...UPPER, ...LOWER];

export const toothNumber = (id) => Number(id.slice(2));
export const isUpper = (id) => id.startsWith('U');
export const toothName = (id) => `${QUADRANTS[id.slice(0, 2)]} ${POSITION_NAMES[toothNumber(id)]}`;

export const PARTS = ['G', 'R', 'B', 'L', 'O', 'M', 'D'];
export const CROWN_SURFACES = ['B', 'L', 'O', 'M', 'D'];

/** Readable name of a note part for a given tooth */
export function partName(part, id) {
  const anterior = id ? toothNumber(id) <= 3 : false;
  const upper = id ? isUpper(id) : false;
  switch (part) {
    case 'G':
      return 'Whole tooth';
    case 'R':
      return 'Root';
    case 'B':
      return anterior ? 'Labial' : 'Buccal';
    case 'L':
      return id ? (upper ? 'Palatal' : 'Lingual') : 'Lingual / palatal';
    case 'O':
      return anterior ? 'Incisal' : 'Occlusal';
    case 'M':
      return 'Mesial';
    case 'D':
      return 'Distal';
    default:
      return part;
  }
}

/** Notes text → { G?, B?, L?, O?, M?, D?, R? } (plain text from older records = occlusal) */
export function parseNotes(raw) {
  const out = {};
  if (!raw || typeof raw !== 'string') return out;
  const text = raw.trim();
  if (!text) return out;
  if (text.startsWith('{')) {
    try {
      const obj = JSON.parse(text);
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
        for (const p of PARTS) if (typeof obj[p] === 'string' && obj[p].trim()) out[p] = obj[p];
        return out;
      }
    } catch {
      /* plain text */
    }
  }
  out.O = text;
  return out;
}

export function serializeNotes(notes) {
  const clean = {};
  for (const p of PARTS) {
    const v = notes?.[p];
    if (typeof v === 'string' && v.trim()) clean[p] = v.trim();
  }
  return Object.keys(clean).length ? JSON.stringify(clean) : '';
}

export const hasCrownNote = (notes) => ['G', ...CROWN_SURFACES].some((p) => notes[p]);
export const hasRootNote = (notes) => Boolean(notes.R);

/** Tooth shape type used for drawing */
export function toothKind(id) {
  const n = toothNumber(id);
  if (n >= 6) return 'molar';
  if (n >= 4) return 'premolar';
  if (n === 3) return 'canine';
  return n === 1 ? 'central' : 'lateral';
}

/** Readable text colour on top of a status colour */
export function contrastInk(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return '#17231f';
  const v = parseInt(m[1], 16);
  const r = (v >> 16) & 255;
  const g = (v >> 8) & 255;
  const b = v & 255;
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? '#17231f' : '#ffffff';
}

/** Common procedures offered as suggestions (doctors can type anything) */
export const COMMON_PROCEDURES = [
  'Consultation',
  'Scaling and polishing',
  'Composite filling',
  'GIC filling',
  'Root canal treatment',
  'Re-root canal treatment',
  'Pulpectomy',
  'Post and core',
  'PFM crown',
  'Zirconia crown',
  'Metal crown',
  'Extraction',
  'Surgical extraction',
  'Wisdom tooth removal',
  'Dental implant',
  'Bridge',
  'Complete denture',
  'Partial denture',
  'Braces',
  'Clear aligners',
  'Teeth whitening',
  'Fluoride application',
  'Pit and fissure sealant',
  'Gum treatment',
  'Night guard',
  'X-ray (IOPA)',
];

/** Colours of a tooth record: { crown, root } status ids ('' = none) */
export function coloursOf(rec) {
  if (!rec) return { crown: '', root: '' };
  const crown = rec.crown_status || '';
  const root = rec.root_status || '';
  // records saved before crown/root colours existed had one status for the whole tooth
  if (!crown && !root && rec.status) return { crown: rec.status, root: rec.status };
  return { crown, root };
}

/** Statuses that can be used on a part ('crown' | 'root') */
export const statusesFor = (statuses, part) => statuses.filter((s) => !s.part || s.part === 'both' || s.part === part);

export const PART_LABEL = { both: 'Crown and root', crown: 'Crown', root: 'Root' };
