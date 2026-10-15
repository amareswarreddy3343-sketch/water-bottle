/**
 * Appointments.
 *
 *   GET    /api/appointments/?date=YYYY-MM-DD   that day's appointments (default today) — all roles
 *   GET    /api/appointments/upcoming/?days=7   from tomorrow on                          — all roles
 *   GET    /api/patients/:uid/appointments/     one patient's appointments                — all roles
 *   POST   /api/appointments/                   { patient_uid, date, time?, purpose? }    — doctor, master
 *   PATCH  /api/appointments/:id/               { date?, time?, purpose? }                — doctor, master
 *   POST   /api/appointments/:id/cancel/                                                  — doctor, master
 *
 * "Today" is always the clinic's date (Asia/Kolkata), never the phone's.
 */
import mongoose from 'mongoose';
import { Appointment, CheckIn, Patient } from '../models/index.js';
import { audit } from '../utils/audit.js';
import { addDays, today } from '../utils/dates.js';
import { apiError, badRequest, forbidden, notFound } from '../utils/errors.js';
import { serializePatient } from '../utils/serializers.js';
import { normalizeUid } from '../utils/uid.js';
import Validator, { isValidDateString } from '../utils/validation.js';

const USER_NAME = 'name role';
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const nameOf = (u) => (u && typeof u === 'object' && 'name' in u ? u.name : null);

export function serializeAppointment(a, todayStr = today()) {
  const status = a.status === 'scheduled' && a.date < todayStr ? 'missed' : a.status;
  return {
    id: String(a._id),
    patient_uid: a.patient_uid,
    date: a.date,
    time: a.time || '',
    purpose: a.purpose || '',
    status,
    arrived_at: a.arrived_at || null,
    created_by_name: nameOf(a.created_by),
    created_at: a.created_at,
  };
}

/** Keep patient.next_appointment = earliest upcoming scheduled appointment (or null) */
export async function syncNextAppointment(uid) {
  const next = await Appointment.findOne({ patient_uid: uid, status: 'scheduled', date: { $gte: today() } })
    .sort({ date: 1, time: 1 })
    .lean();
  await Patient.updateOne({ uid }, { $set: { next_appointment: next ? next.date : null } });
  return next ? next.date : null;
}

function requireClinician(req) {
  if (req.user.role === 'receptionist') throw forbidden('Only doctors can give appointments.');
}

/** Appointments with patient details, for dashboards */
async function withPatients(list) {
  const uids = [...new Set(list.map((a) => a.patient_uid))];
  const patients = await Patient.find({ uid: { $in: uids } }).populate('created_by', USER_NAME);
  const byUid = new Map(patients.map((p) => [p.uid, serializePatient(p)]));
  const todayStr = today();
  // who has already checked in today (for "arrived" on today's list)
  const checked = await CheckIn.find({ patient_uid: { $in: uids }, visit_date: todayStr }, 'patient_uid created_at').lean();
  const arrived = new Map(checked.map((c) => [c.patient_uid, c.created_at]));
  return list
    .filter((a) => byUid.has(a.patient_uid))
    .map((a) => {
      const item = { ...serializeAppointment(a, todayStr), patient: byUid.get(a.patient_uid) };
      if (a.date === todayStr && item.status === 'scheduled' && arrived.has(a.patient_uid)) {
        item.status = 'arrived';
        item.arrived_at = arrived.get(a.patient_uid);
      }
      return item;
    });
}

const byTime = (a, b) => (a.date + (a.time || '99:99')).localeCompare(b.date + (b.time || '99:99'));

// ── GET /api/appointments/?date= ───────────────────────────────────────────
export async function listForDay(req, res) {
  const date = String(req.query.date || '').trim() || today();
  if (!isValidDateString(date)) throw badRequest('Invalid date format. Use YYYY-MM-DD.');
  const list = await Appointment.find({ date, status: { $ne: 'cancelled' } }).populate('created_by', USER_NAME);
  list.sort(byTime);
  res.json({ date, today: today(), appointments: await withPatients(list) });
}

// ── GET /api/appointments/upcoming/?days=7 ─────────────────────────────────
export async function upcoming(req, res) {
  const days = Math.min(Math.max(parseInt(req.query.days, 10) || 7, 1), 60);
  const from = addDays(today(), 1);
  const to = addDays(today(), days);
  const list = await Appointment.find({ date: { $gte: from, $lte: to }, status: 'scheduled' }).populate('created_by', USER_NAME);
  list.sort(byTime);
  res.json({ from, to, appointments: await withPatients(list) });
}

// ── GET /api/patients/:uid/appointments/ ───────────────────────────────────
export async function listForPatient(req, res) {
  const uid = normalizeUid(req.params.uid);
  const list = await Appointment.find({ patient_uid: uid }).sort({ date: -1, time: -1 }).populate('created_by', USER_NAME);
  const todayStr = today();
  res.json({ today: todayStr, appointments: list.map((a) => serializeAppointment(a, todayStr)) });
}

function parseFields(v, { partial = false } = {}) {
  const date = partial && !v.has('date') ? undefined : v.date('date');
  const time = v.has('time') ? v.char('time', { required: false, allowBlank: true, allowNull: true }) : undefined;
  const purpose = v.has('purpose') ? v.char('purpose', { required: false, allowBlank: true, allowNull: true, maxLength: 200 }) : undefined;
  if (time && !TIME_RE.test(time)) v.addError('time', 'Time must look like 10:30 (24-hour).');
  if (date && !v.hasErrors('date') && date < today()) v.addError('date', 'Choose today or a later date.');
  return { date, time: time ?? undefined, purpose: purpose ?? undefined };
}

// ── POST /api/appointments/ ────────────────────────────────────────────────
export async function create(req, res) {
  requireClinician(req);
  const v = new Validator(req.body);
  const raw = v.char('patient_uid', { maxLength: 6 });
  const { date, time, purpose } = parseFields(v);
  let uid;
  if (raw !== undefined && !v.hasErrors('patient_uid')) {
    uid = normalizeUid(raw);
    if (!(await Patient.exists({ uid }))) v.addError('patient_uid', `Patient with UID ${uid} not found.`);
  }
  v.throwIfErrors();

  const clash = await Appointment.findOne({ patient_uid: uid, date, status: 'scheduled' });
  if (clash) throw apiError(400, 'This patient already has an appointment on that day.');

  const appt = await Appointment.create({ patient_uid: uid, date, time: time || '', purpose: purpose || '', created_by: req.user._id });
  await appt.populate('created_by', USER_NAME);
  const next = await syncNextAppointment(uid);
  await audit(req, {
    action: 'appointment.create',
    patient_uid: uid,
    summary: `Appointment on ${date}${time ? ` at ${time}` : ''}${purpose ? ` (${purpose})` : ''}`,
  });
  res.status(201).json({ message: 'Appointment saved.', appointment: serializeAppointment(appt), next_appointment: next });
}

async function findOr404(id) {
  const appt = mongoose.isValidObjectId(id) ? await Appointment.findById(id) : null;
  if (!appt) throw notFound('Appointment not found.');
  return appt;
}

// ── PATCH /api/appointments/:id/ ───────────────────────────────────────────
export async function update(req, res) {
  requireClinician(req);
  const appt = await findOr404(req.params.id);
  if (appt.status !== 'scheduled') throw badRequest('Only upcoming appointments can be changed.');
  const v = new Validator(req.body);
  const { date, time, purpose } = parseFields(v, { partial: true });
  v.throwIfErrors();
  const before = { date: appt.date, time: appt.time, purpose: appt.purpose };
  if (date !== undefined) appt.date = date;
  if (time !== undefined) appt.time = time || '';
  if (purpose !== undefined) appt.purpose = purpose || '';
  await appt.save();
  await appt.populate('created_by', USER_NAME);
  const next = await syncNextAppointment(appt.patient_uid);
  await audit(req, {
    action: 'appointment.update',
    patient_uid: appt.patient_uid,
    summary: `Appointment moved from ${before.date} to ${appt.date}`,
    details: { before, after: { date: appt.date, time: appt.time, purpose: appt.purpose } },
  });
  res.json({ message: 'Appointment updated.', appointment: serializeAppointment(appt), next_appointment: next });
}

// ── POST /api/appointments/:id/cancel/ ─────────────────────────────────────
export async function cancel(req, res) {
  requireClinician(req);
  const appt = await findOr404(req.params.id);
  if (appt.status !== 'scheduled') throw badRequest('This appointment is not upcoming.');
  appt.status = 'cancelled';
  appt.cancelled_at = new Date();
  appt.cancelled_by = req.user._id;
  await appt.save();
  await appt.populate('created_by', USER_NAME);
  const next = await syncNextAppointment(appt.patient_uid);
  await audit(req, { action: 'appointment.cancel', patient_uid: appt.patient_uid, summary: `Cancelled the appointment on ${appt.date}` });
  res.json({ message: 'Appointment cancelled.', appointment: serializeAppointment(appt), next_appointment: next });
}

/**
 * Older single-date API (PATCH /api/patients/:uid/appointment/ { next_appointment }):
 * a date books that day (if not already booked); null cancels upcoming appointments.
 */
export async function setSingleAppointment(req, uid, date) {
  if (date) {
    const exists = await Appointment.findOne({ patient_uid: uid, date, status: 'scheduled' });
    if (!exists) {
      // replacing "the" next appointment: earlier upcoming ones move to the new date
      await Appointment.updateMany(
        { patient_uid: uid, status: 'scheduled', date: { $gte: today() } },
        { $set: { status: 'cancelled', cancelled_at: new Date(), cancelled_by: req.user._id } },
      );
      await Appointment.create({ patient_uid: uid, date, created_by: req.user._id });
    }
    await audit(req, { action: 'appointment.create', patient_uid: uid, summary: `Appointment on ${date}` });
  } else {
    const n = await Appointment.updateMany(
      { patient_uid: uid, status: 'scheduled', date: { $gte: today() } },
      { $set: { status: 'cancelled', cancelled_at: new Date(), cancelled_by: req.user._id } },
    );
    if (n.modifiedCount) await audit(req, { action: 'appointment.cancel', patient_uid: uid, summary: 'Cancelled upcoming appointments' });
  }
  return syncNextAppointment(uid);
}

/** When a patient checks in, today's appointment is marked as arrived */
export async function markArrived(uid, checkinId) {
  const appt = await Appointment.findOne({ patient_uid: uid, date: today(), status: 'scheduled' });
  if (!appt) return null;
  appt.status = 'arrived';
  appt.arrived_at = new Date();
  await appt.save();
  await CheckIn.updateOne({ _id: checkinId }, { $set: { appointment: appt._id } });
  await syncNextAppointment(uid);
  return appt;
}
