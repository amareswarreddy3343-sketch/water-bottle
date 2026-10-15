import mongoose from 'mongoose';

export const VALID_TOOTH_IDS = ['UR', 'UL', 'LR', 'LL'].flatMap((q) =>
  [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `${q}${n}`),
);

const toothRecordSchema = new mongoose.Schema(
  {
    patient_uid: { type: String, required: true, uppercase: true, maxlength: 6 },
    tooth_id: { type: String, required: true, enum: VALID_TOOTH_IDS },
    // JSON text {"G": whole tooth, "B","L","O","M","D": crown surfaces, "R": root}
    // (older records may hold plain text, which is treated as the occlusal note)
    notes: { type: String, default: '' },
    // Colour of the crown and of the root: ids of the clinic's tooth statuses ('' = none)
    crown_status: { type: String, default: '' },
    root_status: { type: String, default: '' },
    // Older single status for the whole tooth (kept for compatibility, = crown or root status)
    status: { type: String, default: '' },
    edited_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  {
    collection: 'tooth_records',
    // recorded_at behaves like Django's auto_now (updated on every save)
    timestamps: { createdAt: false, updatedAt: 'recorded_at' },
  },
);

// One record per patient per tooth
toothRecordSchema.index({ patient_uid: 1, tooth_id: 1 }, { unique: true });

export const ToothRecord = mongoose.models.ToothRecord || mongoose.model('ToothRecord', toothRecordSchema);
export default ToothRecord;
