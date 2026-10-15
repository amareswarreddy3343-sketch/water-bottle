import crypto from 'node:crypto';
import { promisify } from 'node:util';
import bcrypt from 'bcryptjs';

const pbkdf2 = promisify(crypto.pbkdf2);

const ROUNDS = (() => {
  const n = parseInt(process.env.BCRYPT_ROUNDS, 10);
  return Number.isFinite(n) && n >= 4 ? n : 12;
})();

export async function hashPassword(plain) {
  return bcrypt.hash(String(plain), ROUNDS);
}

/**
 * Verify a password against a stored hash.
 *
 * Supports bcrypt hashes (new MERN backend) and Django's default
 * "pbkdf2_sha256$<iterations>$<salt>$<hash>" format, so users migrated from the
 * old PostgreSQL database can still log in with their existing passwords.
 * Returns { ok, needsRehash } — Django hashes are upgraded to bcrypt on login.
 */
export async function verifyPassword(plain, stored) {
  if (typeof stored !== 'string' || !stored || stored.startsWith('!')) {
    return { ok: false, needsRehash: false };
  }

  if (stored.startsWith('$2')) {
    const ok = await bcrypt.compare(String(plain), stored);
    return { ok, needsRehash: false };
  }

  if (stored.startsWith('pbkdf2_sha256$')) {
    const [, iterations, salt, expected] = stored.split('$');
    const iter = parseInt(iterations, 10);
    if (!Number.isFinite(iter) || !salt || !expected) return { ok: false, needsRehash: false };
    const expectedBuf = Buffer.from(expected, 'base64');
    const derived = await pbkdf2(String(plain), salt, iter, expectedBuf.length || 32, 'sha256');
    const ok = derived.length === expectedBuf.length && crypto.timingSafeEqual(derived, expectedBuf);
    return { ok, needsRehash: ok };
  }

  return { ok: false, needsRehash: false };
}
