/**
 * Clinic-wide settings edited by the Master admin (one document):
 *   - comorbidity_options: the pick-list shown for a patient's comorbidities
 *   - tooth_statuses:      up to 10 tooth-chart colours, each for the crown, the root or both
 */
import mongoose from 'mongoose';

export const MAX_TOOTH_STATUSES = 10;
export const STATUS_PARTS = ['both', 'crown', 'root'];
export const MAX_COMORBIDITY_OPTIONS = 50;

export const DEFAULT_COMORBIDITIES = [
  'Diabetes',
  'Hypertension',
  'Cardiac disease',
  'Asthma / respiratory',
  'Thyroid disorder',
  'Bleeding disorder / on blood thinners',
  'Kidney disease',
  'Liver disease / hepatitis',
  'Epilepsy',
  'Pregnancy',
  'Drug allergy',
  'Smoking / tobacco',
];

// part: where the colour can be used — the crown, the root, or both
export const DEFAULT_TOOTH_STATUSES = [
  { id: 'missing', label: 'Missing / extracted', color: '#111111', part: 'both' },
  { id: 'caries', label: 'Caries', color: '#9ca3af', part: 'crown' },
  { id: 'filled', label: 'Filled', color: '#3b82f6', part: 'crown' },
  { id: 'rct', label: 'Root canal treated', color: '#f59e0b', part: 'root' },
  { id: 'crown_cap', label: 'Crown / cap', color: '#a855f7', part: 'crown' },
  { id: 'periapical', label: 'Infection (periapical)', color: '#dc2626', part: 'root' },
];

const toothStatusSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    label: { type: String, required: true, trim: true, maxlength: 30 },
    color: { type: String, required: true, match: /^#[0-9a-f]{6}$/i },
    part: { type: String, enum: STATUS_PARTS, default: 'both' },
  },
  { _id: false },
);

const settingsSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: 'clinic' },
    comorbidity_options: { type: [String], default: () => [...DEFAULT_COMORBIDITIES] },
    tooth_statuses: { type: [toothStatusSchema], default: () => DEFAULT_TOOTH_STATUSES.map((s) => ({ ...s })) },
    updated_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    // fingerprint of the last RESET_PASSWORD recovery applied (so it is applied once)
    applied_password_recovery: { type: String, default: null },
  },
  { collection: 'clinic_settings', timestamps: { createdAt: false, updatedAt: 'updated_at' } },
);

export const ClinicSettings = mongoose.models.ClinicSettings || mongoose.model('ClinicSettings', settingsSchema);

/** The settings document, created with the defaults the first time it is needed */
export async function loadSettings() {
  const existing = await ClinicSettings.findOne({ key: 'clinic' });
  if (existing) return existing;
  try {
    return await ClinicSettings.create({ key: 'clinic' });
  } catch (err) {
    // Another request created it at the same moment
    if (err?.code === 11000) return ClinicSettings.findOne({ key: 'clinic' });
    throw err;
  }
}

export default ClinicSettings;
