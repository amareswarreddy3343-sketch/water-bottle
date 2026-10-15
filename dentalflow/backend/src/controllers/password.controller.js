/**
 * Passwords: forgot / reset by email link, change own password, admin reset.
 *
 *   GET  /api/auth/password/options/        { email_enabled }                    (public)
 *   POST /api/auth/password/forgot/         { email }                            (public)
 *   POST /api/auth/password/reset/check/    { token }  → { valid, email }        (public)
 *   POST /api/auth/password/reset/          { token, password }                  (public)
 *   POST /api/auth/password/change/         { current_password, new_password }   (signed in)
 *   POST /api/auth/admin/users/:id/reset-password/  { mode: "temporary" | "email", password? }  (master)
 *
 * Changing a password signs out every other session of that user.
 */
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { PasswordReset, RESET_TOKEN_MINUTES, User } from '../models/index.js';
import { apiError, fieldErrors, forbidden, notFound } from '../utils/errors.js';
import { isEmailEnabled, resetEmail, sendMail } from '../utils/mailer.js';
import { audit } from '../utils/audit.js';
import { serializeUserProfile } from '../utils/serializers.js';
import { getTokensForUser } from '../utils/tokens.js';
import Validator from '../utils/validation.js';

const PASSWORD_RULES = { minLength: 6, maxLength: 128, trim: false };
const LINK_INVALID = 'This reset link has expired or was already used. Ask for a new one.';

/** Address of the app for links in emails (never taken from an untrusted header when avoidable) */
function appBaseUrl(req) {
  const fixed = (process.env.APP_URL || '').trim().replace(/\/+$/, '');
  if (fixed) return fixed;
  if (process.env.RAILWAY_PUBLIC_DOMAIN) return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  return `${req.protocol}://${req.get('host')}`;
}

/** The token travels in the URL fragment (#…), which browsers never send to servers or logs */
const resetLink = (req, token) => `${appBaseUrl(req)}/reset-password#token=${token}`;

/** d••••r@dental.com */
function maskEmail(email) {
  const [local, domain] = String(email).split('@');
  if (!domain) return email;
  const shown = local.length <= 2 ? local[0] : `${local[0]}${'•'.repeat(Math.min(6, local.length - 2))}${local.at(-1)}`;
  return `${shown}@${domain}`;
}

async function emailResetLink(req, user, requestedBy = null) {
  const token = await PasswordReset.issue(user._id, requestedBy);
  const message = resetEmail({
    name: user.name,
    link: resetLink(req, token),
    minutes: RESET_TOKEN_MINUTES,
    byAdmin: Boolean(requestedBy),
  });
  await sendMail({ to: user.email, ...message });
}

/** Easy-to-read temporary password, e.g. "k7mpx-4abqz" */
export function temporaryPassword() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const pick = (n) => Array.from({ length: n }, () => alphabet[crypto.randomInt(alphabet.length)]).join('');
  return `${pick(5)}-${pick(5)}`;
}

// ── GET /api/auth/password/options/ ────────────────────────────────────────
export async function options(req, res) {
  res.json({ email_enabled: isEmailEnabled(), link_minutes: RESET_TOKEN_MINUTES });
}

// ── POST /api/auth/password/forgot/ ────────────────────────────────────────
export async function forgot(req, res) {
  const v = new Validator(req.body);
  const email = v.email('email');
  v.throwIfErrors();

  if (!isEmailEnabled()) {
    res.json({
      email_enabled: false,
      message: 'Email is not set up for this clinic. Ask the clinic admin to reset your password.',
    });
    return;
  }

  // Same answer whether or not the account exists, so the form can't be used to
  // find out who has an account.
  const user = await User.findOne({ email: email.toLowerCase() });
  if (user && user.is_active && !user.removed_at) {
    const recent = await PasswordReset.exists({ user: user._id, created_at: { $gt: new Date(Date.now() - 60 * 1000) } });
    if (!recent) {
      try {
        await emailResetLink(req, user);
      } catch (err) {
        console.error(`❌ Could not send the password-reset email to ${user.email}: ${err.message}`);
      }
    }
  }
  res.json({
    email_enabled: true,
    message: 'If an account exists for that email, a link to reset the password has been sent.',
  });
}

// ── POST /api/auth/password/reset/check/ ───────────────────────────────────
export async function checkResetLink(req, res) {
  const reset = await PasswordReset.findValid(req.body?.token);
  const user = reset ? await User.findById(reset.user) : null;
  if (!reset || !user || !user.is_active) {
    res.json({ valid: false, message: LINK_INVALID });
    return;
  }
  res.json({ valid: true, email: maskEmail(user.email), name: user.name });
}

// ── POST /api/auth/password/reset/ ─────────────────────────────────────────
export async function resetWithLink(req, res) {
  const v = new Validator(req.body);
  const token = v.char('token', { maxLength: 200 });
  const password = v.char('password', PASSWORD_RULES);
  v.throwIfErrors();

  const reset = await PasswordReset.findValid(token);
  const user = reset ? await User.findById(reset.user) : null;
  if (!reset || !user || !user.is_active) throw apiError(400, LINK_INVALID);

  // Mark the link used first, so it can never be used twice (even by two requests at once)
  const claimed = await PasswordReset.updateOne({ _id: reset._id, used_at: null }, { $set: { used_at: new Date() } });
  if (!claimed.modifiedCount) throw apiError(400, LINK_INVALID);

  await user.changePassword(password);
  await user.save();
  await PasswordReset.deleteMany({ user: user._id, _id: { $ne: reset._id } });
  await audit({ user, ip: req.ip }, { action: 'auth.password_reset', summary: `${user.name} reset their password with an email link` });

  res.json({ message: 'Password changed. Sign in with your new password.' });
}

// ── POST /api/auth/password/change/ (signed in) ────────────────────────────
export async function changeOwnPassword(req, res) {
  const user = await User.findById(req.user._id);
  const v = new Validator(req.body);
  // After a temporary password from the admin, the current password is not asked again
  const current = user.must_change_password ? undefined : v.char('current_password', { trim: false });
  const next = v.char('new_password', PASSWORD_RULES);
  v.throwIfErrors();

  if (!user.must_change_password && !(await user.checkPassword(current))) {
    throw fieldErrors({ current_password: ['Current password is not correct.'] });
  }
  if (await user.checkPassword(next)) {
    throw fieldErrors({ new_password: ['Choose a password different from the current one.'] });
  }

  await user.changePassword(next);
  await user.save();
  await audit(req, { action: 'auth.password_change', summary: `${user.name} changed their password` });
  // Other sessions are signed out; this one continues with fresh tokens
  res.json({
    message: 'Password changed.',
    tokens: getTokensForUser(user),
    user: serializeUserProfile(user),
  });
}

// ── POST /api/auth/admin/users/:userId/reset-password/ (master) ────────────
export async function adminReset(req, res) {
  if (req.user.role !== 'master') throw forbidden('Only Master can reset passwords.');
  const { userId } = req.params;
  const user = mongoose.isValidObjectId(userId) ? await User.findById(userId) : null;
  if (!user) throw notFound('User not found.');

  const mode = req.body?.mode === 'email' ? 'email' : 'temporary';

  if (mode === 'email') {
    if (!isEmailEnabled()) throw apiError(400, 'Email is not set up on this server. Use a temporary password instead.');
    try {
      await emailResetLink(req, user, req.user._id);
    } catch (err) {
      console.error(`❌ Could not send the password-reset email to ${user.email}: ${err.message}`);
      throw apiError(502, 'The email could not be sent. Check the email settings, or use a temporary password.');
    }
    await audit(req, { action: 'team.password_link', summary: `Emailed a password reset link to ${user.name}` });
    res.json({ message: `A reset link was emailed to ${user.email}.` });
    return;
  }

  let password = req.body?.password;
  if (password === undefined || password === null || password === '') {
    password = temporaryPassword();
  } else {
    const v = new Validator({ password });
    v.char('password', PASSWORD_RULES);
    v.throwIfErrors();
  }
  await user.changePassword(password, { mustChange: user.id !== req.user.id });
  await user.save();
  await PasswordReset.deleteMany({ user: user._id });
  await audit(req, { action: 'team.password_reset', summary: `Gave ${user.name} a temporary password` });

  res.json({
    message: `Temporary password set for ${user.name}. They will choose a new one when they sign in.`,
    temporary_password: password,
  });
}

/**
 * Locked out of the only admin account on a server where you can't run commands
 * (e.g. Railway)? Set RESET_PASSWORD_EMAIL and RESET_PASSWORD, redeploy, sign in, then
 * remove both variables. Each value is applied only once.
 */
export async function applyPasswordRecovery({ loadSettings }) {
  const email = (process.env.RESET_PASSWORD_EMAIL || '').trim().toLowerCase();
  const password = process.env.RESET_PASSWORD || '';
  if (!email || !password) return;
  if (password.length < 6) {
    console.warn('⚠️  RESET_PASSWORD must be at least 6 characters — ignored.');
    return;
  }
  const settings = await loadSettings();
  const key = crypto.createHash('sha256').update(`${email}\n${password}`).digest('hex');
  if (settings.applied_password_recovery === key) {
    console.warn('⚠️  RESET_PASSWORD_EMAIL / RESET_PASSWORD were already used — remove these variables.');
    return;
  }
  const user = await User.findOne({ email });
  if (!user) {
    console.warn(`⚠️  RESET_PASSWORD_EMAIL: no account with the email ${email}.`);
    return;
  }
  await user.changePassword(password, { mustChange: true });
  user.is_active = true;
  await user.save();
  settings.applied_password_recovery = key;
  await settings.save();
  console.warn(
    `🔑 Password for ${email} was reset from RESET_PASSWORD. Sign in, choose a new password, `
      + 'then REMOVE the RESET_PASSWORD_EMAIL and RESET_PASSWORD variables.',
  );
}

