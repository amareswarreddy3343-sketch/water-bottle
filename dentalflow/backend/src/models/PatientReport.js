import mongoose from 'mongoose';

export const REPORT_TYPES = ['photo', 'xray', 'prescription', 'lab_report', 'referral', 'other'];
// Types accepted by the upload endpoint (same list the original API accepted)
export const UPLOADABLE_REPORT_TYPES = ['photo', 'xray', 'prescription', 'lab_report', 'other'];

const { ObjectId } = mongoose.Schema.Types;

const reportSchema = new mongoose.Schema(
  {
    patient_uid: { type: String, required: true, uppercase: true, maxlength: 6 },
    uploaded_by: { type: ObjectId, ref: 'User', required: true },
    treatment: { type: ObjectId, ref: 'Treatment', default: null },
    report_type: { type: String, required: true, enum: REPORT_TYPES },
    description: { type: String, default: '' },
    // Path relative to MEDIA_ROOT, e.g. "reports/2026/07/xray.png"
    file: { type: String, required: true },
    file_size_kb: { type: Number, default: 0, min: 0 },
    // Deleted files are moved to a trash folder and can be restored by the admin
    deleted_at: { type: Date, default: null },
    deleted_by: { type: ObjectId, ref: 'User', default: null },
  },
  {
    collection: 'patient_reports',
    timestamps: { createdAt: 'uploaded_at', updatedAt: false },
  },
);

reportSchema.index({ patient_uid: 1, uploaded_at: -1 });

export const PatientReport = mongoose.models.PatientReport || mongoose.model('PatientReport', reportSchema);
export default PatientReport;
