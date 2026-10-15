/**
 * Proposed treatment (treatment plan / quotation line). Kept separate from performed
 * treatments: it does not count towards the bill until the doctor marks it done,
 * which creates a normal Treatment record.
 */
import mongoose from 'mongoose';

export const PROPOSAL_STATUSES = ['proposed', 'done'];

const { ObjectId } = mongoose.Schema.Types;

const proposedTreatmentSchema = new mongoose.Schema(
  {
    patient_uid: { type: String, required: true, uppercase: true, maxlength: 6 },
    procedure: { type: String, required: true, trim: true, maxlength: 200 },
    // Free text, e.g. "UR6" or "UR6, UR7"
    tooth: { type: String, default: '', trim: true, maxlength: 60 },
    cost: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: PROPOSAL_STATUSES, default: 'proposed' },
    treatment: { type: ObjectId, ref: 'Treatment', default: null },
    completed_at: { type: Date, default: null },
    created_by: { type: ObjectId, ref: 'User', required: true },
    // removed from the plan (kept for the history)
    deleted_at: { type: Date, default: null },
    deleted_by: { type: ObjectId, ref: 'User', default: null },
  },
  {
    collection: 'proposed_treatments',
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  },
);

proposedTreatmentSchema.index({ patient_uid: 1, created_at: 1 });

export const ProposedTreatment =
  mongoose.models.ProposedTreatment || mongoose.model('ProposedTreatment', proposedTreatmentSchema);
export default ProposedTreatment;
