/**
 * First-start setup: when the database has no users at all, create the Master admin
 * account with a random password (shown once in the console and saved to
 * backend/data/initial-admin-password.txt). No manual seeding needed to get started.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from '../config/env.js';
import { applyPasswordRecovery } from '../controllers/password.controller.js';
import { Appointment, CheckIn, ClinicSettings, Patient, Payment, ToothRecord, User, loadSettings } from '../models/index.js';
import { runBackup } from './backup.js';
import { localDateString } from './dates.js';

export async function ensureInitialAdmin() {
  if ((process.env.AUTO_CREATE_ADMIN ?? 'true') === 'false') return;
  if (await User.estimatedDocumentCount()) return;

  const email = (process.env.INITIAL_ADMIN_EMAIL || 'admin@dental.com').trim().toLowerCase();
  const password = process.env.INITIAL_ADMIN_PASSWORD || crypto.randomBytes(9).toString('base64url');
  await User.createUser({
    email,
    name: 'Admin User',
    role: 'master',
    password,
    can_edit_complaints: true,
    is_staff: true,
    is_superuser: true,
  });

  const file = path.join(DATA_DIR, 'initial-admin-password.txt');
  if (!process.env.INITIAL_ADMIN_PASSWORD) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `Email:    ${email}\nPassword: ${password}\n`, { mode: 0o600 });
  }
  const line = '*'.repeat(60);
  console.log(`\n${line}\n  First start — Master admin account created\n  Email:    ${email}`);
  console.log(`  Password: ${process.env.INITIAL_ADMIN_PASSWORD ? '(from INITIAL_ADMIN_PASSWORD)' : password}`);
  if (!process.env.INITIAL_ADMIN_PASSWORD) console.log(`  (also saved in ${file})`);
  console.log(`  Add doctors and receptionists in the app's Admin Panel.\n${line}\n`);
}

/**
 * Data upgrades for databases created by earlier versions. Safe to run on every start:
 * each step only touches records that still need it. If anything needs upgrading, a
 * backup is taken first.
 */
const KNOWN_STATUS_PARTS = { missing: 'both', caries: 'crown', filled: 'crown', rct: 'root' };

export async function upgradeData() {
  await loadSettings(); // creates the default comorbidity list and tooth colours
  // read the stored colours as saved (the model would fill in a default "part")
  const rawSettings = await ClinicSettings.collection.findOne({ key: 'clinic' });
  const rawStatuses = rawSettings?.tooth_statuses || [];
  const pending = {
    payments: await Payment.countDocuments({ mode: { $exists: false } }),
    statuses: rawStatuses.filter((t) => !t.part).length,
    teeth: await ToothRecord.countDocuments({ status: { $nin: ['', null] }, crown_status: { $in: ['', null] }, root_status: { $in: ['', null] } }),
    visits: await CheckIn.countDocuments({ $or: [{ visit_date: null }, { visit_date: { $exists: false } }] }),
    appointments: await Patient.countDocuments({ next_appointment: { $nin: [null, ''] } }),
  };
  const needsWork = pending.payments || pending.statuses || pending.teeth || pending.visits;
  if (needsWork && process.env.NODE_ENV !== 'test') {
    console.log('🔧 Upgrading saved data for this version — taking a backup first…');
    await runBackup({ reason: 'before upgrade' }).catch(() => {
      console.warn('⚠️  Backup before upgrade failed — continuing (nothing is deleted by the upgrade).');
    });
  }

  if (pending.payments) {
    await Payment.updateMany({ mode: { $exists: false } }, { $set: { mode: 'cash', reference: '' } });
  }
  const statuses = rawStatuses.map((t) => ({ ...t, part: t.part || KNOWN_STATUS_PARTS[t.id] || 'both' }));
  if (pending.statuses) {
    await ClinicSettings.collection.updateOne({ _id: rawSettings._id }, { $set: { tooth_statuses: statuses } });
  }
  if (pending.teeth) {
    // before, one colour covered the whole tooth: it now goes to the part that status is
    // meant for (caries → crown, RCT → root, missing → both). Nothing else changes.
    const partOf = new Map(statuses.map((t) => [t.id, t.part]));
    const old = await ToothRecord.find(
      { status: { $nin: ['', null] }, crown_status: { $in: ['', null] }, root_status: { $in: ['', null] } },
      'status',
    ).lean();
    for (const r of old) {
      const part = partOf.get(r.status) || 'both';
      await ToothRecord.updateOne(
        { _id: r._id },
        { $set: { crown_status: part === 'root' ? '' : r.status, root_status: part === 'crown' ? '' : r.status } },
      );
    }
  }
  if (pending.visits) {
    const old = await CheckIn.find({ $or: [{ visit_date: null }, { visit_date: { $exists: false } }] }, 'created_at').lean();
    for (const c of old) {
      await CheckIn.updateOne({ _id: c._id }, { $set: { visit_date: localDateString(new Date(c.created_at)) } });
    }
  }
  if (pending.appointments) {
    // patients' single "next appointment" → appointment records
    const patients = await Patient.find({ next_appointment: { $nin: [null, ''] } }, 'uid next_appointment created_by').lean();
    for (const p of patients) {
      const exists = await Appointment.exists({ patient_uid: p.uid, date: p.next_appointment });
      if (!exists) {
        await Appointment.create({ patient_uid: p.uid, date: p.next_appointment, created_by: p.created_by });
      }
    }
  }

  await applyPasswordRecovery({ loadSettings });
}
