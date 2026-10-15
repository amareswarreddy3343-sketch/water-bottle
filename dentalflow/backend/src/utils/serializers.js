/**
 * Convert Mongoose documents into the exact JSON shapes the original
 * Django REST Framework serializers produced (field names, decimals as strings, etc.).
 */
import config from '../config/env.js';
import { moneyString, moneyStringOrNull } from './money.js';

const idOf = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object' && value._id) return String(value._id);
  return String(value);
};

/** Name of a populated user reference (or null when missing / not populated) */
const nameOf = (userRef) => (userRef && typeof userRef === 'object' && 'name' in userRef ? userRef.name : null);

// ── Users ──────────────────────────────────────────────────────────────────
export const serializeUserProfile = (u) => ({
  id: idOf(u),
  email: u.email,
  name: u.name,
  role: u.role,
  can_edit_complaints: Boolean(u.can_edit_complaints),
  must_change_password: Boolean(u.must_change_password),
  can_view_collections: u.role === 'master' || (u.role === 'doctor' && Boolean(u.can_view_collections)),
});

export const serializeUser = (u) => ({
  id: idOf(u),
  email: u.email,
  name: u.name,
  role: u.role,
  can_edit_complaints: Boolean(u.can_edit_complaints),
  is_active: Boolean(u.is_active),
  must_change_password: Boolean(u.must_change_password),
  can_view_collections: u.role === 'master' || (u.role === 'doctor' && Boolean(u.can_view_collections)),
  removed_at: u.removed_at || null,
  created_at: u.created_at,
});

// ── Patients ───────────────────────────────────────────────────────────────
/** PatientSerializer / PatientDetailSerializer (identical field sets) — expects created_by populated */
export const serializePatient = (p) => ({
  uid: p.uid,
  name: p.name,
  age: p.age,
  gender: p.gender,
  phone: p.phone ?? '',
  comorbidities: Array.isArray(p.comorbidities) ? [...p.comorbidities] : [],
  pre_problems: p.pre_problems ?? '',
  paid_amount: moneyString(p.paid_amount),
  manual_total: moneyStringOrNull(p.manual_total),
  next_appointment: p.next_appointment ?? null,
  created_by: idOf(p.created_by),
  created_by_name: nameOf(p.created_by),
  created_at: p.created_at,
});

export const serializePayment = (pay) => ({
  id: idOf(pay),
  amount: moneyString(pay.amount),
  mode: pay.mode || 'cash',
  reference: pay.reference || '',
  created_at: pay.created_at,
  created_by: idOf(pay.created_by),
  created_by_name: nameOf(pay.created_by),
});

/** "Reception Desk (receptionist)" — the original edit/check-in endpoints used str(user) */
const labelOf = (userRef) =>
  userRef && typeof userRef === 'object' && 'name' in userRef ? `${userRef.name} (${userRef.role})` : null;

export const serializePatientEdit = (e) => ({
  id: idOf(e),
  changes: e.changes,
  created_by: idOf(e.created_by),
  created_by_name: labelOf(e.created_by),
  created_at: e.created_at,
});

export const serializeCheckIn = (c) => ({
  id: idOf(c),
  created_by: idOf(c.created_by),
  created_by_name: labelOf(c.created_by),
  created_at: c.created_at,
  visit_date: c.visit_date || null,
  reason: c.reason || '',
});

// ── Clinical records ───────────────────────────────────────────────────────
export const serializeComplaint = (c) => ({
  id: idOf(c),
  patient_uid: c.patient_uid,
  complaint_text: c.complaint_text,
  created_by_name: nameOf(c.created_by),
  last_edited_by_name: nameOf(c.last_edited_by),
  created_at: c.created_at,
  updated_at: c.updated_at,
});

export const serializeToothRecord = (r) => ({
  id: idOf(r),
  patient_uid: r.patient_uid,
  tooth_id: r.tooth_id,
  notes: r.notes ?? '',
  status: r.status || r.crown_status || r.root_status || '',
  crown_status: r.crown_status || '',
  root_status: r.root_status || '',
  edited_by_name: nameOf(r.edited_by),
  recorded_at: r.recorded_at,
});

export const serializeTreatment = (t) => ({
  id: idOf(t),
  patient_uid: t.patient_uid,
  description: t.description,
  cost: moneyString(t.cost),
  performed_by_name: nameOf(t.performed_by),
  treatment_date: t.treatment_date,
  created_at: t.created_at,
});

// ── Reports ────────────────────────────────────────────────────────────────
/** Absolute URL for a stored media file, like Django's request.build_absolute_uri(file.url) */
export function buildFileUrl(req, relativePath) {
  if (!relativePath) return null;
  const encoded = relativePath.split('/').map(encodeURIComponent).join('/');
  return `${req.protocol}://${req.get('host')}${config.mediaUrl}${encoded}`;
}

export const serializeReport = (r, req) => ({
  id: idOf(r),
  patient_uid: r.patient_uid,
  report_type: r.report_type,
  description: r.description ?? '',
  file_url: buildFileUrl(req, r.file),
  file_size_kb: r.file_size_kb,
  uploaded_by_name: nameOf(r.uploaded_by),
  uploaded_at: r.uploaded_at,
});

// ── Treatment plan (proposed treatments) ───────────────────────────────────
export const serializeProposal = (p) => ({
  id: idOf(p),
  patient_uid: p.patient_uid,
  procedure: p.procedure,
  tooth: p.tooth || '',
  cost: moneyString(p.cost),
  status: p.status,
  treatment_id: p.treatment ? idOf(p.treatment) : null,
  completed_at: p.completed_at || null,
  created_by_name: nameOf(p.created_by),
  created_at: p.created_at,
});

// ── Clinic settings ────────────────────────────────────────────────────────
export const serializeSettings = (s) => ({
  comorbidity_options: [...(s.comorbidity_options || [])],
  tooth_statuses: (s.tooth_statuses || []).map((t) => ({ id: t.id, label: t.label, color: t.color.toLowerCase(), part: t.part || 'both' })),
  max_tooth_statuses: 10,
  updated_at: s.updated_at || null,
});
