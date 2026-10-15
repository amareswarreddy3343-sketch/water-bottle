/**
 * Patient payment history, basic-detail edit history and check-ins
 * (Django models Payment, PatientEdit and CheckIn).
 */
import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;
const createdOnly = { createdAt: 'created_at', updatedAt: false };

export const PAYMENT_MODES = ['cash', 'upi'];

// ── Payment ────────────────────────────────────────────────────────────────
const paymentSchema = new mongoose.Schema(
  {
    patient_uid: { type: String, required: true, uppercase: true },
    amount: { type: Number, required: true },
    mode: { type: String, enum: PAYMENT_MODES, default: 'cash' },
    // UPI transaction / reference number (optional)
    reference: { type: String, default: '', maxlength: 60 },
    created_by: { type: ObjectId, ref: 'User', required: true },
    // A payment entered by mistake is voided, never erased: it stays in the history
    voided_at: { type: Date, default: null },
    voided_by: { type: ObjectId, ref: 'User', default: null },
    void_reason: { type: String, default: '' },
  },
  { collection: 'patient_payments', timestamps: createdOnly },
);
paymentSchema.index({ patient_uid: 1, created_at: -1 });
paymentSchema.index({ created_at: -1 });

// ── PatientEdit ────────────────────────────────────────────────────────────
const patientEditSchema = new mongoose.Schema(
  {
    patient_uid: { type: String, required: true, uppercase: true },
    // { field: { old, new } }
    changes: { type: mongoose.Schema.Types.Mixed, required: true },
    created_by: { type: ObjectId, ref: 'User', required: true },
  },
  { collection: 'patient_edits', timestamps: createdOnly, minimize: false },
);
patientEditSchema.index({ patient_uid: 1, created_at: -1 });

// ── CheckIn ────────────────────────────────────────────────────────────────
const checkInSchema = new mongoose.Schema(
  {
    patient_uid: { type: String, required: true, uppercase: true },
    created_by: { type: ObjectId, ref: 'User', required: true },
    // Visit registration: clinic-local date of the visit and why the patient came
    visit_date: { type: String, default: null, match: /^\d{4}-\d{2}-\d{2}$/ },
    reason: { type: String, default: '', maxlength: 300 },
    appointment: { type: ObjectId, ref: 'Appointment', default: null },
  },
  { collection: 'patient_checkins', timestamps: createdOnly },
);
checkInSchema.index({ patient_uid: 1, created_at: -1 });
checkInSchema.index({ visit_date: 1 });

export const Payment = mongoose.models.Payment || mongoose.model('Payment', paymentSchema);
export const PatientEdit = mongoose.models.PatientEdit || mongoose.model('PatientEdit', patientEditSchema);
export const CheckIn = mongoose.models.CheckIn || mongoose.model('CheckIn', checkInSchema);
