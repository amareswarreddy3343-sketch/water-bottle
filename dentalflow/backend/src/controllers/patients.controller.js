import mongoose from 'mongoose';
import {
  Appointment,
  CheckIn,
  ChiefComplaint,
  GENDERS,
  PAYMENT_MODES,
  Patient,
  PatientEdit,
  Payment,
  ToothRecord,
  Treatment,
  User,
} from '../models/index.js';
import { audit, snapshot } from '../utils/audit.js';
import { markArrived, setSingleAppointment } from './appointments.controller.js';
import { localDayRange, today } from '../utils/dates.js';
import { badRequest, forbidden, notFound } from '../utils/errors.js';
import { moneyString, roundMoney, sumMoney } from '../utils/money.js';
import {
  serializeCheckIn,
  serializePatient,
  serializePatientEdit,
  serializePayment,
} from '../utils/serializers.js';
import { generateUniqueUid, normalizeUid } from '../utils/uid.js';
import Validator, { isValidDateString, parseChar, parseChoice, parseInteger, parseStringList } from '../utils/validation.js';

const USER_NAME = 'name role';

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Like Python's float(): accepts numbers and numeric strings, anything else → NaN */
function toNumberOrNaN(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') return Number(value.trim());
  return NaN;
}

async function findPatientOr404(rawUid, { populate = false } = {}) {
  const uid = normalizeUid(rawUid);
  const query = Patient.findOne({ uid });
  if (populate) query.populate('created_by', USER_NAME);
  const patient = await query;
  if (!patient) throw notFound(`Patient ${uid} not found`);
  return patient;
}

/** Total cost for a patient: manual override if set, otherwise the sum of treatments */
async function totalCostFor(patient) {
  if (patient.manual_total !== null && patient.manual_total !== undefined) {
    return roundMoney(patient.manual_total);
  }
  const treatments = await Treatment.find({ patient_uid: patient.uid }, 'cost').lean();
  return sumMoney(treatments.map((t) => t.cost));
}

// ── POST /api/patients/ ────────────────────────────────────────────────────
export async function createPatient(req, res) {
  if (req.user.role === 'doctor') {
    throw forbidden('New patients are registered by reception.');
  }
  const v = new Validator(req.body);
  const name = v.char('name', { maxLength: 200 });
  const age = v.integer('age', { min: 0 });
  const gender = v.choice('gender', GENDERS);
  const phone = v.char('phone', { required: false, allowBlank: true, maxLength: 20 });
  const preProblems = v.char('pre_problems', { required: false, allowBlank: true, allowNull: true });
  const comorbidities = v.stringList('comorbidities', { required: false, allowNull: true, maxItems: 50, maxLength: 60 });
  v.throwIfErrors();

  const uid = await generateUniqueUid(Patient);
  const patient = await Patient.create({
    uid,
    name,
    age,
    gender: gender ?? 'other',
    phone: phone ?? '',
    comorbidities: comorbidities ?? [],
    pre_problems: preProblems ?? '',
    paid_amount: 0,
    created_by: req.user._id,
  });
  await patient.populate('created_by', USER_NAME);
  // A new patient is at the clinic now: this is also today's visit (doctor's "waiting" list)
  const reason = String(req.body?.reason ?? '').trim().slice(0, 300);
  await CheckIn.create({ patient_uid: uid, created_by: req.user._id, visit_date: today(), reason });
  await audit(req, {
    action: 'patient.create',
    patient_uid: uid,
    summary: `Registered new patient ${name} (${uid})`,
    details: { name, age, gender: patient.gender, phone: patient.phone, comorbidities: patient.comorbidities },
  });

  res.status(201).json({ patient: serializePatient(patient) });
}

// ── GET /api/patients/duplicates/?name=&phone= — "already registered?" check ──
export async function findDuplicates(req, res) {
  const phone = String(req.query.phone || '').replace(/\D/g, '');
  const name = String(req.query.name || '').trim().replace(/\s+/g, ' ');
  const or = [];
  // phones are saved as typed ("+91 98450 12345"), so allow spaces/dashes between digits
  if (phone.length >= 6) or.push({ phone: new RegExp(`${phone.slice(-10).split('').join('\\D*')}\\D*$`) });
  if (name.length >= 3) or.push({ name: new RegExp(`^${escapeRegex(name)}$`, 'i') });
  if (!or.length) {
    res.json({ matches: [] });
    return;
  }
  const matches = await Patient.find({ $or: or }).sort({ created_at: -1 }).limit(5).populate('created_by', USER_NAME);
  res.json({ matches: matches.map(serializePatient) });
}

// ── GET /api/patients/:uid/ ────────────────────────────────────────────────
export async function getPatient(req, res) {
  const patient = await findPatientOr404(req.params.uid, { populate: true });
  res.json({ patient: serializePatient(patient) });
}

// ── GET /api/patients/search/?search= ─────────────────────────────────────
export async function searchPatients(req, res) {
  const query = String(req.query.search ?? '').trim();
  const filter = {};
  if (query) {
    const re = new RegExp(escapeRegex(query), 'i');
    filter.$or = [{ uid: re }, { name: re }, { phone: re }];
  }
  const patients = await Patient.find(filter)
    .sort({ created_at: -1, _id: -1 })
    .populate('created_by', USER_NAME);

  // Treatment count and last treatment date for each patient (lets the app split
  // "new" and "treated" patients without one request per patient)
  const treatments = await Treatment.find(
    { patient_uid: { $in: patients.map((p) => p.uid) } },
    'patient_uid treatment_date',
  ).lean();
  const byUid = new Map();
  for (const t of treatments) {
    const s = byUid.get(t.patient_uid) || { count: 0, last: null };
    s.count += 1;
    if (!s.last || t.treatment_date > s.last) s.last = t.treatment_date;
    byUid.set(t.patient_uid, s);
  }

  res.json({
    results: patients.map((p) => ({
      ...serializePatient(p),
      treatment_count: byUid.get(p.uid)?.count ?? 0,
      last_treatment_date: byUid.get(p.uid)?.last ?? null,
    })),
  });
}

// ── PATCH /api/patients/:uid/problems/ (doctor / master) ───────────────────
export async function updateProblems(req, res) {
  if (req.user.role === 'receptionist') {
    throw forbidden('Receptionists cannot edit medical problems.');
  }
  const patient = await findPatientOr404(req.params.uid);
  const body = req.body || {};
  const has = (key) => Object.prototype.hasOwnProperty.call(body, key);
  const before = { comorbidities: [...(patient.comorbidities || [])], notes: patient.pre_problems || '' };

  if (has('comorbidities')) {
    try {
      patient.comorbidities = parseStringList(body.comorbidities, { allowNull: true, maxItems: 50, maxLength: 60 }) ?? [];
    } catch (err) {
      throw badRequest(`Invalid comorbidities: ${err.message}`);
    }
  }
  // Older clients send only pre_problems; a missing/null value clears it (original behaviour)
  if (has('pre_problems') || !has('comorbidities')) {
    const raw = body.pre_problems;
    patient.pre_problems = raw === undefined || raw === null ? '' : String(raw).trim();
  }
  await patient.save();
  await audit(req, {
    action: 'patient.conditions',
    patient_uid: patient.uid,
    summary: `Updated comorbidities: ${patient.comorbidities.join(', ') || 'none'}${patient.pre_problems ? ` — ${patient.pre_problems}` : ''}`,
    details: { before, after: { comorbidities: [...patient.comorbidities], notes: patient.pre_problems } },
  });

  const response = { message: 'Updated.', pre_problems: patient.pre_problems };
  if (has('comorbidities')) response.comorbidities = [...patient.comorbidities];
  res.json(response);
}

// ── PATCH /api/patients/:uid/payment/  and  POST /api/patients/:uid/payments/ ─
export async function addPayment(req, res) {
  const patient = await findPatientOr404(req.params.uid);

  const raw = req.body?.paid_amount === undefined ? 0 : req.body.paid_amount;
  const paid = toNumberOrNaN(raw);
  if (!Number.isFinite(paid)) {
    throw badRequest('Invalid amount.');
  }
  if (paid <= 0) {
    throw badRequest('Paid amount must be greater than zero.');
  }
  const amount = roundMoney(paid);
  if (amount <= 0) {
    throw badRequest('Paid amount must be greater than zero.');
  }

  // Payment mode: cash (default, as before) or UPI with an optional reference number
  const rawMode = req.body?.mode;
  const mode = rawMode === undefined || rawMode === null || rawMode === '' ? 'cash' : String(rawMode).trim().toLowerCase();
  if (!PAYMENT_MODES.includes(mode)) {
    throw badRequest('Payment mode must be cash or upi.');
  }
  const reference = req.body?.reference == null ? '' : String(req.body.reference).trim();
  if (reference.length > 60) {
    throw badRequest('Reference must be 60 characters or fewer.');
  }

  // Incremental payment: atomically add to the running total and record history
  const updated = await Patient.findOneAndUpdate(
    { _id: patient._id },
    { $inc: { paid_amount: amount } },
    { new: true },
  );
  const paidTotal = roundMoney(updated.paid_amount);
  if (paidTotal !== updated.paid_amount) {
    // keep stored value at 2 decimal places (avoids binary float drift)
    await Patient.updateOne({ _id: updated._id, paid_amount: updated.paid_amount }, { $set: { paid_amount: paidTotal } });
    updated.paid_amount = paidTotal;
  }

  const payment = await Payment.create({
    patient_uid: patient.uid,
    amount,
    mode,
    reference: mode === 'upi' ? reference : '',
    created_by: req.user._id,
  });
  await payment.populate('created_by', USER_NAME);
  await audit(req, {
    action: 'payment.create',
    patient_uid: patient.uid,
    summary: `Received ₹${moneyString(amount)} by ${mode === 'upi' ? 'UPI' : 'cash'}${reference && mode === 'upi' ? ` (ref ${reference})` : ''}`,
  });

  const totalCost = await totalCostFor(updated);
  res.json({
    message: 'Payment recorded.',
    paid_amount: paidTotal,
    total_cost: totalCost,
    pending_amount: roundMoney(totalCost - paidTotal),
    payment: serializePayment(payment),
  });
}

/** { total, cash, upi, count } for a list of payments (numbers) */
function paymentTotals(payments) {
  const of = (mode) => sumMoney(payments.filter((p) => (p.mode || 'cash') === mode).map((p) => p.amount));
  return {
    total: sumMoney(payments.map((p) => p.amount)),
    cash: of('cash'),
    upi: of('upi'),
    count: payments.length,
  };
}

// ── DELETE /api/patients/:uid/payments/:paymentId/ (master only) ───────────
export async function deletePayment(req, res) {
  if (req.user.role !== 'master') {
    throw forbidden('Only master admin can delete payments.');
  }
  const patient = await findPatientOr404(req.params.uid);
  const { paymentId } = req.params;
  const payment = mongoose.isValidObjectId(paymentId)
    ? await Payment.findOne({ _id: paymentId, patient_uid: patient.uid, voided_at: null })
    : null;
  if (!payment) throw notFound('Payment not found.');

  // Never erased: the payment is marked void (kept in the history) and no longer counts
  payment.voided_at = new Date();
  payment.voided_by = req.user._id;
  payment.void_reason = String(req.body?.reason || '').trim().slice(0, 200);
  await payment.save();
  await audit(req, {
    action: 'payment.delete',
    patient_uid: patient.uid,
    summary: `Deleted a payment of ₹${moneyString(payment.amount)} (${payment.mode === 'upi' ? 'UPI' : 'cash'}) entered by mistake`,
    details: snapshot(payment),
  });
  const updated = await Patient.findOneAndUpdate(
    { _id: patient._id },
    { $inc: { paid_amount: -payment.amount } },
    { new: true },
  );
  const paidTotal = roundMoney(updated.paid_amount);
  if (paidTotal !== updated.paid_amount) {
    await Patient.updateOne({ _id: updated._id }, { $set: { paid_amount: paidTotal } });
  }
  const totalCost = await totalCostFor(updated);
  res.json({
    message: 'Payment deleted.',
    paid_amount: paidTotal,
    total_cost: totalCost,
    pending_amount: roundMoney(totalCost - paidTotal),
  });
}

// ── GET /api/payments/?from=YYYY-MM-DD&to=YYYY-MM-DD&mode= (doctor / master) ─
export async function paymentsReport(req, res) {
  if (!req.user.canViewCollections()) {
    throw forbidden('You are not allowed to see the clinic collections. Ask the admin.');
  }
  const from = String(req.query.from ?? '').trim() || today();
  const to = String(req.query.to ?? '').trim() || from;
  if (!isValidDateString(from) || !isValidDateString(to)) {
    throw badRequest('Invalid date format. Use YYYY-MM-DD.');
  }
  if (to < from) throw badRequest('"to" date must be on or after the "from" date.');
  const mode = String(req.query.mode ?? '').trim().toLowerCase();
  if (mode && !PAYMENT_MODES.includes(mode)) throw badRequest('Payment mode must be cash or upi.');

  const start = localDayRange(from).start;
  const end = localDayRange(to).end;
  const filter = { created_at: { $gte: start, $lt: end }, voided_at: null };
  const all = await Payment.find(filter).sort({ created_at: -1, _id: -1 }).populate('created_by', USER_NAME);
  const list = mode ? all.filter((p) => (p.mode || 'cash') === mode) : all;

  const uids = [...new Set(list.map((p) => p.patient_uid))];
  const patients = await Patient.find({ uid: { $in: uids } }, 'uid name').lean();
  const names = new Map(patients.map((p) => [p.uid, p.name]));

  const totals = paymentTotals(all);
  res.json({
    from,
    to,
    mode: mode || null,
    total: moneyString(totals.total),
    cash: moneyString(totals.cash),
    upi: moneyString(totals.upi),
    count: totals.count,
    payments: list.map((p) => ({
      ...serializePayment(p),
      patient_uid: p.patient_uid,
      patient_name: names.get(p.patient_uid) ?? null,
    })),
  });
}

// ── GET /api/patients/:uid/payments/ ───────────────────────────────────────
export async function listPayments(req, res) {
  const patient = await findPatientOr404(req.params.uid);
  const payments = await Payment.find({ patient_uid: patient.uid, voided_at: null })
    .sort({ created_at: -1, _id: -1 })
    .populate('created_by', USER_NAME);
  const totals = paymentTotals(payments);
  res.json({
    payments: payments.map(serializePayment),
    summary: { total: moneyString(totals.total), cash: moneyString(totals.cash), upi: moneyString(totals.upi) },
  });
}

// ── PATCH /api/patients/:uid/edit/ — edit basic details + record history ───
export async function editPatient(req, res) {
  const patient = await findPatientOr404(req.params.uid);
  const body = req.body || {};

  const parsers = {
    name: (v) => parseChar(v, { maxLength: 200 }),
    age: (v) => parseInteger(typeof v === 'number' ? Math.trunc(v) : v, { min: 0 }),
    gender: (v) => parseChoice(v, GENDERS),
    phone: (v) => parseChar(v, { allowBlank: true, maxLength: 20 }),
  };

  const changes = {};
  for (const key of ['name', 'age', 'gender', 'phone']) {
    if (!Object.prototype.hasOwnProperty.call(body, key)) continue;
    let newVal;
    try {
      newVal = parsers[key](body[key]);
    } catch (err) {
      if (key === 'age') throw badRequest('Invalid age');
      throw badRequest(`Invalid ${key}: ${err.message}`);
    }
    const oldVal = patient[key];
    if (String(oldVal) !== String(newVal)) {
      changes[key] = { old: oldVal, new: newVal };
      patient[key] = newVal;
    }
  }

  if (Object.keys(changes).length === 0) {
    res.json({ message: 'No changes detected.' });
    return;
  }

  await patient.save();
  await PatientEdit.create({ patient_uid: patient.uid, changes, created_by: req.user._id });
  await audit(req, {
    action: 'patient.edit',
    patient_uid: patient.uid,
    summary: `Edited details: ${Object.entries(changes).map(([k, c]) => `${k} ${c.old} → ${c.new}`).join(', ')}`,
    details: changes,
  });
  res.json({ message: 'Patient updated.', changes });
}

// ── GET /api/patients/:uid/edits/ ──────────────────────────────────────────
export async function listEdits(req, res) {
  const patient = await findPatientOr404(req.params.uid);
  const edits = await PatientEdit.find({ patient_uid: patient.uid })
    .sort({ created_at: -1, _id: -1 })
    .populate('created_by', USER_NAME);
  res.json({ edits: edits.map(serializePatientEdit) });
}

// ── GET /api/patients/:uid/checkin/ ────────────────────────────────────────
export async function listCheckIns(req, res) {
  const patient = await findPatientOr404(req.params.uid);
  const checks = await CheckIn.find({ patient_uid: patient.uid })
    .sort({ created_at: -1, _id: -1 })
    .populate('created_by', USER_NAME);
  res.json({ checkins: checks.map(serializeCheckIn) });
}

// ── POST /api/patients/:uid/checkin/ — register today's visit (old or new patient) ─
export async function createCheckIn(req, res) {
  const patient = await findPatientOr404(req.params.uid);
  const visitDate = today();
  const reason = String(req.body?.reason ?? '').trim().slice(0, 300);

  // One visit per day: registering again just returns today's visit
  const existing = await CheckIn.findOne({ patient_uid: patient.uid, visit_date: visitDate });
  if (existing) {
    if (reason && !existing.reason) {
      existing.reason = reason;
      await existing.save();
    }
    res.json({
      message: 'Already registered for today',
      already: true,
      checkin_id: String(existing._id),
      created_at: existing.created_at,
    });
    return;
  }

  const checkin = await CheckIn.create({
    patient_uid: patient.uid,
    created_by: req.user._id,
    visit_date: visitDate,
    reason,
  });
  const appt = await markArrived(patient.uid, checkin._id);
  await audit(req, {
    action: 'visit.create',
    patient_uid: patient.uid,
    summary: `Registered today's visit${reason ? `: ${reason}` : ''}${appt ? ' (had an appointment)' : ''}`,
  });
  res.json({ message: 'Checked in', checkin_id: String(checkin._id), created_at: checkin.created_at, appointment: Boolean(appt) });
}

// ── GET /api/visits/today/ — patients registered today (waiting / seen) ─────
export async function todayVisits(req, res) {
  const date = today();
  const { start, end } = localDayRange(date);
  const visits = await CheckIn.find({ visit_date: date }).sort({ created_at: 1 }).populate('created_by', USER_NAME);
  const uids = [...new Set(visits.map((v) => v.patient_uid))];
  const [patients, treated, complained, charted] = await Promise.all([
    Patient.find({ uid: { $in: uids } }).populate('created_by', USER_NAME),
    Treatment.distinct('patient_uid', { patient_uid: { $in: uids }, created_at: { $gte: start, $lt: end } }),
    ChiefComplaint.distinct('patient_uid', { patient_uid: { $in: uids }, created_at: { $gte: start, $lt: end } }),
    ToothRecord.distinct('patient_uid', { patient_uid: { $in: uids }, recorded_at: { $gte: start, $lt: end } }),
  ]);
  const seen = new Set([...treated, ...complained, ...charted]);
  const byUid = new Map(patients.map((p) => [p.uid, serializePatient(p)]));
  res.json({
    date,
    visits: visits
      .filter((v) => byUid.has(v.patient_uid))
      .map((v) => ({
        id: String(v._id),
        patient: byUid.get(v.patient_uid),
        reason: v.reason || '',
        registered_at: v.created_at,
        registered_by_name: v.created_by?.name || null,
        with_appointment: Boolean(v.appointment),
        seen: seen.has(v.patient_uid),
      })),
  });
}

// ── PATCH /api/patients/:uid/total/ (master only) ──────────────────────────
export async function updateManualTotal(req, res) {
  if (req.user.role !== 'master') {
    throw forbidden('Only master admin can edit total.');
  }
  const patient = await findPatientOr404(req.params.uid);
  const oldTotal = patient.manual_total ?? null;

  const val = req.body?.manual_total;
  if (val === undefined || val === null || val === '') {
    patient.manual_total = null; // clear override
  } else {
    const mt = toNumberOrNaN(val);
    if (!Number.isFinite(mt)) throw badRequest('Invalid amount.');
    if (mt < 0) throw badRequest('Total cannot be negative.');
    patient.manual_total = roundMoney(mt);
  }
  await patient.save();
  await audit(req, {
    action: 'payment.total',
    patient_uid: patient.uid,
    summary: patient.manual_total === null ? 'Bill total set back to the treatments total' : `Bill total adjusted to ₹${moneyString(patient.manual_total)}`,
    details: { old: oldTotal, new: patient.manual_total ?? null },
  });
  res.json({ message: 'Manual total updated.', manual_total: patient.manual_total });
}

// ── PATCH /api/patients/:uid/appointment/ (doctor / master) ────────────────
export async function setAppointment(req, res) {
  if (req.user.role === 'receptionist') {
    throw forbidden('Receptionists cannot set appointments.');
  }
  const patient = await findPatientOr404(req.params.uid);

  const raw = req.body?.next_appointment;
  let date = null;
  if (raw === undefined || raw === null || raw === '') {
    date = null; // None clears it
  } else if (typeof raw === 'string' && isValidDateString(raw.trim())) {
    date = raw.trim();
  } else {
    throw badRequest('Invalid date format. Use YYYY-MM-DD.');
  }
  if (date && date < today()) throw badRequest('Choose today or a later date.');
  const next = await setSingleAppointment(req, patient.uid, date);
  res.json({ message: 'Appointment set.', next_appointment: next });
}

// ── GET /api/patients/appointments/today/ ──────────────────────────────────
export async function todayAppointments(req, res) {
  const date = today();
  const appts = await Appointment.find({ date, status: { $ne: 'cancelled' } }).lean();
  const uids = [...new Set(appts.map((a) => a.patient_uid))];
  const patients = await Patient.find({ uid: { $in: uids } }).populate('created_by', USER_NAME);
  // Ordered by name (case-insensitive, like the original PostgreSQL ordering)
  patients.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
  res.json({ appointments: patients.map(serializePatient), date, count: patients.length });
}

// ── GET /api/patients/stats/ ───────────────────────────────────────────────
export async function dashboardStats(req, res) {
  const date = today();
  const { start, end } = localDayRange(date);
  const treatedUids = await Treatment.distinct('patient_uid');

  const [totalUsers, activeUsers, totalPatients, registeredToday, pendingPatients, totalTreatments, todayAppts, visitsToday] =
    await Promise.all([
      User.countDocuments({ removed_at: null }),
      User.countDocuments({ is_active: true, removed_at: null }),
      Patient.countDocuments(),
      Patient.countDocuments({ created_at: { $gte: start, $lt: end } }),
      Patient.countDocuments({ uid: { $nin: treatedUids } }),
      Treatment.countDocuments(),
      Appointment.countDocuments({ date, status: { $ne: 'cancelled' } }),
      CheckIn.countDocuments({ visit_date: date }),
    ]);

  const stats = {
    today: date,
    total_users: totalUsers,
    active_users: activeUsers,
    total_patients: totalPatients,
    registered_today: registeredToday,
    pending_patients: pendingPatients,
    total_treatments: totalTreatments,
    today_appointments: todayAppts,
    visits_today: visitsToday,
  };

  // Money is shown to the admin, reception (they take it) and doctors the admin allows
  if (req.user.role === 'receptionist' || req.user.canViewCollections()) {
    const todaysPayments = await Payment.find({ created_at: { $gte: start, $lt: end }, voided_at: null }, 'amount mode').lean();
    const collected = paymentTotals(todaysPayments);
    stats.collected_today = collected.total;
    stats.collected_today_cash = collected.cash;
    stats.collected_today_upi = collected.upi;
  }

  if (req.user.role === 'doctor') {
    const [myPatientUids, myTreatments] = await Promise.all([
      Treatment.distinct('patient_uid', { performed_by: req.user._id }),
      Treatment.countDocuments({ performed_by: req.user._id }),
    ]);
    stats.my_patients = myPatientUids.length;
    stats.my_treatments = myTreatments;
  }

  res.json({ stats });
}
