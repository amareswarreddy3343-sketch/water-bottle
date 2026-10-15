import mongoose from 'mongoose';

/** Refresh tokens revoked on logout (SimpleJWT's token_blacklist app). */
const blacklistedTokenSchema = new mongoose.Schema(
  {
    jti: { type: String, required: true, unique: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    expires_at: { type: Date, required: true },
  },
  {
    collection: 'token_blacklist',
    timestamps: { createdAt: 'blacklisted_at', updatedAt: false },
  },
);

// MongoDB removes entries automatically once the token would have expired anyway
blacklistedTokenSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });

export const BlacklistedToken =
  mongoose.models.BlacklistedToken || mongoose.model('BlacklistedToken', blacklistedTokenSchema);
export default BlacklistedToken;
