/**
 * Prescriptions (medicines with a date).
 *
 *   GET    /api/prescriptions/:uid/          all roles (reception prints them)
 *   POST   /api/prescriptions/               { patient_uid, date?, items: [...], advice? }  doctor, master
 *   PATCH  /api/prescriptions/item/:id/      { date?, items?, advice? }                      doctor, master
 *   DELETE /api/prescriptions/item/:id/      hides it (kept in the history)                 doctor, master
 */
import mongoose from 'mongoose';
import { Patient, Prescription } from '../models/index.js';
import { audit, snapshot } from '../utils/audit.js';
import { today } from '../utils/dates.js';
import { fieldErrors, forbidden, notFound } from '../utils/errors.js';
import { normalizeUid } from '../utils/uid.js';
import Validator from '../utils/validation.js';

const USER_NAME = 'name role';
const nameOf = (u) => (u && typeof u === 'object' && 'name' in u ? u.name : null);
const clip = (v, n) => (v === undefined || v === null ? '' : String(v).trim().slice(0, n));

export const serializePrescription = (p) => ({
  id: String(p._id),
  patient_uid: p.patient_uid,
  date: p.date,
  items: (p.items || []).map((m) => ({
    name: m.name,
    dose: m.dose || '',
    frequency: m.frequency || '',
    days: m.days ?? null,
    timing: m.timing || '',
    notes: m.notes || '',
  })),
  advice: p.advice || '',
  created_by_name: nameOf(p.created_by),
  updated_by_name: nameOf(p.updated_by),
  created_at: p.created_at,
  updated_at: p.updated_at,
});

function requireClinician(req) {
  if (req.user.role === 'receptionist') throw forbidden('Only doctors can write prescriptions.');
}

/** Validates the medicine list; returns clean items or throws field errors */
function parseItems(raw) {
  if (!Array.isArray(raw)) throw fieldErrors({ items: ['Add at least one medicine.'] });
  const items = [];
  raw.forEach((m, i) => {
    const name = clip(m?.name, 120);
    if (!name) return; // empty rows are ignored
    let days = m?.days;
    if (days === '' || days === undefined || days === null) days = null;
    else {
      days = Number(days);
      if (!Number.isInteger(days) || days < 0 || days > 365) {
        throw fieldErrors({ items: [`Medicine ${i + 1}: days must be a whole number up to 365.`] });
      }
    }
    items.push({
      name,
      dose: clip(m?.dose, 40),
      frequency: clip(m?.frequency, 40),
      days,
      timing: clip(m?.timing, 40),
      notes: clip(m?.notes, 200),
    });
  });
  if (!items.length) throw fieldErrors({ items: ['Add at least one medicine.'] });
  if (items.length > 30) throw fieldErrors({ items: ['At most 30 medicines on one prescription.'] });
  return items;
}

const summaryOf = (p) => `${p.date}: ${p.items.map((m) => [m.name, m.dose].filter(Boolean).join(' ')).join(', ')}`;

export async function listForPatient(req, res) {
  const uid = normalizeUid(req.params.uid);
  const list = await Prescription.find({ patient_uid: uid, deleted_at: null })
    .sort({ date: -1, created_at: -1 })
    .populate('created_by', USER_NAME)
    .populate('updated_by', USER_NAME);
  res.json({ patient_uid: uid, prescriptions: list.map(serializePrescription) });
}

export async function create(req, res) {
  requireClinician(req);
  const v = new Validator(req.body);
  const raw = v.char('patient_uid', { maxLength: 6 });
  const date = v.date('date', { required: false, allowNull: true });
  const advice = v.char('advice', { required: false, allowBlank: true, allowNull: true, maxLength: 1000 });
  let uid;
  if (raw !== undefined && !v.hasErrors('patient_uid')) {
    uid = normalizeUid(raw);
    if (!(await Patient.exists({ uid }))) v.addError('patient_uid', `Patient with UID ${uid} not found.`);
  }
  v.throwIfErrors();
  const items = parseItems(req.body?.items);

  const rx = await Prescription.create({
    patient_uid: uid,
    date: date || today(),
    items,
    advice: advice || '',
    created_by: req.user._id,
  });
  await rx.populate('created_by', USER_NAME);
  await audit(req, { action: 'prescription.create', patient_uid: uid, summary: `Prescription ${summaryOf(rx)}` });
  res.status(201).json({ message: 'Prescription saved.', prescription: serializePrescription(rx) });
}

async function findOr404(id) {
  const rx = mongoose.isValidObjectId(id) ? await Prescription.findOne({ _id: id, deleted_at: null }) : null;
  if (!rx) throw notFound('Prescription not found.');
  return rx;
}

export async function update(req, res) {
  requireClinician(req);
  const rx = await findOr404(req.params.id);
  const before = snapshot(rx);
  const v = new Validator(req.body);
  const date = v.has('date') ? v.date('date') : undefined;
  const advice = v.has('advice') ? v.char('advice', { required: false, allowBlank: true, allowNull: true, maxLength: 1000 }) : undefined;
  v.throwIfErrors();
  if (req.body && Object.prototype.hasOwnProperty.call(req.body, 'items')) rx.items = parseItems(req.body.items);
  if (date !== undefined) rx.date = date;
  if (advice !== undefined) rx.advice = advice || '';
  rx.updated_by = req.user._id;
  await rx.save();
  await rx.populate([
    { path: 'created_by', select: USER_NAME },
    { path: 'updated_by', select: USER_NAME },
  ]);
  await audit(req, {
    action: 'prescription.update',
    patient_uid: rx.patient_uid,
    summary: `Changed prescription ${summaryOf(rx)}`,
    details: { before: { date: before.date, items: before.items, advice: before.advice } },
  });
  res.json({ message: 'Prescription updated.', prescription: serializePrescription(rx) });
}

export async function remove(req, res) {
  requireClinician(req);
  const rx = await findOr404(req.params.id);
  rx.deleted_at = new Date();
  rx.deleted_by = req.user._id;
  await rx.save();
  await audit(req, {
    action: 'prescription.delete',
    patient_uid: rx.patient_uid,
    summary: `Removed prescription ${summaryOf(rx)} (kept in history)`,
    details: snapshot(rx),
  });
  res.json({ message: 'Prescription removed.' });
}
