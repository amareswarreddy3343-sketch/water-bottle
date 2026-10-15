import fs from 'node:fs/promises';
import path from 'node:path';
import mongoose from 'mongoose';
import config from '../config/env.js';
import {
  ChiefComplaint,
  Patient,
  PatientReport,
  Payment,
  ToothRecord,
  Treatment,
  UPLOADABLE_REPORT_TYPES,
} from '../models/index.js';
import { removeUploadedFile } from '../middleware/upload.js';
import { apiError, badRequest, forbidden, notFound } from '../utils/errors.js';
import { moneyString, roundMoney, sumMoney } from '../utils/money.js';
import {
  serializeComplaint,
  serializePatient,
  serializePayment,
  serializeReport,
  serializeTreatment,
} from '../utils/serializers.js';
import { audit, snapshot } from '../utils/audit.js';
import { normalizeUid } from '../utils/uid.js';

const USER_NAME = 'name role';
const str = (v) => (v === undefined || v === null ? '' : String(v));

// ── POST /api/reports/ (multipart: patient_uid, file, report_type, description) ─
export async function createReport(req, res) {
  const { file } = req;
  try {
    const patientUid = normalizeUid(str(req.body?.patient_uid).trim());
    const reportType = str(req.body?.report_type).trim();
    const description = str(req.body?.description).trim();

    if (!patientUid || !file || !reportType) {
      throw badRequest('patient_uid, file, and report_type are required');
    }
    if (!UPLOADABLE_REPORT_TYPES.includes(reportType)) {
      throw badRequest(`Invalid report type. Choose from: ${UPLOADABLE_REPORT_TYPES.join(', ')}`);
    }
    if (!(await Patient.exists({ uid: patientUid }))) {
      throw badRequest(`Patient with UID ${patientUid} not found.`);
    }

    const report = await PatientReport.create({
      patient_uid: patientUid,
      file: file.relativePath,
      report_type: reportType,
      description,
      file_size_kb: Math.floor(file.size / 1024),
      uploaded_by: req.user._id,
    });
    await report.populate('uploaded_by', USER_NAME);
    await audit(req, {
      action: 'file.upload',
      patient_uid: patientUid,
      summary: `Uploaded ${reportType.replace('_', ' ')}${description ? `: ${description}` : ''} (${file.originalname})`,
    });

    res.status(201).json({ report: serializeReport(report, req) });
  } catch (err) {
    await removeUploadedFile(file);
    throw err;
  }
}

// ── GET /api/reports/:uid/ ─────────────────────────────────────────────────
export async function listReports(req, res) {
  const uid = normalizeUid(req.params.uid);
  // ?deleted=1 → the admin's "Deleted files" list (they can be restored)
  const deleted = ['1', 'true'].includes(String(req.query.deleted || ''));
  if (deleted && req.user.role !== 'master') throw forbidden('Only master admin can see deleted files');
  const reports = await PatientReport.find({ patient_uid: uid, deleted_at: deleted ? { $ne: null } : null })
    .sort(deleted ? { deleted_at: -1, _id: -1 } : { uploaded_at: -1, _id: -1 })
    .populate('uploaded_by', USER_NAME)
    .populate('deleted_by', USER_NAME);
  res.json({
    reports: reports.map((r) => ({
      ...serializeReport(r, req),
      ...(deleted ? { deleted_at: r.deleted_at, deleted_by_name: r.deleted_by?.name || null } : {}),
    })),
  });
}

// ── DELETE /api/reports/delete/:id/ (master only) ──────────────────────────
// The file is moved to MEDIA_ROOT/trash (not erased) and can be restored.
export async function deleteReport(req, res) {
  const { id } = req.params;
  const report = mongoose.isValidObjectId(id) ? await PatientReport.findOne({ _id: id, deleted_at: null }) : null;
  if (!report) throw notFound('Report not found');

  if (req.user.role !== 'master') {
    throw forbidden('Only master admin can delete reports');
  }

  if (report.file && !report.file.startsWith('trash/')) {
    const from = path.resolve(config.mediaRoot, report.file);
    const relTrash = path.posix.join('trash', report.file);
    const to = path.resolve(config.mediaRoot, relTrash);
    if (from.startsWith(config.mediaRoot + path.sep) && to.startsWith(config.mediaRoot + path.sep)) {
      try {
        await fs.mkdir(path.dirname(to), { recursive: true });
        await fs.rename(from, to);
        report.file = relTrash;
      } catch (err) {
        if (err.code !== 'ENOENT') throw err;
      }
    }
  }
  report.deleted_at = new Date();
  report.deleted_by = req.user._id;
  await report.save();
  await audit(req, {
    action: 'file.delete',
    patient_uid: report.patient_uid,
    summary: `Deleted a ${report.report_type.replace('_', ' ')} file (kept in trash, can be restored)`,
    details: { report_id: String(report._id), ...snapshot(report) },
  });

  res.json({ message: 'Report deleted successfully' });
}

// ── POST /api/reports/:id/restore/ (master only) ───────────────────────────
export async function restoreReport(req, res) {
  if (req.user.role !== 'master') throw forbidden('Only master admin can restore reports');
  const { id } = req.params;
  const report = mongoose.isValidObjectId(id) ? await PatientReport.findOne({ _id: id, deleted_at: { $ne: null } }) : null;
  if (!report) throw notFound('Deleted report not found');
  if (report.file?.startsWith('trash/')) {
    const original = report.file.slice('trash/'.length);
    const from = path.resolve(config.mediaRoot, report.file);
    const to = path.resolve(config.mediaRoot, original);
    if (from.startsWith(config.mediaRoot + path.sep) && to.startsWith(config.mediaRoot + path.sep)) {
      await fs.mkdir(path.dirname(to), { recursive: true });
      await fs.rename(from, to).catch((err) => {
        if (err.code !== 'ENOENT') throw err;
      });
      report.file = original;
    }
  }
  report.deleted_at = null;
  report.deleted_by = null;
  await report.save();
  await report.populate('uploaded_by', USER_NAME);
  await audit(req, { action: 'file.restore', patient_uid: report.patient_uid, summary: `Restored a ${report.report_type.replace('_', ' ')} file` });
  res.json({ message: 'Report restored', report: serializeReport(report, req) });
}

// ── GET /api/reports/receipt/:uid/ ─────────────────────────────────────────
export async function receipt(req, res) {
  const uid = normalizeUid(req.params.uid);

  const patient = await Patient.findOne({ uid }).populate('created_by', USER_NAME);
  if (!patient) {
    throw apiError(404, `Patient with UID ${uid} not found`);
  }

  const treatments = await Treatment.find({ patient_uid: uid })
    .sort({ treatment_date: -1, created_at: -1, _id: -1 })
    .populate('performed_by', USER_NAME);
  // Payment by payment, oldest first (as listed on the printed receipt)
  const payments = await Payment.find({ patient_uid: uid, voided_at: null })
    .sort({ created_at: 1, _id: 1 })
    .populate('created_by', USER_NAME);
  if (treatments.length === 0 && payments.length === 0) {
    throw apiError(404, 'No treatments found for this patient');
  }

  const complaints = await ChiefComplaint.find({ patient_uid: uid })
    .sort({ created_at: -1, _id: -1 })
    .populate('created_by', USER_NAME)
    .populate('last_edited_by', USER_NAME);

  const toothRecords = await ToothRecord.find({ patient_uid: uid });
  toothRecords.sort((a, b) => (a.tooth_id < b.tooth_id ? -1 : a.tooth_id > b.tooth_id ? 1 : 0));

  res.json({
    patient: serializePatient(patient),
    complaints: complaints.map(serializeComplaint),
    tooth_records: toothRecords.map((tr) => ({
      tooth_id: tr.tooth_id,
      notes: tr.notes,
      recorded_at: tr.recorded_at ? tr.recorded_at.toISOString() : null,
    })),
    treatments: treatments.map(serializeTreatment),
    total_cost: sumMoney(treatments.map((t) => t.cost)),
    payments: payments.map(serializePayment),
    ...billSummary(patient, treatments, payments),
  });
}

/** Amount billed (admin's manual total if set), paid so far and balance */
function billSummary(patient, treatments, payments) {
  const treatmentsTotal = sumMoney(treatments.map((t) => t.cost));
  const manual = patient.manual_total === null || patient.manual_total === undefined ? null : roundMoney(patient.manual_total);
  const billed = manual ?? treatmentsTotal;
  // The patient's running total is authoritative; data from older versions may
  // include amounts paid before payment history was recorded.
  const paid = roundMoney(patient.paid_amount || 0);
  const listed = sumMoney(payments.map((p) => p.amount));
  const byMode = (mode) => sumMoney(payments.filter((p) => (p.mode || 'cash') === mode).map((p) => p.amount));
  return {
    billed_total: moneyString(billed),
    paid_total: moneyString(paid),
    paid_cash: moneyString(byMode('cash')),
    paid_upi: moneyString(byMode('upi')),
    paid_unrecorded: moneyString(Math.max(0, roundMoney(paid - listed))),
    balance: moneyString(billed - paid),
  };
}
