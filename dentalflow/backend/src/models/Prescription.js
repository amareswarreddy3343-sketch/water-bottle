/**
 * Medicines prescribed on a date. Shown at the end of the patient's page and printed
 * on the clinic letterhead. Removing one only hides it (it stays in the history).
 */
import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

const medicineSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    // e.g. "500 mg", "10 ml"
    dose: { type: String, default: '', trim: true, maxlength: 40 },
    // e.g. "1-0-1", "SOS"
    frequency: { type: String, default: '', trim: true, maxlength: 40 },
    days: { type: Number, default: null, min: 0, max: 365 },
    // "after food", "before food", ""
    timing: { type: String, default: '', trim: true, maxlength: 40 },
    notes: { type: String, default: '', trim: true, maxlength: 200 },
  },
  { _id: false },
);

const prescriptionSchema = new mongoose.Schema(
  {
    patient_uid: { type: String, required: true, uppercase: true, maxlength: 6 },
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    items: { type: [medicineSchema], default: [] },
    advice: { type: String, default: '', trim: true, maxlength: 1000 },
    created_by: { type: ObjectId, ref: 'User', required: true },
    updated_by: { type: ObjectId, ref: 'User', default: null },
    deleted_at: { type: Date, default: null },
    deleted_by: { type: ObjectId, ref: 'User', default: null },
  },
  { collection: 'prescriptions', timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } },
);

prescriptionSchema.index({ patient_uid: 1, date: -1 });

export const Prescription = mongoose.models.Prescription || mongoose.model('Prescription', prescriptionSchema);
export default Prescription;
