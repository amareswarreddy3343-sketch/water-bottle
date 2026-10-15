/**
 * API routes — same URLs as the original Django project (trailing slash optional).
 *
 *   /api/health/       /api/auth/...      /api/patients/...
 *   /api/complaints/   /api/tooth/...     /api/treatments/...   /api/reports/...
 *   /api/proposals/... (treatment plan)   /api/payments/ (collections)   /api/settings/
 */
import express from 'express';
import rateLimit from 'express-rate-limit';
import config from '../config/env.js';
import * as admin from '../controllers/admin.controller.js';
import * as appointments from '../controllers/appointments.controller.js';
import * as auth from '../controllers/auth.controller.js';
import * as prescriptions from '../controllers/prescriptions.controller.js';
import * as clinical from '../controllers/clinical.controller.js';
import * as password from '../controllers/password.controller.js';
import * as patients from '../controllers/patients.controller.js';
import * as proposals from '../controllers/proposals.controller.js';
import * as reports from '../controllers/reports.controller.js';
import * as settings from '../controllers/settings.controller.js';
import { authenticate } from '../middleware/auth.js';
import { methodNotAllowed } from '../middleware/errorHandler.js';
import { reportUpload } from '../middleware/upload.js';

// Case-sensitive so e.g. /patients/SEARCH/ (a valid UID) is not confused with /patients/search/
const newRouter = () => express.Router({ caseSensitive: true, mergeParams: true });

// ── /api/auth ──────────────────────────────────────────────────────────────
const authRouter = newRouter();

const loginLimiter = rateLimit({
  windowMs: config.loginRateLimit.windowMs,
  limit: config.loginRateLimit.max,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => config.isTest,
  message: { error: 'Too many login attempts. Please try again later.' },
});

authRouter.route('/login').post(loginLimiter, auth.login).all(methodNotAllowed);

// Passwords: forgot / reset link / change / admin reset
const resetLimiter = (max) =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: () => config.isTest,
    message: { error: 'Too many attempts. Please wait a few minutes and try again.' },
  });
authRouter.route('/password/options').get(password.options).all(methodNotAllowed);
authRouter.route('/password/forgot').post(resetLimiter(5), password.forgot).all(methodNotAllowed);
authRouter.route('/password/reset/check').post(resetLimiter(30), password.checkResetLink).all(methodNotAllowed);
authRouter.route('/password/reset').post(resetLimiter(20), password.resetWithLink).all(methodNotAllowed);
authRouter.route('/password/change').post(authenticate, password.changeOwnPassword).all(methodNotAllowed);
authRouter.route('/refresh').post(auth.refreshToken).all(methodNotAllowed);
authRouter.route('/me').get(authenticate, auth.me).all(methodNotAllowed);
authRouter.route('/logout').post(authenticate, auth.logout).all(methodNotAllowed);

authRouter.route('/admin/users/create').post(authenticate, auth.createUser).all(methodNotAllowed);
authRouter.route('/admin/users/list').get(authenticate, auth.listUsers).all(methodNotAllowed);
authRouter.route('/admin/users/:userId').get(authenticate, auth.getUser).delete(authenticate, auth.removeUser).all(methodNotAllowed);
authRouter.route('/admin/users/:userId/restore').post(authenticate, auth.restoreUser).all(methodNotAllowed);
authRouter.route('/admin/users/:userId/update').patch(authenticate, auth.updateUser).all(methodNotAllowed);
authRouter
  .route('/admin/users/:userId/reset-password')
  .post(authenticate, password.adminReset)
  .all(methodNotAllowed);
authRouter
  .route('/admin/users/:userId/toggle-complaint-access')
  .patch(authenticate, auth.toggleComplaintAccess)
  .all(methodNotAllowed);

// ── /api/patients ──────────────────────────────────────────────────────────
const patientsRouter = newRouter();
patientsRouter.use(authenticate);

// Fixed paths first (before /:uid)
patientsRouter.route('/search').get(patients.searchPatients).all(methodNotAllowed);
patientsRouter.route('/duplicates').get(patients.findDuplicates).all(methodNotAllowed);
patientsRouter.route('/stats').get(patients.dashboardStats).all(methodNotAllowed);
patientsRouter.route('/appointments/today').get(patients.todayAppointments).all(methodNotAllowed);
patientsRouter.route('/').post(patients.createPatient).all(methodNotAllowed);
patientsRouter.route('/:uid/problems').patch(patients.updateProblems).all(methodNotAllowed);
patientsRouter.route('/:uid/payment').patch(patients.addPayment).all(methodNotAllowed);
patientsRouter.route('/:uid/payments').get(patients.listPayments).post(patients.addPayment).all(methodNotAllowed);
patientsRouter.route('/:uid/payments/:paymentId').delete(patients.deletePayment).all(methodNotAllowed);
patientsRouter.route('/:uid/total').patch(patients.updateManualTotal).all(methodNotAllowed);
patientsRouter.route('/:uid/edit').patch(patients.editPatient).all(methodNotAllowed);
patientsRouter.route('/:uid/edits').get(patients.listEdits).all(methodNotAllowed);
patientsRouter.route('/:uid/checkin').get(patients.listCheckIns).post(patients.createCheckIn).all(methodNotAllowed);
patientsRouter.route('/:uid/appointment').patch(patients.setAppointment).all(methodNotAllowed);
patientsRouter.route('/:uid/appointments').get(appointments.listForPatient).all(methodNotAllowed);
patientsRouter.route('/:uid').get(patients.getPatient).all(methodNotAllowed);

// ── /api/complaints ────────────────────────────────────────────────────────
const complaintsRouter = newRouter();
complaintsRouter.use(authenticate);
complaintsRouter.route('/').post(clinical.createComplaint).all(methodNotAllowed);
complaintsRouter.route('/:uid').get(clinical.listComplaints).all(methodNotAllowed);

// ── /api/tooth ─────────────────────────────────────────────────────────────
const toothRouter = newRouter();
toothRouter.use(authenticate);
toothRouter.route('/').post(clinical.saveToothRecord).all(methodNotAllowed);
toothRouter.route('/bulk').post(clinical.bulkUpdateTeeth).all(methodNotAllowed);
toothRouter.route('/:uid').get(clinical.listToothRecords).all(methodNotAllowed);
toothRouter
  .route('/:uid/:toothId')
  .get(clinical.getToothRecord)
  .delete(clinical.deleteToothRecord)
  .all(methodNotAllowed);

// ── /api/treatments ────────────────────────────────────────────────────────
const treatmentsRouter = newRouter();
treatmentsRouter.use(authenticate);
treatmentsRouter.route('/').post(clinical.createTreatment).all(methodNotAllowed);
treatmentsRouter.route('/:uid').get(clinical.listTreatments).all(methodNotAllowed);

// ── /api/reports ───────────────────────────────────────────────────────────
const reportsRouter = newRouter();
reportsRouter.use(authenticate);
reportsRouter.route('/').post(reportUpload.single('file'), reports.createReport).all(methodNotAllowed);
reportsRouter.route('/receipt/:uid').get(reports.receipt).all(methodNotAllowed);
reportsRouter.route('/delete/:id').delete(reports.deleteReport).all(methodNotAllowed);
reportsRouter.route('/:id/restore').post(reports.restoreReport).all(methodNotAllowed);
reportsRouter.route('/:uid').get(reports.listReports).all(methodNotAllowed);

// ── /api/proposals (treatment plan / quotation) ────────────────────────────
const proposalsRouter = newRouter();
proposalsRouter.use(authenticate);
proposalsRouter.route('/').post(proposals.createProposal).all(methodNotAllowed);
proposalsRouter.route('/item/:id/done').post(proposals.completeProposal).all(methodNotAllowed);
proposalsRouter.route('/item/:id/undo').post(proposals.undoProposal).all(methodNotAllowed);
proposalsRouter
  .route('/item/:id')
  .patch(proposals.updateProposal)
  .delete(proposals.deleteProposal)
  .all(methodNotAllowed);
proposalsRouter.route('/:uid').get(proposals.listProposals).all(methodNotAllowed);

// ── /api/payments (collections report) ─────────────────────────────────────
const paymentsRouter = newRouter();
paymentsRouter.use(authenticate);
paymentsRouter.route('/').get(patients.paymentsReport).all(methodNotAllowed);

// ── /api/settings ──────────────────────────────────────────────────────────
const settingsRouter = newRouter();
settingsRouter.use(authenticate);
settingsRouter.route('/').get(settings.getSettings).patch(settings.updateSettings).all(methodNotAllowed);

// ── /api/appointments, /api/visits ─────────────────────────────────────────
const appointmentsRouter = newRouter();
appointmentsRouter.use(authenticate);
appointmentsRouter.route('/').get(appointments.listForDay).post(appointments.create).all(methodNotAllowed);
appointmentsRouter.route('/upcoming').get(appointments.upcoming).all(methodNotAllowed);
appointmentsRouter.route('/:id/cancel').post(appointments.cancel).all(methodNotAllowed);
appointmentsRouter.route('/:id').patch(appointments.update).all(methodNotAllowed);

const visitsRouter = newRouter();
visitsRouter.use(authenticate);
visitsRouter.route('/today').get(patients.todayVisits).all(methodNotAllowed);

// ── /api/prescriptions ─────────────────────────────────────────────────────
const prescriptionsRouter = newRouter();
prescriptionsRouter.use(authenticate);
prescriptionsRouter.route('/').post(prescriptions.create).all(methodNotAllowed);
prescriptionsRouter.route('/item/:id').patch(prescriptions.update).delete(prescriptions.remove).all(methodNotAllowed);
prescriptionsRouter.route('/:uid').get(prescriptions.listForPatient).all(methodNotAllowed);

// ── admin tools ────────────────────────────────────────────────────────────
const historyRouter = newRouter();
historyRouter.use(authenticate);
historyRouter.route('/').get(admin.history).all(methodNotAllowed);

const backupsRouter = newRouter();
backupsRouter.use(authenticate);
backupsRouter.route('/').get(admin.backupsStatus).post(admin.backupNow).all(methodNotAllowed);
backupsRouter.route('/download/:name').get(admin.downloadBackup).all(methodNotAllowed);

// ── /api ───────────────────────────────────────────────────────────────────
const apiRouter = newRouter();

apiRouter
  .route('/health')
  .get((req, res) => res.json({ status: 'ok', service: 'DentalFlow API' }))
  .all(methodNotAllowed);

apiRouter.use('/auth', authRouter);
apiRouter.use('/patients', patientsRouter);
apiRouter.use('/complaints', complaintsRouter);
apiRouter.use('/tooth', toothRouter);
apiRouter.use('/treatments', treatmentsRouter);
apiRouter.use('/reports', reportsRouter);
apiRouter.use('/proposals', proposalsRouter);
apiRouter.use('/payments', paymentsRouter);
apiRouter.use('/settings', settingsRouter);
apiRouter.use('/appointments', appointmentsRouter);
apiRouter.use('/visits', visitsRouter);
apiRouter.use('/prescriptions', prescriptionsRouter);
apiRouter.use('/history', historyRouter);
apiRouter.use('/backups', backupsRouter);
apiRouter.route('/meta').get(authenticate, admin.meta).all(methodNotAllowed);

export default apiRouter;
