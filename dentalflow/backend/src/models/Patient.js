import mongoose from 'mongoose';

export const GENDERS = ['male', 'female', 'other'];

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const patientSchema = new mongoose.Schema(
  {
    // 6-character public patient ID (was the primary key in PostgreSQL)
    uid: { type: String, required: true, unique: true, uppercase: true, trim: true, minlength: 6, maxlength: 6 },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    age: { type: Number, required: true, min: 0, validate: Number.isInteger },
    gender: { type: String, required: true, enum: GENDERS },
    phone: { type: String, default: '', maxlength: 20 },
    // Comorbidities picked from the clinic's list (stored by name)
    comorbidities: { type: [String], default: [] },
    // Free-text "other conditions / notes" (was "pre-existing medical problems")
    pre_problems: { type: String, default: '' },
    paid_amount: { type: Number, default: 0 },
    // Optional manual override for total cost (set by master admin)
    manual_total: { type: Number, default: null },
    // Date only, stored as 'YYYY-MM-DD' (same as a SQL DATE column)
    next_appointment: { type: String, default: null, match: DATE_ONLY },
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  {
    collection: 'patients',
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  },
);

patientSchema.index({ created_at: -1 });
patientSchema.index({ next_appointment: 1 });
patientSchema.index({ name: 1 });
patientSchema.index({ phone: 1 });

export const Patient = mongoose.models.Patient || mongoose.model('Patient', patientSchema);
export default Patient;
