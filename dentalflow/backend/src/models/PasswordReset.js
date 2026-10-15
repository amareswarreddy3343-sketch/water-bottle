/**
 * One-time password-reset links. Only a SHA-256 hash of the token is stored, so the
 * database never contains a usable link. Links expire after RESET_TOKEN_MINUTES.
 */
import crypto from 'node:crypto';
import mongoose from 'mongoose';

export const RESET_TOKEN_MINUTES = 30;

const passwordResetSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    token_hash: { type: String, required: true, unique: true },
    expires_at: { type: Date, required: true },
    used_at: { type: Date, default: null },
    // who asked for it: the user (forgot password) or an admin (reset from Team)
    requested_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { collection: 'password_resets', timestamps: { createdAt: 'created_at', updatedAt: false } },
);

// MongoDB removes expired links automatically
passwordResetSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });
passwordResetSchema.index({ user: 1 });

export const hashResetToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

/** Create a new link for the user (older unused links stop working). Returns the raw token. */
passwordResetSchema.statics.issue = async function issue(userId, requestedBy = null) {
  await this.deleteMany({ user: userId });
  const token = crypto.randomBytes(32).toString('base64url');
  await this.create({
    user: userId,
    token_hash: hashResetToken(token),
    expires_at: new Date(Date.now() + RESET_TOKEN_MINUTES * 60 * 1000),
    requested_by: requestedBy,
  });
  return token;
};

/** The still-valid reset record for a raw token, or null */
passwordResetSchema.statics.findValid = async function findValid(token) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 200) return null;
  return this.findOne({ token_hash: hashResetToken(token), used_at: null, expires_at: { $gt: new Date() } });
};

export const PasswordReset = mongoose.models.PasswordReset || mongoose.model('PasswordReset', passwordResetSchema);
export default PasswordReset;
