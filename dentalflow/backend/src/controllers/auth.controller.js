import mongoose from 'mongoose';
import { BlacklistedToken, ROLES, User } from '../models/index.js';
import { apiError, authError, fieldErrors, forbidden, notFound } from '../utils/errors.js';
import { audit, diff } from '../utils/audit.js';
import { serializeUser, serializeUserProfile } from '../utils/serializers.js';
import { getTokensForUser, signAccessToken, signRefreshToken, verifyToken } from '../utils/tokens.js';
import Validator from '../utils/validation.js';

const INVALID_ROLE = `Invalid role. Must be one of: ['master', 'receptionist', 'doctor']`;

// ── POST /api/auth/login/ ──────────────────────────────────────────────────
export async function login(req, res) {
  const v = new Validator(req.body);
  v.email('email');
  const password = v.char('password');
  // Validation problems on login are reported with 401, like the original API
  v.throwIfErrors(401);

  const email = String(req.body.email || '').toLowerCase().trim();
  if (!email || !password) {
    throw fieldErrors({ non_field_errors: ['Email and password are required.'] }, 401);
  }

  const user = await User.findOne({ email });
  const passwordOk = user ? await user.checkPassword(password) : false;
  if (!user || !passwordOk) {
    throw fieldErrors({ non_field_errors: ['Invalid email or password.'] }, 401);
  }
  if (user.removed_at) {
    throw fieldErrors({ non_field_errors: ['This account has been removed from the clinic team.'] }, 401);
  }
  if (!user.is_active) {
    throw fieldErrors({ non_field_errors: ['This account has been deactivated.'] }, 401);
  }

  user.last_login = new Date();
  await user.save();
  await audit({ user, ip: req.ip }, { action: 'auth.login', summary: `${user.name} signed in` });

  res.status(200).json({
    tokens: getTokensForUser(user),
    user: serializeUserProfile(user),
  });
}

// ── GET /api/auth/me/ ──────────────────────────────────────────────────────
export async function me(req, res) {
  res.json({ user: serializeUserProfile(req.user) });
}

// ── POST /api/auth/logout/ ─────────────────────────────────────────────────
export async function logout(req, res) {
  const refresh = req.body?.refresh;
  if (!refresh) {
    throw apiError(400, 'Refresh token required.');
  }
  let payload;
  try {
    payload = verifyToken(refresh, 'refresh');
  } catch {
    throw apiError(400, 'Invalid token.');
  }
  await BlacklistedToken.updateOne(
    { jti: payload.jti },
    {
      $setOnInsert: {
        jti: payload.jti,
        user: mongoose.isValidObjectId(payload.user_id) ? payload.user_id : null,
        expires_at: new Date(payload.exp * 1000),
      },
    },
    { upsert: true },
  );
  // Housekeeping for servers without TTL-index support (MongoDB's TTL index normally does this)
  await BlacklistedToken.deleteMany({ expires_at: { $lt: new Date() } }).catch(() => {});
  res.json({ message: 'Logged out successfully.' });
}

// ── POST /api/auth/refresh/ ────────────────────────────────────────────────
export async function refreshToken(req, res) {
  const v = new Validator(req.body);
  const refresh = v.char('refresh');
  v.throwIfErrors();

  let payload;
  try {
    payload = verifyToken(refresh, 'refresh');
  } catch (err) {
    throw authError(err.message, 'token_not_valid');
  }

  if (await BlacklistedToken.exists({ jti: payload.jti })) {
    throw authError('Token is blacklisted', 'token_not_valid');
  }

  const user = mongoose.isValidObjectId(payload.user_id) ? await User.findById(payload.user_id) : null;
  if (!user || !user.is_active) {
    throw authError('No active account found with the given credentials', 'no_active_account');
  }
  if (user.tokenIssuedBeforePasswordChange(payload)) {
    throw authError('Your password was changed. Please sign in again.', 'token_not_valid');
  }

  const body = { access: signAccessToken(user) };
  if (req.app.get('jwtRotateRefresh')) {
    body.refresh = signRefreshToken(user);
  }
  res.json(body);
}

// ── Admin: user management (master only) ───────────────────────────────────
function requireMaster(req, message) {
  if (req.user.role !== 'master') throw forbidden(message);
}

async function findUserOr404(id) {
  const user = mongoose.isValidObjectId(id) ? await User.findById(id) : null;
  if (!user) throw notFound('User not found.');
  return user;
}

// POST /api/auth/admin/users/create/
export async function createUser(req, res) {
  requireMaster(req, 'Only Master can create users.');

  const v = new Validator(req.body);
  let email = v.email('email');
  let name = v.char('name', { maxLength: 150 });
  const role = v.char('role');
  const password = v.char('password', { minLength: 6 });

  if (email !== undefined && !v.hasErrors('email')) {
    email = email.toLowerCase();
    const existing = await User.findOne({ email }, 'removed_at');
    if (existing?.removed_at) {
      v.addError('email', 'This email belongs to a removed team member. Restore them from "Removed members" instead.');
    } else if (existing) {
      v.addError('email', 'User with this email already exists.');
    }
  }
  if (name !== undefined && !v.hasErrors('name')) {
    name = name.trim();
    if (name.length < 2) v.addError('name', 'Name must be at least 2 characters.');
  }
  if (role !== undefined && !v.hasErrors('role') && !ROLES.includes(role)) {
    v.addError('role', INVALID_ROLE);
  }
  v.throwIfErrors();

  const canViewCollections = req.body?.can_view_collections === true || req.body?.can_view_collections === 'true';
  const user = await User.createUser({ email, name, role, password, can_view_collections: role === 'doctor' && canViewCollections });
  await audit(req, { action: 'team.create', summary: `Added ${name} (${role}) to the team`, details: { email, role } });
  res.status(201).json({ message: 'User created successfully.', user: serializeUser(user) });
}

// GET /api/auth/admin/users/list/
export async function listUsers(req, res) {
  requireMaster(req, 'Only Master can view users.');
  const includeRemoved = ['1', 'true'].includes(String(req.query.include_removed || ''));
  const users = await User.find(includeRemoved ? {} : { removed_at: null }).sort({ created_at: -1, _id: -1 });
  res.json({ total: users.length, users: users.map(serializeUser) });
}

// GET /api/auth/admin/users/:userId/
export async function getUser(req, res) {
  requireMaster(req, 'Only Master can view user details.');
  const user = await findUserOr404(req.params.userId);
  res.json({ user: serializeUser(user) });
}

// PATCH /api/auth/admin/users/:userId/update/
export async function updateUser(req, res) {
  requireMaster(req, 'Only Master can update users.');
  const user = await findUserOr404(req.params.userId);

  const v = new Validator(req.body);
  const name = v.has('name') ? v.char('name', { maxLength: 150 }) : undefined;
  const role = v.has('role') ? v.char('role') : undefined;
  const isActive = v.has('is_active') ? v.boolean('is_active') : undefined;
  const canViewCollections = v.has('can_view_collections') ? v.boolean('can_view_collections') : undefined;
  if (role && !v.hasErrors('role') && !ROLES.includes(role)) v.addError('role', INVALID_ROLE);
  if (user.removed_at) throw apiError(400, 'This team member was removed. Restore them first.');

  // Never leave the clinic without an active Master account
  const losesMaster = user.role === 'master' && user.is_active && (isActive === false || (role && role !== 'master'));
  if (losesMaster) {
    const activeMasters = await User.countDocuments({ role: 'master', is_active: true });
    if (activeMasters <= 1) {
      throw apiError(
        400,
        isActive === false ? 'Cannot deactivate the last Master user.' : 'Cannot change the role of the last Master user.',
      );
    }
  }
  v.throwIfErrors();

  const before = { name: user.name, role: user.role, is_active: user.is_active, can_view_collections: user.can_view_collections };
  if (name !== undefined) user.name = name;
  if (role) user.role = role;
  if (isActive !== undefined && isActive !== null) user.is_active = isActive;
  if (canViewCollections !== undefined && canViewCollections !== null) user.can_view_collections = canViewCollections;
  await user.save();

  const changes = diff(before, user, ['name', 'role', 'is_active', 'can_view_collections']);
  if (Object.keys(changes).length) {
    await audit(req, { action: 'team.update', summary: `Changed ${user.name}'s account`, details: changes });
  }
  res.json({ message: 'User updated successfully.', user: serializeUser(user) });
}

// PATCH /api/auth/admin/users/:userId/toggle-complaint-access/
export async function toggleComplaintAccess(req, res) {
  requireMaster(req, 'Only Master can modify complaint access.');
  const user = await findUserOr404(req.params.userId);

  if (user.role !== 'doctor') {
    throw apiError(400, 'Complaint access applies only to doctors.');
  }

  const requested = req.body?.can_edit_complaints;
  if (requested === undefined || requested === null) {
    user.can_edit_complaints = !user.can_edit_complaints; // toggle if not specified
  } else {
    const v = new Validator(req.body);
    const value = v.boolean('can_edit_complaints');
    v.throwIfErrors();
    user.can_edit_complaints = value;
  }
  await user.save();

  res.json({ message: 'Complaint access updated.', user: serializeUser(user) });
}

// ── DELETE /api/auth/admin/users/:userId/ — remove from the team (records are kept) ─
export async function removeUser(req, res) {
  requireMaster(req, 'Only Master can remove team members.');
  const user = await findUserOr404(req.params.userId);
  if (String(user._id) === String(req.user._id)) throw apiError(400, 'You cannot remove your own account.');
  if (user.removed_at) throw apiError(400, 'This team member is already removed.');
  if (user.role === 'master' && user.is_active) {
    const activeMasters = await User.countDocuments({ role: 'master', is_active: true, removed_at: null });
    if (activeMasters <= 1) throw apiError(400, 'Cannot remove the last Master user.');
  }
  user.removed_at = new Date();
  user.removed_by = req.user._id;
  user.is_active = false;
  // signs them out everywhere
  user.password_changed_at = new Date(Math.floor(Date.now() / 1000) * 1000);
  await user.save();
  await audit(req, {
    action: 'team.remove',
    summary: `Removed ${user.name} (${user.role}) from the team`,
    details: { email: user.email },
  });
  res.json({ message: `${user.name} was removed. Everything they recorded is kept.`, user: serializeUser(user) });
}

// ── POST /api/auth/admin/users/:userId/restore/ ─────────────────────────────
export async function restoreUser(req, res) {
  requireMaster(req, 'Only Master can restore team members.');
  const user = await findUserOr404(req.params.userId);
  if (!user.removed_at) throw apiError(400, 'This team member is not removed.');
  user.removed_at = null;
  user.removed_by = null;
  user.is_active = true;
  await user.save();
  await audit(req, { action: 'team.restore', summary: `Restored ${user.name} (${user.role}) to the team` });
  res.json({ message: `${user.name} is back on the team.`, user: serializeUser(user) });
}
