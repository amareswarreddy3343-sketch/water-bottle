import mongoose from 'mongoose';
import { User } from '../models/index.js';
import { authError } from '../utils/errors.js';
import { verifyToken } from '../utils/tokens.js';

/**
 * Bearer-token authentication (equivalent of SimpleJWT's JWTAuthentication +
 * DRF's IsAuthenticated). Loads the current user from the database on every
 * request, so role / access changes take effect immediately.
 */
export async function authenticate(req, _res, next) {
  const header = req.headers.authorization;
  if (!header) {
    throw authError('Authentication credentials were not provided.');
  }

  const parts = header.trim().split(/\s+/);
  if (parts[0] !== 'Bearer') {
    // Unknown header type is treated as "no credentials", like SimpleJWT
    throw authError('Authentication credentials were not provided.');
  }
  if (parts.length !== 2) {
    throw authError('Authorization header must contain two space-delimited values', 'bad_authorization_header');
  }

  let payload;
  try {
    payload = verifyToken(parts[1], 'access');
  } catch (err) {
    throw authError('Given token not valid for any token type', 'token_not_valid', {
      messages: [{ token_class: 'AccessToken', token_type: 'access', message: err.message }],
    });
  }

  if (!mongoose.isValidObjectId(payload.user_id)) {
    throw authError('Token contained no recognizable user identification', 'token_not_valid');
  }

  const user = await User.findById(payload.user_id);
  if (!user) throw authError('User not found', 'user_not_found');
  if (!user.is_active) throw authError('User is inactive', 'user_inactive');
  if (user.tokenIssuedBeforePasswordChange(payload)) {
    throw authError('Your password was changed. Please sign in again.', 'token_not_valid');
  }

  req.user = user;
  req.auth = payload;
  next();
}

export default authenticate;
