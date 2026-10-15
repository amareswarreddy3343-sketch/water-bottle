import crypto from 'node:crypto';

// 31-char pool — excludes visually ambiguous characters O, 0, I, L, 1
const POOL = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const LENGTH = 6;

/** Generate a single 6-character UID (cryptographically random, like Python's secrets.choice) */
export function generateUid() {
  let uid = '';
  for (let i = 0; i < LENGTH; i += 1) {
    uid += POOL[crypto.randomInt(POOL.length)];
  }
  return uid;
}

/** Strip spaces and uppercase — apply before every DB query */
export function normalizeUid(uid) {
  return String(uid ?? '').replace(/\s/g, '').toUpperCase();
}

/**
 * Generate a UID that does not exist yet.
 * Retries up to 10 times on collision (astronomically rare).
 */
export async function generateUniqueUid(PatientModel) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const uid = generateUid();
    // eslint-disable-next-line no-await-in-loop
    const exists = await PatientModel.exists({ uid });
    if (!exists) return uid;
  }
  throw new Error('Could not generate unique UID after 10 attempts.');
}
