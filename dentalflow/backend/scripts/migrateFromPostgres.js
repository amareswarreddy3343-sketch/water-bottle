/**
 * One-time data migration: old Django/PostgreSQL database  →  MongoDB.
 *
 *   npm install pg            (optional dependency, only needed for this script)
 *   npm run migrate:postgres -- --media-from ../old-backend/mediafiles
 *
 * Connection: PG_URL=postgres://user:pass@host:5432/dentalflow   or the old
 * DB_HOST / DB_PORT / DB_NAME / DB_USER / DB_PASSWORD variables from backend/.env.
 *
 * Flags:
 *   --media-from <dir>   copy uploaded report files from the old MEDIA_ROOT
 *   --drop               empty the MongoDB collections first (otherwise the script
 *                        refuses to run when the target database already has data)
 *
 * Existing passwords keep working: Django "pbkdf2_sha256" hashes are copied as-is,
 * verified on login and upgraded to bcrypt automatically.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../src/config/db.js';
import config from '../src/config/env.js';
import * as models from '../src/models/index.js';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => {
  const i = args.indexOf(name);
  return i > -1 ? args[i + 1] : undefined;
};

const num = (v) => (v === null || v === undefined ? null : Number(v));
const toDateString = (v) => {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') return v.slice(0, 10);
  return v.toISOString().slice(0, 10);
};

async function loadPg() {
  try {
    return (await import('pg')).default;
  } catch {
    throw new Error('The "pg" package is not installed. Run: npm install pg');
  }
}

async function main() {
  const pg = await loadPg();
  // Return DATE columns as plain 'YYYY-MM-DD' strings (no time-zone shifting)
  pg.types.setTypeParser(1082, (v) => v);

  const pgClient = new pg.Client(
    process.env.PG_URL
      ? { connectionString: process.env.PG_URL }
      : {
          host: process.env.DB_HOST || 'localhost',
          port: Number(process.env.DB_PORT || 5432),
          database: process.env.DB_NAME || 'dentalflow',
          user: process.env.DB_USER || 'dentalflow_user',
          password: process.env.DB_PASSWORD,
        },
  );
  await pgClient.connect();
  const q = async (sql) => (await pgClient.query(sql)).rows;

  await connectDB();
  const { User, Patient, Payment, PatientEdit, CheckIn, ChiefComplaint, ToothRecord, Treatment, PatientReport } = models;
  const all = [User, Patient, Payment, PatientEdit, CheckIn, ChiefComplaint, ToothRecord, Treatment, PatientReport];

  const existing = await Patient.estimatedDocumentCount() + await User.estimatedDocumentCount();
  if (existing > 0 && !flag('--drop')) {
    throw new Error('Target MongoDB database is not empty. Re-run with --drop to replace its contents.');
  }
  if (flag('--drop')) {
    for (const M of all) await M.collection.deleteMany({});
  }

  const counts = {};
  const insert = async (Model, docs) => {
    if (docs.length) await Model.collection.insertMany(docs, { ordered: true });
    counts[Model.collection.collectionName] = docs.length;
  };

  // ── users ──
  const userIds = new Map();
  const users = (await q('SELECT * FROM users ORDER BY id')).map((u) => {
    const _id = new mongoose.Types.ObjectId();
    userIds.set(u.id, _id);
    return {
      _id,
      email: String(u.email).trim().toLowerCase(),
      name: u.name,
      role: u.role,
      password: u.password, // Django hash — upgraded to bcrypt on first login
      can_edit_complaints: u.can_edit_complaints,
      is_active: u.is_active,
      is_staff: u.is_staff,
      is_superuser: u.is_superuser,
      last_login: u.last_login,
      created_at: u.created_at,
      updated_at: u.created_at,
    };
  });
  await insert(User, users);
  const uref = (id) => (id === null || id === undefined ? null : userIds.get(id) ?? null);

  // ── patients ──
  await insert(Patient, (await q('SELECT * FROM patients')).map((p) => ({
    uid: p.uid,
    name: p.name,
    age: p.age,
    gender: p.gender,
    phone: p.phone ?? '',
    pre_problems: p.pre_problems ?? '',
    paid_amount: num(p.paid_amount) ?? 0,
    manual_total: num(p.manual_total),
    next_appointment: toDateString(p.next_appointment),
    created_by: uref(p.created_by_id),
    created_at: p.created_at,
    updated_at: p.updated_at,
  })));

  // ── payments / edits / check-ins ──
  await insert(Payment, (await q('SELECT * FROM patient_payments')).map((r) => ({
    patient_uid: r.patient_id, amount: num(r.amount), created_by: uref(r.created_by_id), created_at: r.created_at,
  })));
  await insert(PatientEdit, (await q('SELECT * FROM patient_edits')).map((r) => {
    let changes;
    try { changes = JSON.parse(r.changes); } catch { changes = { raw: r.changes }; }
    return { patient_uid: r.patient_id, changes, created_by: uref(r.created_by_id), created_at: r.created_at };
  }));
  await insert(CheckIn, (await q('SELECT * FROM patient_checkins')).map((r) => ({
    patient_uid: r.patient_id, created_by: uref(r.created_by_id), created_at: r.created_at,
  })));

  // ── clinical records ──
  await insert(ChiefComplaint, (await q('SELECT * FROM chief_complaints')).map((r) => ({
    patient_uid: r.patient_uid,
    complaint_text: r.complaint_text,
    created_by: uref(r.created_by_id),
    last_edited_by: uref(r.last_edited_by_id),
    created_at: r.created_at,
    updated_at: r.updated_at,
  })));
  await insert(ToothRecord, (await q('SELECT * FROM tooth_records')).map((r) => ({
    patient_uid: r.patient_uid, tooth_id: r.tooth_id, notes: r.notes ?? '', edited_by: uref(r.edited_by_id), recorded_at: r.recorded_at,
  })));

  const treatmentIds = new Map();
  await insert(Treatment, (await q('SELECT * FROM treatments')).map((r) => {
    const _id = new mongoose.Types.ObjectId();
    treatmentIds.set(r.id, _id);
    return {
      _id,
      patient_uid: r.patient_uid,
      description: r.description,
      cost: num(r.cost) ?? 0,
      performed_by: uref(r.performed_by_id),
      treatment_date: toDateString(r.treatment_date),
      created_at: r.created_at,
    };
  }));

  await insert(PatientReport, (await q('SELECT * FROM patient_reports')).map((r) => ({
    patient_uid: r.patient_uid,
    uploaded_by: uref(r.uploaded_by_id),
    treatment: r.treatment_id ? treatmentIds.get(r.treatment_id) ?? null : null,
    report_type: r.report_type,
    description: r.description ?? '',
    file: String(r.file).replace(/\\/g, '/'),
    file_size_kb: r.file_size_kb ?? 0,
    uploaded_at: r.uploaded_at,
  })));

  // Indexes (unique constraints etc.)
  for (const M of all) await M.createIndexes().catch((e) => console.warn(`  ⚠️  ${M.modelName} indexes: ${e.message}`));

  // ── uploaded files ──
  const mediaFrom = option('--media-from');
  if (mediaFrom) {
    const src = path.resolve(mediaFrom);
    await fs.mkdir(config.mediaRoot, { recursive: true });
    await fs.cp(src, config.mediaRoot, { recursive: true, force: false, errorOnExist: false });
    console.log(`📁 Copied media files from ${src} → ${config.mediaRoot}`);
  } else {
    console.log('ℹ️  No --media-from given: copy the old backend/mediafiles folder into the new MEDIA_ROOT manually.');
  }

  await pgClient.end();
  console.log('\n✅ Migration complete:');
  for (const [name, n] of Object.entries(counts)) console.log(`   ${name.padEnd(18)} ${n}`);
}

main()
  .catch((err) => {
    console.error(`❌ Migration failed: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => disconnectDB());
