import mongoose from 'mongoose';

const treatmentSchema = new mongoose.Schema(
  {
    patient_uid: { type: String, required: true, uppercase: true, maxlength: 6 },
    description: { type: String, required: true },
    cost: { type: Number, default: 0, min: 0 },
    performed_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // Date only, stored as 'YYYY-MM-DD'
    treatment_date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  },
  {
    collection: 'treatments',
    timestamps: { createdAt: 'created_at', updatedAt: false },
  },
);

treatmentSchema.index({ patient_uid: 1, created_at: -1 });
treatmentSchema.index({ performed_by: 1 });
treatmentSchema.index({ created_at: -1 });

export const Treatment = mongoose.models.Treatment || mongoose.model('Treatment', treatmentSchema);
export default Treatment;
