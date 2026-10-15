/**
 * Chief complaints, tooth records and treatments
 * (Django apps: complaints, tooth_records, treatments).
 */
import { ChiefComplaint, Patient, ToothRecord, Treatment, VALID_TOOTH_IDS, loadSettings } from '../models/index.js';
import { today } from '../utils/dates.js';
import { fieldErrors, forbidden, notFound } from '../utils/errors.js';
import { sumMoney } from '../utils/money.js';
import { serializeComplaint, serializeToothRecord, serializeTreatment } from '../utils/serializers.js';
import { audit, snapshot } from '../utils/audit.js';
import { TOOTH_PARTS, parseToothNotes, serializeToothNotes } from '../utils/toothNotes.js';
import { normalizeUid } from '../utils/uid.js';
import Validator from '../utils/validation.js';

const USER_NAME = 'name role';

/** patient_uid field: max 6 chars, normalised, must exist (DRF validate_patient_uid) */
async function validatePatientUid(v) {
  const raw = v.char('patient_uid', { maxLength: 6 });
  if (raw === undefined || v.hasErrors('patient_uid')) return undefined;
  const uid = normalizeUid(raw);
  if (!(await Patient.exists({ uid }))) {
    v.addError('patient_uid', `Patient with UID ${uid} not found.`);
    return undefined;
  }
  return uid;
}

// ═══ Chief complaints ═══════════════════════════════════════════════════════

// POST /api/complaints/ — doctors and master (every doctor may add complaints)
export async function createComplaint(req, res) {
  const { user } = req;
  if (user.role === 'receptionist') {
    throw forbidden('Receptionists cannot enter chief complaints.');
  }

  const v = new Validator(req.body);
  const uid = await validatePatientUid(v);
  const complaintText = v.char('complaint_text', { minLength: 3 });
  v.throwIfErrors();

  // Always create a NEW complaint (multiple per patient allowed)
  const complaint = await ChiefComplaint.create({
    patient_uid: uid,
    complaint_text: complaintText,
    created_by: user._id,
    last_edited_by: user._id,
  });
  await complaint.populate([
    { path: 'created_by', select: USER_NAME },
    { path: 'last_edited_by', select: USER_NAME },
  ]);

  await audit(req, { action: 'complaint.create', patient_uid: uid, summary: `Chief complaint: ${complaintText.slice(0, 120)}` });
  res.status(201).json({ message: 'Chief complaint saved.', complaint: serializeComplaint(complaint) });
}

// GET /api/complaints/:uid/ — master, doctor
export async function listComplaints(req, res) {
  if (req.user.role === 'receptionist') {
    throw forbidden('Receptionists cannot view chief complaints.');
  }
  const uid = normalizeUid(req.params.uid);
  const complaints = await ChiefComplaint.find({ patient_uid: uid })
    .sort({ created_at: -1, _id: -1 })
    .populate('created_by', USER_NAME)
    .populate('last_edited_by', USER_NAME);
  res.json({ complaints: complaints.map(serializeComplaint) });
}

// ═══ Tooth records ══════════════════════════════════════════════════════════

const denyReceptionist = (req, message) => {
  if (req.user.role === 'receptionist') throw forbidden(message);
};

/**
 * Colour fields of a tooth: crown_status, root_status, and the older single "status"
 * (which sets both). '' / null clears; otherwise one of the clinic's status ids that
 * may be used on that part. Returns { crown, root } with undefined = unchanged.
 */
async function validateToothColours(v) {
  const want = ['status', 'crown_status', 'root_status'].filter((f) => v.has(f));
  if (!want.length) return { crown: undefined, root: undefined };
  const settings = await loadSettings();
  const parse = (field, part) => {
    const value = v.char(field, { required: false, allowBlank: true, allowNull: true, maxLength: 40 });
    if (value === undefined || v.hasErrors(field)) return undefined;
    if (!value) return '';
    const st = settings.tooth_statuses.find((s) => s.id === value);
    if (!st) {
      v.addError(field, 'Unknown tooth status.');
      return undefined;
    }
    if (part && st.part && st.part !== 'both' && st.part !== part) {
      v.addError(field, `"${st.label}" is used for the ${st.part}, not the ${part}.`);
      return undefined;
    }
    return value;
  };
  let crown;
  let root;
  if (v.has('status')) {
    // Older clients send one "status" for the whole tooth: it goes to the part(s)
    // that status is meant for ("" clears both).
    const id = parse('status', null);
    if (id === '') {
      crown = '';
      root = '';
    } else if (id) {
      const part = settings.tooth_statuses.find((s) => s.id === id)?.part || 'both';
      if (part !== 'root') crown = id;
      if (part !== 'crown') root = id;
    }
  }
  if (v.has('crown_status')) crown = parse('crown_status', 'crown');
  if (v.has('root_status')) root = parse('root_status', 'root');
  return { crown, root };
}

function applyColours(record, { crown, root }) {
  if (crown !== undefined) record.crown_status = crown;
  if (root !== undefined) record.root_status = root;
  // older clients read a single status: show the crown's (or the root's) colour
  record.status = record.crown_status || record.root_status || '';
}

const statusLabel = (settings, id) => settings.tooth_statuses.find((s) => s.id === id)?.label || (id ? id : 'none');

/** One line for the history, e.g. "UR6: crown Caries, root note added" */
function describeToothChange(settings, toothId, before, after) {
  const parts = [];
  if ((before?.crown_status || '') !== (after.crown_status || '')) parts.push(`crown ${statusLabel(settings, after.crown_status)}`);
  if ((before?.root_status || '') !== (after.root_status || '')) parts.push(`root ${statusLabel(settings, after.root_status)}`);
  if ((before?.notes || '') !== (after.notes || '')) parts.push('notes changed');
  return `${toothId}: ${parts.join(', ') || 'saved'}`;
}

// POST /api/tooth/ — create or update the notes / colours of one tooth
export async function saveToothRecord(req, res) {
  denyReceptionist(req, 'Receptionists cannot access tooth records.');

  const v = new Validator(req.body);
  const uid = await validatePatientUid(v);
  let toothId = v.char('tooth_id', { maxLength: 10 });
  if (toothId !== undefined && !v.hasErrors('tooth_id')) {
    toothId = toothId.toUpperCase().trim();
    if (!VALID_TOOTH_IDS.includes(toothId)) {
      v.addError('tooth_id', 'Invalid tooth ID. Must be one of: UR1-UR8, UL1-UL8, LR1-LR8, LL1-LL8.');
    }
  }
  // notes may be left out to change only the colours (they are kept as they were)
  const notes = v.has('notes') ? v.char('notes', { allowBlank: true, allowNull: true }) ?? '' : undefined;
  const colours = await validateToothColours(v);
  v.throwIfErrors();
  const settings = await loadSettings();

  const existing = await ToothRecord.findOne({ patient_uid: uid, tooth_id: toothId });
  if (existing) {
    const before = snapshot(existing);
    if (notes !== undefined) existing.notes = notes;
    applyColours(existing, colours);
    existing.edited_by = req.user._id;
    existing.markModified('notes'); // always bump recorded_at, like Django's auto_now
    await existing.save();
    await existing.populate('edited_by', USER_NAME);
    await audit(req, {
      action: 'tooth.update',
      patient_uid: uid,
      summary: describeToothChange(settings, toothId, before, existing),
      details: { before: { notes: before.notes, crown_status: before.crown_status, root_status: before.root_status }, after: { notes: existing.notes, crown_status: existing.crown_status, root_status: existing.root_status } },
    });
    res.status(200).json({ message: 'Tooth record updated.', record: serializeToothRecord(existing) });
    return;
  }

  const record = new ToothRecord({ patient_uid: uid, tooth_id: toothId, notes: notes ?? '', edited_by: req.user._id });
  applyColours(record, colours);
  await record.save();
  await record.populate('edited_by', USER_NAME);
  await audit(req, {
    action: 'tooth.update',
    patient_uid: uid,
    summary: describeToothChange(settings, toothId, null, record),
    details: { after: { notes: record.notes, crown_status: record.crown_status, root_status: record.root_status } },
  });
  res.status(201).json({ message: 'Tooth record saved.', record: serializeToothRecord(record) });
}

// POST /api/tooth/bulk/ — apply colours and/or a note to several teeth at once
//   { patient_uid, tooth_ids: [...], crown_status?, root_status?, status? (both),
//     note?: { part, text, mode: "append" | "replace" } }
export async function bulkUpdateTeeth(req, res) {
  denyReceptionist(req, 'Receptionists cannot access tooth records.');

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const v = new Validator(body);
  const uid = await validatePatientUid(v);

  let toothIds = [];
  if (!Array.isArray(body.tooth_ids) || body.tooth_ids.length === 0) {
    v.addError('tooth_ids', 'Select at least one tooth.');
  } else {
    toothIds = [...new Set(body.tooth_ids.map((t) => String(t ?? '').toUpperCase().trim()))];
    const bad = toothIds.filter((t) => !VALID_TOOTH_IDS.includes(t));
    if (bad.length) v.addError('tooth_ids', `Invalid tooth ID: ${bad.join(', ')}.`);
  }

  const colours = await validateToothColours(v);

  let note;
  if (body.note !== undefined && body.note !== null) {
    const n = body.note;
    const part = typeof n?.part === 'string' ? n.part.toUpperCase() : 'G';
    const text = typeof n?.text === 'string' ? n.text.trim() : '';
    const mode = n?.mode === 'replace' ? 'replace' : 'append';
    if (!TOOTH_PARTS.includes(part)) v.addError('note', `Part must be one of ${TOOTH_PARTS.join(', ')}.`);
    else if (!text && mode === 'append') v.addError('note', 'Note text is required.');
    else note = { part, text, mode };
  }

  if (colours.crown === undefined && colours.root === undefined && note === undefined && !v.hasErrors()) {
    throw fieldErrors({ non_field_errors: ['Choose a status or write a note to apply.'] });
  }
  v.throwIfErrors();

  const existing = await ToothRecord.find({ patient_uid: uid, tooth_id: { $in: toothIds } });
  const byId = new Map(existing.map((r) => [r.tooth_id, r]));
  const saved = [];
  const beforeAll = {};
  for (const toothId of toothIds) {
    const record = byId.get(toothId) || new ToothRecord({ patient_uid: uid, tooth_id: toothId, notes: '', status: '' });
    beforeAll[toothId] = { notes: record.notes, crown_status: record.crown_status, root_status: record.root_status };
    applyColours(record, colours);
    if (note) {
      const parts = parseToothNotes(record.notes);
      const current = parts[note.part] || '';
      parts[note.part] = note.mode === 'replace' || !current ? note.text : `${current}\n${note.text}`;
      record.notes = serializeToothNotes(parts);
    }
    record.edited_by = req.user._id;
    record.markModified('notes');
    await record.save();
    saved.push(record);
  }
  await ToothRecord.populate(saved, { path: 'edited_by', select: USER_NAME });
  saved.sort((a, b) => (a.tooth_id < b.tooth_id ? -1 : a.tooth_id > b.tooth_id ? 1 : 0));

  const settings = await loadSettings();
  const what = [
    colours.crown !== undefined ? `crown ${statusLabel(settings, colours.crown)}` : null,
    colours.root !== undefined ? `root ${statusLabel(settings, colours.root)}` : null,
    note ? `note "${note.text.slice(0, 60)}"` : null,
  ].filter(Boolean).join(', ');
  await audit(req, {
    action: 'tooth.bulk',
    patient_uid: uid,
    summary: `${saved.length} teeth (${toothIds.join(', ')}): ${what}`,
    details: { before: beforeAll },
  });

  res.json({ message: `Updated ${saved.length} teeth.`, records: saved.map(serializeToothRecord) });
}

// GET /api/tooth/:uid/
export async function listToothRecords(req, res) {
  denyReceptionist(req, 'Receptionists cannot access tooth records.');
  const uid = normalizeUid(req.params.uid);
  const records = await ToothRecord.find({ patient_uid: uid }).populate('edited_by', USER_NAME);
  records.sort((a, b) => (a.tooth_id < b.tooth_id ? -1 : a.tooth_id > b.tooth_id ? 1 : 0));
  res.json({ patient_uid: uid, total: records.length, records: records.map(serializeToothRecord) });
}

async function findToothRecordOr404(req) {
  const uid = normalizeUid(req.params.uid);
  const toothId = String(req.params.toothId || '').toUpperCase().trim();
  const record = await ToothRecord.findOne({ patient_uid: uid, tooth_id: toothId }).populate('edited_by', USER_NAME);
  if (!record) throw notFound(`No record found for tooth ${toothId} of patient ${uid}.`);
  return record;
}

// GET /api/tooth/:uid/:toothId/
export async function getToothRecord(req, res) {
  denyReceptionist(req, 'Receptionists cannot access tooth records.');
  const record = await findToothRecordOr404(req);
  res.json({ record: serializeToothRecord(record) });
}

// DELETE /api/tooth/:uid/:toothId/
export async function deleteToothRecord(req, res) {
  denyReceptionist(req, 'Receptionists cannot delete tooth records.');
  const record = await findToothRecordOr404(req);
  const before = snapshot(record);
  await record.deleteOne();
  await audit(req, {
    action: 'tooth.clear',
    patient_uid: record.patient_uid,
    summary: `${record.tooth_id}: cleared colours and notes (copy kept in history)`,
    details: before,
  });
  res.json({ message: 'Tooth record deleted successfully.' });
}

// ═══ Treatments ═════════════════════════════════════════════════════════════

// POST /api/treatments/ — master, doctor
export async function createTreatment(req, res) {
  denyReceptionist(req, 'Receptionists cannot add treatment records.');

  const v = new Validator(req.body);
  const uid = await validatePatientUid(v);
  const description = v.char('description', { minLength: 3 });
  const cost = v.decimal('cost', { maxDigits: 10, decimalPlaces: 2, min: 0, defaultValue: 0 });
  const treatmentDate = v.date('treatment_date', { required: false, allowNull: true });
  v.throwIfErrors();

  const treatment = await Treatment.create({
    patient_uid: uid,
    description,
    cost,
    performed_by: req.user._id,
    // Missing/empty date defaults to today in the clinic time zone
    treatment_date: treatmentDate || today(),
  });
  await treatment.populate('performed_by', USER_NAME);

  await audit(req, {
    action: 'treatment.create',
    patient_uid: uid,
    summary: `Treatment done: ${description} — ₹${Number(cost || 0).toFixed(2)} on ${treatment.treatment_date}`,
  });
  res.status(201).json({ message: 'Treatment recorded successfully.', treatment: serializeTreatment(treatment) });
}

// GET /api/treatments/:uid/ — all roles
export async function listTreatments(req, res) {
  const uid = normalizeUid(req.params.uid);
  const treatments = await Treatment.find({ patient_uid: uid })
    .sort({ created_at: -1, _id: -1 })
    .populate('performed_by', USER_NAME);

  const total = sumMoney(treatments.map((t) => t.cost));
  res.json({
    patient_uid: uid,
    total: treatments.length,
    // Original API returned str(Decimal sum): "0" when empty, otherwise "1234.50"
    total_cost: treatments.length ? total.toFixed(2) : '0',
    treatments: treatments.map(serializeTreatment),
  });
}
