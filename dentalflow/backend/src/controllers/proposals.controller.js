/**
 * Treatment plan / quotation (proposed treatments).
 *
 *   GET    /api/proposals/:uid/              all roles (reception prints quotations)
 *   POST   /api/proposals/                   doctor, master
 *   PATCH  /api/proposals/item/:id/          doctor, master (only while still proposed)
 *   DELETE /api/proposals/item/:id/          doctor, master
 *   POST   /api/proposals/item/:id/done/     doctor, master — records it as a performed treatment
 *   POST   /api/proposals/item/:id/undo/     doctor, master — reverses "done" (removes that treatment)
 */
import mongoose from 'mongoose';
import { Patient, ProposedTreatment, Treatment } from '../models/index.js';
import { today } from '../utils/dates.js';
import { badRequest, forbidden, notFound } from '../utils/errors.js';
import { moneyString, sumMoney } from '../utils/money.js';
import { serializeProposal, serializeTreatment } from '../utils/serializers.js';
import { audit, snapshot } from '../utils/audit.js';
import { normalizeUid } from '../utils/uid.js';
import Validator from '../utils/validation.js';

const USER_NAME = 'name role';

function requireClinician(req) {
  if (req.user.role === 'receptionist') {
    throw forbidden('Only doctors can change the treatment plan.');
  }
}

async function findProposalOr404(id) {
  const proposal = mongoose.isValidObjectId(id) ? await ProposedTreatment.findOne({ _id: id, deleted_at: null }) : null;
  if (!proposal) throw notFound('Proposed treatment not found.');
  return proposal;
}

const totalsOf = (list) => ({
  total_proposed: moneyString(sumMoney(list.filter((p) => p.status === 'proposed').map((p) => p.cost))),
  total_done: moneyString(sumMoney(list.filter((p) => p.status === 'done').map((p) => p.cost))),
});

export async function listProposals(req, res) {
  const uid = normalizeUid(req.params.uid);
  const list = await ProposedTreatment.find({ patient_uid: uid, deleted_at: null })
    .sort({ created_at: 1, _id: 1 })
    .populate('created_by', USER_NAME);
  res.json({ patient_uid: uid, proposals: list.map(serializeProposal), ...totalsOf(list) });
}

export async function createProposal(req, res) {
  requireClinician(req);
  const v = new Validator(req.body);
  const rawUid = v.char('patient_uid', { maxLength: 6 });
  const procedure = v.char('procedure', { minLength: 2, maxLength: 200 });
  const tooth = v.char('tooth', { required: false, allowBlank: true, allowNull: true, maxLength: 60 });
  const cost = v.decimal('cost', { maxDigits: 10, decimalPlaces: 2, min: 0, defaultValue: 0 });
  let uid;
  if (rawUid !== undefined && !v.hasErrors('patient_uid')) {
    uid = normalizeUid(rawUid);
    if (!(await Patient.exists({ uid }))) v.addError('patient_uid', `Patient with UID ${uid} not found.`);
  }
  v.throwIfErrors();

  const proposal = await ProposedTreatment.create({
    patient_uid: uid,
    procedure,
    tooth: tooth || '',
    cost,
    created_by: req.user._id,
  });
  await proposal.populate('created_by', USER_NAME);
  await audit(req, {
    action: 'plan.create',
    patient_uid: uid,
    summary: `Plan: ${procedure}${tooth ? ` (${tooth})` : ''} — ₹${Number(cost || 0).toFixed(2)}`,
  });
  res.status(201).json({ message: 'Added to treatment plan.', proposal: serializeProposal(proposal) });
}

export async function updateProposal(req, res) {
  requireClinician(req);
  const proposal = await findProposalOr404(req.params.id);
  if (proposal.status !== 'proposed') throw badRequest('Completed items cannot be edited.');

  const v = new Validator(req.body);
  const procedure = v.has('procedure') ? v.char('procedure', { minLength: 2, maxLength: 200 }) : undefined;
  const tooth = v.has('tooth')
    ? v.char('tooth', { required: false, allowBlank: true, allowNull: true, maxLength: 60 })
    : undefined;
  const cost = v.has('cost') ? v.decimal('cost', { maxDigits: 10, decimalPlaces: 2, min: 0 }) : undefined;
  v.throwIfErrors();

  const before = { procedure: proposal.procedure, tooth: proposal.tooth, cost: proposal.cost };
  if (procedure !== undefined) proposal.procedure = procedure;
  if (tooth !== undefined) proposal.tooth = tooth || '';
  if (cost !== undefined && cost !== null) proposal.cost = cost;
  await proposal.save();
  await proposal.populate('created_by', USER_NAME);
  await audit(req, {
    action: 'plan.update',
    patient_uid: proposal.patient_uid,
    summary: `Plan item changed: ${proposal.procedure} — ₹${proposal.cost.toFixed(2)}`,
    details: { before, after: { procedure: proposal.procedure, tooth: proposal.tooth, cost: proposal.cost } },
  });
  res.json({ message: 'Treatment plan updated.', proposal: serializeProposal(proposal) });
}

export async function deleteProposal(req, res) {
  requireClinician(req);
  const proposal = await findProposalOr404(req.params.id);
  proposal.deleted_at = new Date();
  proposal.deleted_by = req.user._id;
  await proposal.save();
  await audit(req, {
    action: 'plan.delete',
    patient_uid: proposal.patient_uid,
    summary: `Removed from plan: ${proposal.procedure}${proposal.tooth ? ` (${proposal.tooth})` : ''}`,
    details: snapshot(proposal),
  });
  res.json({ message: 'Removed from treatment plan.' });
}

export async function completeProposal(req, res) {
  requireClinician(req);
  const proposal = await findProposalOr404(req.params.id);
  if (proposal.status === 'done') throw badRequest('This treatment is already marked as done.');

  const v = new Validator(req.body || {});
  const treatmentDate = v.date('treatment_date', { required: false, allowNull: true });
  const cost = v.has('cost') ? v.decimal('cost', { maxDigits: 10, decimalPlaces: 2, min: 0 }) : undefined;
  v.throwIfErrors();

  const description = proposal.tooth ? `${proposal.procedure} (${proposal.tooth})` : proposal.procedure;
  const treatment = await Treatment.create({
    patient_uid: proposal.patient_uid,
    description,
    cost: cost ?? proposal.cost,
    performed_by: req.user._id,
    treatment_date: treatmentDate || today(),
  });

  proposal.status = 'done';
  proposal.treatment = treatment._id;
  proposal.completed_at = new Date();
  if (cost !== undefined && cost !== null) proposal.cost = cost;
  await proposal.save();

  await Promise.all([proposal.populate('created_by', USER_NAME), treatment.populate('performed_by', USER_NAME)]);
  await audit(req, {
    action: 'plan.done',
    patient_uid: proposal.patient_uid,
    summary: `Done: ${description} — ₹${treatment.cost.toFixed(2)} on ${treatment.treatment_date}`,
  });
  res.json({
    message: 'Marked as done and added to treatments.',
    proposal: serializeProposal(proposal),
    treatment: serializeTreatment(treatment),
  });
}

export async function undoProposal(req, res) {
  requireClinician(req);
  const proposal = await findProposalOr404(req.params.id);
  if (proposal.status !== 'done') throw badRequest('This treatment is not marked as done.');

  let removedTreatmentId = null;
  let removedSnapshot = null;
  if (proposal.treatment) {
    const removed = await Treatment.findByIdAndDelete(proposal.treatment);
    if (removed) {
      removedTreatmentId = String(removed._id);
      removedSnapshot = snapshot(removed);
    }
  }
  proposal.status = 'proposed';
  proposal.treatment = null;
  proposal.completed_at = null;
  await proposal.save();
  await proposal.populate('created_by', USER_NAME);
  await audit(req, {
    action: 'plan.undo',
    patient_uid: proposal.patient_uid,
    summary: `Marked "${proposal.procedure}" as not done (treatment entry removed, copy kept in history)`,
    details: removedSnapshot,
  });
  res.json({
    message: 'Moved back to the treatment plan.',
    proposal: serializeProposal(proposal),
    removed_treatment_id: removedTreatmentId,
  });
}
