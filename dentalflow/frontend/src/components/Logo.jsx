/**
 * The clinic's tooth-and-heart mark (from the logo the clinic shared) and the
 * "icare 32 DENTAL CLINIC" letterhead wordmark used on printed receipts.
 */
export function ToothMark({ size = 32, color = 'var(--berry)', strokeWidth = 4.2, title }) {
  return (
    <svg
      width={size}
      height={size * 1.12}
      viewBox="0 0 64 72"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : 'true'}
    >
      {/* outer tooth */}
      <path d="M17 5C8 5 4 13 5.5 23.5c1.3 9 5 13.5 6.5 24 1.1 8 2.6 17.5 7.5 17.5 5.3 0 4.6-15.5 12.5-15.5s7.2 15.5 12.5 15.5c4.9 0 6.4-9.5 7.5-17.5 1.5-10.5 5.2-15 6.5-24C60 13 56 5 47 5c-6.4 0-9.2 4.2-15 4.2S23.4 5 17 5z" />
      {/* inner heart */}
      <path d="M32 41.5c-6.5-5.3-14-9.8-14-17.2 0-4.2 3-7.1 6.6-7.1 3.1 0 5.4 1.9 7.4 5 2-3.1 4.3-5 7.4-5 3.6 0 6.6 2.9 6.6 7.1 0 7.4-7.5 11.9-14 17.2z" />
    </svg>
  );
}

/** Letterhead wordmark: "icare" + tooth + "32", with "DENTAL CLINIC" in an outlined pill */
export function ClinicWordmark({ green = '#1f8a4c', pink = '#d23c7d', width = 300 }) {
  return (
    <svg width={width} viewBox="0 0 264 92" role="img" aria-label="icare 32 Dental Clinic">
      <text
        x="6"
        y="54"
        fill={green}
        fontFamily="Georgia, 'Times New Roman', serif"
        fontWeight="700"
        fontSize="58"
        letterSpacing="-1"
      >
        icare
      </text>
      <g transform="translate(150 12) scale(0.62)">
        <g fill="none" stroke={pink} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 5C8 5 4 13 5.5 23.5c1.3 9 5 13.5 6.5 24 1.1 8 2.6 17.5 7.5 17.5 5.3 0 4.6-15.5 12.5-15.5s7.2 15.5 12.5 15.5c4.9 0 6.4-9.5 7.5-17.5 1.5-10.5 5.2-15 6.5-24C60 13 56 5 47 5c-6.4 0-9.2 4.2-15 4.2S23.4 5 17 5z" />
          <path d="M32 41.5c-6.5-5.3-14-9.8-14-17.2 0-4.2 3-7.1 6.6-7.1 3.1 0 5.4 1.9 7.4 5 2-3.1 4.3-5 7.4-5 3.6 0 6.6 2.9 6.6 7.1 0 7.4-7.5 11.9-14 17.2z" />
        </g>
      </g>
      <text x="196" y="54" fill={green} fontFamily="Arial, Helvetica, sans-serif" fontWeight="900" fontSize="50">
        32
      </text>
      <rect x="14" y="64" width="238" height="24" rx="12" fill="none" stroke={green} strokeWidth="2.4" />
      <text
        x="133"
        y="81.5"
        textAnchor="middle"
        fill={green}
        fontFamily="Arial, Helvetica, sans-serif"
        fontWeight="700"
        fontSize="15"
        letterSpacing="7"
      >
        DENTAL CLINIC
      </text>
    </svg>
  );
}
