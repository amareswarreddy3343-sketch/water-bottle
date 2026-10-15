/**
 * History of every change made in the app (who, what, when) — shown to the admin.
 * The person's name and role are copied in, so the history stays readable even after
 * a team member is renamed or removed. Entries are never edited or deleted by the app.
 */
import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema(
  {
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    actor_name: { type: String, default: '' },
    actor_role: { type: String, default: '' },
    // e.g. "patient.create", "payment.delete", "tooth.update"
    action: { type: String, required: true },
    // patients, payments, team, settings, … (for filtering)
    area: { type: String, required: true },
    patient_uid: { type: String, default: null, uppercase: true },
    summary: { type: String, required: true },
    // before/after values or a snapshot of what was removed
    details: { type: mongoose.Schema.Types.Mixed, default: null },
    ip: { type: String, default: '' },
  },
  { collection: 'audit_log', timestamps: { createdAt: 'created_at', updatedAt: false }, minimize: false },
);

auditLogSchema.index({ created_at: -1 });
auditLogSchema.index({ patient_uid: 1, created_at: -1 });
auditLogSchema.index({ actor: 1, created_at: -1 });
auditLogSchema.index({ area: 1, created_at: -1 });

export const AuditLog = mongoose.models.AuditLog || mongoose.model('AuditLog', auditLogSchema);
export default AuditLog;
