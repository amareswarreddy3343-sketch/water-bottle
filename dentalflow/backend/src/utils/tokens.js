/**
 * JWT access / refresh tokens — same behaviour as the old SimpleJWT setup:
 *   access lifetime 8h, refresh lifetime 7 days, refresh rotation, logout blacklist,
 *   custom claims: name, role, can_edit_complaints.
 */
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import config from '../config/env.js';

const ALGORITHM = 'HS256';

function sign(user, tokenType, ttlSeconds) {
  const payload = {
    token_type: tokenType,
    user_id: String(user._id ?? user.id),
    jti: crypto.randomUUID().replace(/-/g, ''),
    name: user.name,
    role: user.role,
    can_edit_complaints: Boolean(user.can_edit_complaints),
  };
  return jwt.sign(payload, config.jwt.secret, { algorithm: ALGORITHM, expiresIn: ttlSeconds });
}

export const signAccessToken = (user) => sign(user, 'access', config.jwt.accessTtlSeconds);
export const signRefreshToken = (user) => sign(user, 'refresh', config.jwt.refreshTtlSeconds);

export function getTokensForUser(user) {
  return {
    access: signAccessToken(user),
    refresh: signRefreshToken(user),
  };
}

/**
 * Verify a token and its type. Returns the decoded payload or throws an Error whose
 * `message` mirrors SimpleJWT ("Token is invalid or expired", "Token has wrong type").
 */
export function verifyToken(token, expectedType) {
  let payload;
  try {
    payload = jwt.verify(String(token), config.jwt.secret, { algorithms: [ALGORITHM] });
  } catch (err) {
    const e = new Error('Token is invalid or expired');
    e.cause = err;
    throw e;
  }
  if (payload.token_type !== expectedType) {
    throw new Error('Token has wrong type');
  }
  if (!payload.user_id || !payload.jti) {
    throw new Error('Token contained no recognizable user identification');
  }
  return payload;
}
