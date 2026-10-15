import mongoose from 'mongoose';
import { hashPassword, verifyPassword } from '../utils/passwords.js';

export const ROLES = ['master', 'receptionist', 'doctor'];

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
    name: { type: String, required: true, trim: true, maxlength: 150 },
    role: { type: String, required: true, enum: ROLES },
    password: { type: String, required: true },
    can_edit_complaints: { type: Boolean, default: false },
    is_active: { type: Boolean, default: true },
    is_staff: { type: Boolean, default: false },
    is_superuser: { type: Boolean, default: false },
    last_login: { type: Date, default: null },
    // Sessions (tokens) issued before this moment are no longer accepted
    password_changed_at: { type: Date, default: null },
    // Set when an admin gives a temporary password: the user must choose a new one
    must_change_password: { type: Boolean, default: false },
    // Doctors only see the clinic's collections when the admin allows it
    can_view_collections: { type: Boolean, default: false },
    // Removed from the team: cannot sign in, but everything they recorded is kept
    removed_at: { type: Date, default: null },
    removed_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  {
    collection: 'users',
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  },
);

userSchema.index({ created_at: -1 });
userSchema.index({ role: 1, is_active: 1 });

userSchema.methods.setPassword = async function setPassword(plain) {
  this.password = await hashPassword(plain);
};

/**
 * Replace the password and sign out every existing session of this user.
 * mustChange: the user has to pick a new password at the next sign-in (temporary password).
 */
userSchema.methods.changePassword = async function changePassword(plain, { mustChange = false } = {}) {
  await this.setPassword(plain);
  // whole seconds: tokens carry their issue time in seconds
  this.password_changed_at = new Date(Math.floor(Date.now() / 1000) * 1000);
  this.must_change_password = mustChange;
};

/** Was this token issued before the last password change? (then it is no longer valid) */
userSchema.methods.tokenIssuedBeforePasswordChange = function tokenIssuedBeforePasswordChange(payload) {
  if (!this.password_changed_at || !payload?.iat) return false;
  return payload.iat * 1000 < this.password_changed_at.getTime();
};

/** Checks the password; transparently upgrades legacy Django hashes to bcrypt. */
userSchema.methods.checkPassword = async function checkPassword(plain) {
  const { ok, needsRehash } = await verifyPassword(plain, this.password);
  if (ok && needsRehash) {
    await this.setPassword(plain);
    await this.save();
  }
  return ok;
};

/** May this person open the clinic-wide collections (payments report)? */
userSchema.methods.canViewCollections = function canViewCollections() {
  return this.role === 'master' || (this.role === 'doctor' && Boolean(this.can_view_collections));
};

/** Same as Django's User.__str__ → "Dr. Sharma (doctor)" */
userSchema.methods.toString = function toString() {
  return `${this.name} (${this.role})`;
};

/** Equivalent of Django's UserManager.create_user */
userSchema.statics.createUser = async function createUser({ email, name, role, password, ...extra }) {
  if (!email) throw new Error('Email is required');
  const user = new this({ email: String(email).trim().toLowerCase(), name, role, ...extra });
  await user.setPassword(password);
  await user.save();
  return user;
};

export const User = mongoose.models.User || mongoose.model('User', userSchema);
export default User;
