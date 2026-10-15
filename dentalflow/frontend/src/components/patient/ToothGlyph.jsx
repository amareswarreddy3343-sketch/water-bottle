import { toothKind } from '../../lib/teeth';

/*
 * Tooth outlines drawn in a 40×100 box with the crown at the top (lower teeth);
 * upper teeth are mirrored so every crown faces the bite line in the middle of
 * the chart and roots point outwards.
 */
const SHAPES = {
  molar: {
    crown:
      'M5 13C5 5 9 3 12.5 5.5 15 3 18 3 20 5.5 22 3 25 3 27.5 5.5 31 3 35 5 35 13L34 33C34 37 30 39 20 39 10 39 6 37 6 33Z',
    root: 'M8 37C7 55 8 74 11 90 12 95 16 95 16.5 89L18.5 52C19 48 21 48 21.5 52L23.5 89C24 95 28 95 29 90 32 74 33 55 32 37Z',
  },
  premolar: {
    crown: 'M9 12C9 5 14 2 20 2 26 2 31 5 31 12L30 33C30 37 26 39 20 39 14 39 10 37 10 33Z',
    root: 'M11 37C11 60 15 82 18.5 95 19 98 21 98 21.5 95 25 82 29 60 29 37Z',
  },
  canine: {
    crown: 'M10 16C10 9 15 3 20 .5 25 3 30 9 30 16L29.5 33C29.5 37 26 39 20 39 14 39 10.5 37 10.5 33Z',
    root: 'M12 37C12 62 16 86 19 98.5 19.5 100 20.5 100 21 98.5 24 86 28 62 28 37Z',
  },
  central: {
    crown: 'M8.5 4C8.5 2.5 10 2 12 2H28C30 2 31.5 2.5 31.5 4L30.5 33C30.5 37 26.5 39 20 39 13.5 39 9.5 37 9.5 33Z',
    root: 'M11.5 37C12 60 16 82 19 93 19.5 95 20.5 95 21 93 24 82 28 60 28.5 37Z',
  },
  lateral: {
    crown: 'M10.5 5C10.5 3.5 12 3 14 3H26C28 3 29.5 3.5 29.5 5L29 33C29 37 25.5 39 20 39 14.5 39 11 37 11 33Z',
    root: 'M12.5 37C13 58 16.5 80 19 91 19.5 93 20.5 93 21 91 23.5 80 27 58 27.5 37Z',
  },
};

/**
 * @param id         tooth id, e.g. "UR6"
 * @param crownColor colour of the crown (or null)
 * @param rootColor  colour of the root (or null)
 * @param color      one colour for both (admin preview)
 * @param crownNote  show a dot on the crown
 * @param rootNote   show a dot on the root
 * @param highlight  'crown' | 'root' — outline that part (tooth editor)
 * @param onPart     makes crown/root clickable: onPart('crown' | 'root')
 *
 * Each part carries data-part="crown|root" so a tap on the chart knows which part was touched.
 */
export default function ToothGlyph({ id, color, crownColor, rootColor, crownNote, rootNote, highlight, onPart, width = 40, flip }) {
  const shape = SHAPES[toothKind(id)];
  const upper = flip ?? id.startsWith('U');
  const crown = crownColor ?? color ?? null;
  const root = rootColor ?? color ?? null;
  const line = 'var(--tooth-line)';
  const clickable = Boolean(onPart);
  const partProps = (part) =>
    clickable
      ? {
          onClick: () => onPart(part),
          style: { cursor: 'pointer' },
        }
      : {};

  return (
    <svg viewBox="3 -2 34 104" width={width} aria-hidden="true">
      <g transform={upper ? 'translate(0 100) scale(1 -1)' : undefined}>
        <path
          data-part="root"
          d={shape.root}
          fill={root || 'var(--tooth-root)'}
          fillOpacity={root ? 0.85 : 1}
          stroke={highlight === 'root' ? 'var(--berry)' : line}
          strokeWidth={highlight === 'root' ? 3 : 1.4}
          strokeLinejoin="round"
          {...partProps('root')}
        />
        <path
          data-part="crown"
          d={shape.crown}
          fill={crown || 'var(--tooth-crown)'}
          stroke={highlight === 'crown' ? 'var(--berry)' : line}
          strokeWidth={highlight === 'crown' ? 3 : 1.4}
          strokeLinejoin="round"
          {...partProps('crown')}
        />
        {crownNote && <circle cx="20" cy="21" r="5" fill="var(--berry)" stroke="#fff" strokeWidth="1.8" pointerEvents="none" />}
        {rootNote && <circle cx="20" cy="66" r="5" fill="var(--berry)" stroke="#fff" strokeWidth="1.8" pointerEvents="none" />}
      </g>
    </svg>
  );
}
