import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

const complaintSchema = new mongoose.Schema(
  {
    patient_uid: { type: String, required: true, uppercase: true, maxlength: 6 },
    complaint_text: { type: String, required: true },
    created_by: { type: ObjectId, ref: 'User', required: true },
    last_edited_by: { type: ObjectId, ref: 'User', default: null },
  },
  {
    collection: 'chief_complaints',
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  },
);

complaintSchema.index({ patient_uid: 1, created_at: -1 });

export const ChiefComplaint = mongoose.models.ChiefComplaint || mongoose.model('ChiefComplaint', complaintSchema);
export default ChiefComplaint;
