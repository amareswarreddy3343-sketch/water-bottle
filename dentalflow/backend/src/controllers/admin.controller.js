/**
 * Admin tools: change history, backups, and the clinic's date for the app.
 *
 *   GET  /api/meta/                       { today, time_zone, server_time }      (signed in)
 *   GET  /api/history/?patient_uid=&area=&actor=&from=&to=&q=&before=&limit=   (master)
 *   GET  /api/backups/                    status + list                          (master)
 *   POST /api/backups/                    back up now                            (master)
 *   GET  /api/backups/download/:name      download one backup file               (master)
 */
import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import config from '../config/env.js';
import { AuditLog } from '../models/index.js';
import { audit } from '../utils/audit.js';
import { backupDir, backupState, isBackupFileName, listBackups, runBackup } from '../utils/backup.js';
import { localDayRange, today } from '../utils/dates.js';
import { badRequest, forbidden, notFound } from '../utils/errors.js';
import { isEmailEnabled } from '../utils/mailer.js';
import { normalizeUid } from '../utils/uid.js';
import { isValidDateString } from '../utils/validation.js';

const requireMaster = (req) => {
  if (req.user.role !== 'master') throw forbidden('Only master admin can see this.');
};

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export async function meta(req, res) {
  res.json({
    today: today(),
    time_zone: config.timeZone,
    server_time: new Date().toISOString(),
    email_enabled: isEmailEnabled(),
  });
}

const serializeEntry = (e) => ({
  id: String(e._id),
  at: e.created_at,
  actor_id: e.actor ? String(e.actor) : null,
  actor_name: e.actor_name,
  actor_role: e.actor_role,
  action: e.action,
  area: e.area,
  patient_uid: e.patient_uid,
  summary: e.summary,
  details: e.details,
});

export async function history(req, res) {
  requireMaster(req);
  const q = req.query;
  const filter = {};
  if (q.patient_uid) filter.patient_uid = normalizeUid(String(q.patient_uid));
  if (q.area) filter.area = String(q.area);
  if (q.actor && mongoose.isValidObjectId(q.actor)) filter.actor = q.actor;
  if (q.hide_logins === '1' || q.hide_logins === 'true') filter.action = { $ne: 'auth.login' };
  const from = q.from ? String(q.from) : null;
  const to = q.to ? String(q.to) : null;
  if ((from && !isValidDateString(from)) || (to && !isValidDateString(to))) {
    throw badRequest('Invalid date format. Use YYYY-MM-DD.');
  }
  if (from || to) {
    filter.created_at = {};
    if (from) filter.created_at.$gte = localDayRange(from).start;
    if (to) filter.created_at.$lt = localDayRange(to).end;
  }
  if (q.before) {
    const before = new Date(String(q.before));
    if (!Number.isNaN(before.getTime())) filter.created_at = { ...(filter.created_at || {}), $lt: before };
  }
  if (q.q) {
    const re = new RegExp(escapeRegex(String(q.q).trim()), 'i');
    filter.$or = [{ summary: re }, { actor_name: re }, { patient_uid: re }];
  }
  const limit = Math.min(Math.max(parseInt(q.limit, 10) || 50, 1), 200);
  const entries = await AuditLog.find(filter).sort({ created_at: -1, _id: -1 }).limit(limit + 1).lean();
  const more = entries.length > limit;
  const page = entries.slice(0, limit);
  res.json({
    entries: page.map(serializeEntry),
    next_before: more ? page.at(-1).created_at : null,
  });
}

export async function backupsStatus(req, res) {
  requireMaster(req);
  res.json({
    dir: backupDir(),
    custom_dir: Boolean(process.env.BACKUP_DIR),
    ...backupState(),
    files: (await listBackups()).slice(0, 30),
  });
}

export async function backupNow(req, res) {
  requireMaster(req);
  const result = await runBackup({ reason: `by ${req.user.name}` }).catch((err) => {
    throw badRequest(`Backup failed: ${err.message}`);
  });
  await audit(req, { action: 'backup.create', summary: `Backed up the database (${result.file})` });
  res.json({ message: 'Backup saved.', backup: result });
}

export async function downloadBackup(req, res) {
  requireMaster(req);
  const { name } = req.params;
  if (!isBackupFileName(name)) throw notFound('Backup not found.');
  const file = path.join(backupDir(), name);
  if (!fs.existsSync(file)) throw notFound('Backup not found.');
  await audit(req, { action: 'backup.download', summary: `Downloaded backup ${name}` });
  res.setHeader('Content-Type', 'application/gzip');
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  fs.createReadStream(file).pipe(res);
}
