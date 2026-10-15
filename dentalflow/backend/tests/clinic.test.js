/**
 * Tests for the clinic-PC release: team removal (data kept), collections permission,
 * reception-only registration and "old patient" visits, appointments that show up on
 * their day, prescriptions, crown/root colours, voided payments, file trash, change
 * history, backups and the data upgrade from earlier versions.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import mongoose from 'mongoose';
import request from 'supertest';
import { after, afterEach, before, describe, test } from 'node:test';
import { as, login, setup, teardown } from './helpers.js';

const BACKUP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'icare32-backups-'));
process.env.BACKUP_DIR = BACKUP_DIR;

let app;
let models;
let master;
let doctor;
let reception;
let dates;

before(async () => {
  ({ app, models } = await setup());
  dates = await import('../src/utils/dates.js');
  master = as(app, (await login(app, 'admin@dental.com')).access);
  doctor = as(app, (await login(app, 'doctor@dental.com')).access);
  reception = as(app, (await login(app, 'reception@dental.com')).access);
});

after(async () => {
  delete process.env.CLINIC_FAKE_TODAY;
  await teardown();
  fs.rmSync(BACKUP_DIR, { recursive: true, force: true });
});

// the real clinic date (dates.today() follows CLINIC_FAKE_TODAY)
const realToday = () => dates.localDateString(new Date());
const plusDays = (n) => dates.addDays(realToday(), n);
/** Pretend the clinic's date is another day (as on that day) */
const pretendToday = (d) => {
  process.env.CLINIC_FAKE_TODAY = d;
};
const backToToday = () => {
  delete process.env.CLINIC_FAKE_TODAY;
};

let phoneSeq = 9100000000;
async function newPatient(body = {}) {
  phoneSeq += 1;
  const res = await reception.post('/api/patients/').send({ name: 'Ravi Kumar', age: 40, gender: 'male', phone: String(phoneSeq), ...body });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.patient;
}

async function addMember(body) {
  const res = await master.post('/api/auth/admin/users/create/').send({ password: 'Doctor@123', ...body });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.user;
}

// ═══════════════════════════════════════════════════════════════════════════
describe('team: removing a member keeps everything they recorded', () => {
  let member;
  let memberClient;
  let p;

  before(async () => {
    member = await addMember({ email: 'dr.rao@dental.com', name: 'Dr. Rao', role: 'doctor' });
    memberClient = as(app, (await login(app, 'dr.rao@dental.com', 'Doctor@123')).access);
    p = await newPatient({ name: 'Team Patient' });
    let res = await memberClient.post('/api/complaints/').send({ patient_uid: p.uid, complaint_text: 'Pain upper right' });
    assert.equal(res.status, 201);
    res = await memberClient.post('/api/treatments/').send({ patient_uid: p.uid, description: 'Scaling', cost: 800 });
    assert.equal(res.status, 201);
  });

  test('only the admin can remove; not yourself', async () => {
    let res = await doctor.delete(`/api/auth/admin/users/${member.id}/`);
    assert.equal(res.status, 403);
    const me = (await master.get('/api/auth/me/')).body.user;
    res = await master.delete(`/api/auth/admin/users/${me.id}/`);
    assert.equal(res.status, 400);
    assert.match(JSON.stringify(res.body), /your own account/);
  });

  test('remove: hidden from the team, cannot sign in, data stays', async () => {
    let res = await master.delete(`/api/auth/admin/users/${member.id}/`);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.match(res.body.message, /kept/);
    assert.ok(res.body.user.removed_at);

    res = await master.get('/api/auth/admin/users/list/');
    assert.ok(!res.body.users.some((u) => u.id === member.id));
    res = await master.get('/api/auth/admin/users/list/?include_removed=1');
    assert.ok(res.body.users.find((u) => u.id === member.id).removed_at);

    // signed out everywhere, and cannot sign in again
    res = await memberClient.get('/api/auth/me/');
    assert.equal(res.status, 401);
    res = await request(app).post('/api/auth/login/').send({ email: 'dr.rao@dental.com', password: 'Doctor@123' });
    assert.equal(res.status, 401);
    assert.deepEqual(res.body.error.non_field_errors, ['This account has been removed from the clinic team.']);

    // what they recorded is still there, with their name
    res = await doctor.get(`/api/complaints/${p.uid}/`);
    assert.equal(res.body.complaints[0].created_by_name, 'Dr. Rao');
    res = await doctor.get(`/api/treatments/${p.uid}/`);
    assert.equal(res.body.treatments[0].performed_by_name, 'Dr. Rao');
    assert.ok(await models.User.exists({ _id: member.id }));
  });

  test('removed email cannot be re-added; edits are refused; restore brings them back', async () => {
    let res = await master.post('/api/auth/admin/users/create/').send({
      email: 'DR.RAO@dental.com', name: 'Dr. Rao 2', role: 'doctor', password: 'Doctor@123',
    });
    assert.equal(res.status, 400);
    assert.match(res.body.error.email[0], /Restore them/);
    res = await master.patch(`/api/auth/admin/users/${member.id}/update/`).send({ name: 'X' });
    assert.equal(res.status, 400);

    res = await master.post(`/api/auth/admin/users/${member.id}/restore/`);
    assert.equal(res.status, 200);
    assert.equal(res.body.user.removed_at, null);
    assert.equal(res.body.user.is_active, true);
    await login(app, 'dr.rao@dental.com', 'Doctor@123');
    res = await master.post(`/api/auth/admin/users/${member.id}/restore/`);
    assert.equal(res.status, 400);
  });

  test('another admin can be removed too (their records stay)', async () => {
    const other = await addMember({ email: 'admin2@dental.com', name: 'Second Admin', role: 'master' });
    const res = await master.delete(`/api/auth/admin/users/${other.id}/`);
    assert.equal(res.status, 200);
    assert.ok(await models.User.exists({ _id: other.id, removed_at: { $ne: null } }));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('collections: doctors only when the admin allows', () => {
  let drClient;
  let dr;

  before(async () => {
    dr = await addMember({ email: 'dr.money@dental.com', name: 'Dr. Money', role: 'doctor' });
    drClient = as(app, (await login(app, 'dr.money@dental.com', 'Doctor@123')).access);
    const p = await newPatient({ name: 'Paying Patient' });
    const res = await reception.post(`/api/patients/${p.uid}/payments/`).send({ paid_amount: 700, mode: 'upi' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
  });

  test('not allowed by default', async () => {
    assert.equal(dr.can_view_collections, false);
    let res = await drClient.get('/api/payments/');
    assert.equal(res.status, 403);
    res = await drClient.get('/api/patients/stats/');
    assert.equal(res.body.stats.collected_today, undefined);
    res = await drClient.get('/api/auth/me/');
    assert.equal(res.body.user.can_view_collections, false);
  });

  test('admin switches it on → report and dashboard money', async () => {
    let res = await master.patch(`/api/auth/admin/users/${dr.id}/update/`).send({ can_view_collections: true });
    assert.equal(res.body.user.can_view_collections, true);
    res = await drClient.get('/api/payments/');
    assert.equal(res.status, 200);
    assert.equal(res.body.total, '700.00');
    res = await drClient.get('/api/patients/stats/');
    assert.equal(res.body.stats.collected_today, 700);
    res = await drClient.get('/api/auth/me/');
    assert.equal(res.body.user.can_view_collections, true);

    res = await master.patch(`/api/auth/admin/users/${dr.id}/update/`).send({ can_view_collections: false });
    res = await drClient.get('/api/payments/');
    assert.equal(res.status, 403);
  });

  test('reception: sees today\'s total on the dashboard, not the report', async () => {
    let res = await reception.get('/api/payments/');
    assert.equal(res.status, 403);
    res = await reception.get('/api/patients/stats/');
    assert.equal(res.body.stats.collected_today, 700);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('registration: reception only; old patients get a visit, not a duplicate', () => {
  let p;

  test('doctors cannot register new patients', async () => {
    const res = await doctor.post('/api/patients/').send({ name: 'Should Fail', age: 30, gender: 'male' });
    assert.equal(res.status, 403);
    assert.deepEqual(res.body, { error: 'New patients are registered by reception.' });
  });

  test("a new patient is in today's visits (waiting)", async () => {
    p = await newPatient({ name: 'Meena Iyer', phone: '+91 98450 12345', reason: 'Tooth pain' });
    const res = await doctor.get('/api/visits/today/');
    assert.equal(res.status, 200);
    assert.equal(res.body.date, realToday());
    const v = res.body.visits.find((x) => x.patient.uid === p.uid);
    assert.ok(v);
    assert.equal(v.reason, 'Tooth pain');
    assert.equal(v.seen, false);
    assert.equal(v.registered_by_name, 'Reception Desk');
  });

  test('duplicate check by phone (last digits) and full name', async () => {
    let res = await reception.get('/api/patients/duplicates/?phone=9845012345');
    assert.deepEqual(res.body.matches.map((m) => m.uid), [p.uid]);
    res = await reception.get('/api/patients/duplicates/?name=meena%20IYER');
    assert.ok(res.body.matches.some((m) => m.uid === p.uid));
    res = await reception.get('/api/patients/duplicates/?phone=123&name=me');
    assert.deepEqual(res.body.matches, []);
    res = await reception.get('/api/patients/duplicates/?phone=.*');
    assert.deepEqual(res.body.matches, []);
  });

  test('old patient visit: one per day, a new one the next day', async () => {
    let res = await reception.post(`/api/patients/${p.uid}/checkin/`).send({ reason: 'Follow-up' });
    assert.equal(res.body.already, true);
    res = await reception.get(`/api/patients/${p.uid}/checkin/`);
    assert.equal(res.body.checkins.length, 1);

    pretendToday(plusDays(1));
    res = await reception.post(`/api/patients/${p.uid}/checkin/`).send({ reason: 'Follow-up' });
    assert.equal(res.body.message, 'Checked in');
    res = await reception.get(`/api/patients/${p.uid}/checkin/`);
    assert.equal(res.body.checkins.length, 2);
    assert.equal(res.body.checkins[0].visit_date, plusDays(1));
    assert.equal(res.body.checkins[0].reason, 'Follow-up');
    res = await doctor.get('/api/visits/today/');
    assert.deepEqual(res.body.visits.map((x) => x.patient.uid), [p.uid]);
    backToToday();
  });

  test('a visit becomes "seen" once the doctor writes something', async () => {
    let res = await doctor.post('/api/complaints/').send({ patient_uid: p.uid, complaint_text: 'Pain lower left' });
    assert.equal(res.status, 201);
    res = await doctor.get('/api/visits/today/');
    assert.equal(res.body.visits.find((x) => x.patient.uid === p.uid).seen, true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('appointments appear on their day', () => {
  let p;
  let q;
  let appt;
  const day = plusDaysLater(3);
  function plusDaysLater(n) {
    return () => plusDays(n);
  }

  before(async () => {
    p = await newPatient({ name: 'Anil Appointment' });
    q = await newPatient({ name: 'Bina Missed' });
  });
  afterEach(backToToday);

  test('reception cannot give appointments; validation', async () => {
    let res = await reception.post('/api/appointments/').send({ patient_uid: p.uid, date: day() });
    assert.equal(res.status, 403);
    res = await doctor.post('/api/appointments/').send({ patient_uid: p.uid, date: plusDays(-1) });
    assert.deepEqual(res.body.error.date, ['Choose today or a later date.']);
    res = await doctor.post('/api/appointments/').send({ patient_uid: p.uid, date: day(), time: '25:00' });
    assert.ok(res.body.error.time);
    res = await doctor.post('/api/appointments/').send({ patient_uid: 'ZZZZZZ', date: day() });
    assert.ok(res.body.error.patient_uid);
  });

  test('doctor books → upcoming list, patient next appointment', async () => {
    let res = await doctor.post('/api/appointments/').send({ patient_uid: p.uid, date: day(), time: '10:30', purpose: 'RCT sitting 2' });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    appt = res.body.appointment;
    assert.equal(appt.status, 'scheduled');
    assert.equal(res.body.next_appointment, day());
    res = await doctor.post('/api/appointments/').send({ patient_uid: p.uid, date: day() });
    assert.equal(res.status, 400); // one per day

    res = await reception.get(`/api/patients/${p.uid}/`);
    assert.equal(res.body.patient.next_appointment, day());
    res = await reception.get('/api/appointments/');
    assert.equal(res.body.date, realToday());
    assert.ok(!res.body.appointments.some((a) => a.id === appt.id));
    res = await reception.get('/api/appointments/upcoming/?days=7');
    const up = res.body.appointments.find((a) => a.id === appt.id);
    assert.equal(up.patient.name, 'Anil Appointment');
    assert.equal(up.time, '10:30');
  });

  test("on that day it is on reception's today list and dashboard count", async () => {
    pretendToday(day());
    let res = await reception.get('/api/appointments/');
    assert.equal(res.body.date, day());
    const a = res.body.appointments.find((x) => x.id === appt.id);
    assert.equal(a.status, 'scheduled');
    assert.equal(a.purpose, 'RCT sitting 2');
    res = await reception.get('/api/patients/stats/');
    assert.equal(res.body.stats.today, day());
    assert.equal(res.body.stats.today_appointments, 1);
    res = await reception.get('/api/patients/appointments/today/');
    assert.deepEqual(res.body.appointments.map((x) => x.uid), [p.uid]);
    res = await reception.get('/api/meta/');
    assert.equal(res.body.today, day());
  });

  test('checking in marks it arrived; the visit says it had an appointment', async () => {
    pretendToday(day());
    let res = await reception.post(`/api/patients/${p.uid}/checkin/`);
    assert.equal(res.body.appointment, true);
    res = await reception.get('/api/appointments/');
    assert.equal(res.body.appointments.find((x) => x.id === appt.id).status, 'arrived');
    res = await doctor.get('/api/visits/today/');
    assert.equal(res.body.visits.find((v) => v.patient.uid === p.uid).with_appointment, true);
    res = await reception.get(`/api/patients/${p.uid}/`);
    assert.equal(res.body.patient.next_appointment, null);
  });

  test('not coming → "missed" the next day', async () => {
    let res = await doctor.post('/api/appointments/').send({ patient_uid: q.uid, date: day() });
    const missed = res.body.appointment;
    pretendToday(plusDays(4));
    res = await reception.get(`/api/patients/${q.uid}/appointments/`);
    assert.equal(res.body.appointments.find((a) => a.id === missed.id).status, 'missed');
    res = await reception.get(`/api/patients/${p.uid}/appointments/`);
    assert.equal(res.body.appointments.find((a) => a.id === appt.id).status, 'arrived');
  });

  test('move and cancel (kept as cancelled, not deleted)', async () => {
    let res = await doctor.post('/api/appointments/').send({ patient_uid: q.uid, date: plusDays(5) });
    const a = res.body.appointment;
    res = await doctor.patch(`/api/appointments/${a.id}/`).send({ date: plusDays(6), time: '17:00' });
    assert.equal(res.body.appointment.date, plusDays(6));
    assert.equal(res.body.next_appointment, plusDays(3)); // the earlier one is still the next
    res = await reception.post(`/api/appointments/${a.id}/cancel/`);
    assert.equal(res.status, 403);
    res = await doctor.post(`/api/appointments/${a.id}/cancel/`);
    assert.equal(res.body.appointment.status, 'cancelled');
    assert.equal(res.body.next_appointment, plusDays(3));
    res = await doctor.post(`/api/appointments/${a.id}/cancel/`);
    assert.equal(res.status, 400);
    pretendToday(plusDays(6));
    res = await reception.get('/api/appointments/');
    assert.ok(!res.body.appointments.some((x) => x.id === a.id));
    assert.ok(await models.Appointment.exists({ _id: a.id, status: 'cancelled' }));
  });

  test('older single-date endpoint still works and rejects past dates', async () => {
    let res = await doctor.patch(`/api/patients/${q.uid}/appointment/`).send({ next_appointment: plusDays(-2) });
    assert.equal(res.status, 400);
    res = await doctor.patch(`/api/patients/${q.uid}/appointment/`).send({ next_appointment: plusDays(2) });
    assert.equal(res.body.next_appointment, plusDays(2));
    res = await reception.get('/api/appointments/upcoming/');
    assert.ok(res.body.appointments.some((x) => x.patient_uid === q.uid && x.date === plusDays(2)));
    res = await doctor.patch(`/api/patients/${q.uid}/appointment/`).send({ next_appointment: null });
    assert.equal(res.body.next_appointment, null);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('prescriptions (medicines with date)', () => {
  let p;
  let rx;
  before(async () => {
    p = await newPatient({ name: 'Rx Patient' });
  });

  test('doctors write them; validation', async () => {
    let res = await reception.post('/api/prescriptions/').send({ patient_uid: p.uid, items: [{ name: 'Amoxicillin' }] });
    assert.equal(res.status, 403);
    res = await doctor.post('/api/prescriptions/').send({ patient_uid: p.uid, items: [{ name: '  ' }] });
    assert.deepEqual(res.body.error.items, ['Add at least one medicine.']);
    res = await doctor.post('/api/prescriptions/').send({ patient_uid: p.uid, items: [{ name: 'X', days: 2.5 }] });
    assert.match(res.body.error.items[0], /whole number/);

    res = await doctor.post('/api/prescriptions/').send({
      patient_uid: p.uid.toLowerCase(),
      items: [
        { name: 'Amoxicillin 500mg', dose: '1 cap', frequency: '1-1-1', days: '5', timing: 'After food' },
        { name: '' },
        { name: 'Ibuprofen 400mg', frequency: 'SOS', days: '' },
      ],
      advice: 'Warm saline rinses',
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    rx = res.body.prescription;
    assert.equal(rx.date, realToday());
    assert.equal(rx.items.length, 2);
    assert.equal(rx.items[0].days, 5);
    assert.equal(rx.items[1].days, null);
    assert.equal(rx.created_by_name, 'Dr. Sharma');
  });

  test('reception can read (to print); edit and remove (kept in history)', async () => {
    let res = await reception.get(`/api/prescriptions/${p.uid}/`);
    assert.equal(res.body.prescriptions.length, 1);

    res = await doctor.patch(`/api/prescriptions/item/${rx.id}/`).send({ date: '2026-01-05', items: [{ name: 'Paracetamol 650' }] });
    assert.equal(res.status, 200);
    assert.equal(res.body.prescription.date, '2026-01-05');
    assert.equal(res.body.prescription.updated_by_name, 'Dr. Sharma');

    res = await doctor.delete(`/api/prescriptions/item/${rx.id}/`);
    assert.equal(res.status, 200);
    res = await reception.get(`/api/prescriptions/${p.uid}/`);
    assert.equal(res.body.prescriptions.length, 0);
    assert.ok(await models.Prescription.exists({ _id: rx.id, deleted_at: { $ne: null } }));
    res = await master.get(`/api/history/?patient_uid=${p.uid}&area=prescription`);
    assert.deepEqual(res.body.entries.map((e) => e.action), ['prescription.delete', 'prescription.update', 'prescription.create']);
    assert.equal(res.body.entries[0].details.items[0].name, 'Paracetamol 650');
    assert.equal(res.body.entries[1].details.before.items[0].name, 'Amoxicillin 500mg');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('tooth chart: separate crown and root colours', () => {
  let p;
  before(async () => {
    p = await newPatient({ name: 'Colour Patient' });
  });

  test('default colours say which part they are for', async () => {
    const res = await doctor.get('/api/settings/');
    const parts = Object.fromEntries(res.body.settings.tooth_statuses.map((s) => [s.id, s.part]));
    assert.equal(parts.missing, 'both');
    assert.equal(parts.caries, 'crown');
    assert.equal(parts.rct, 'root');
    assert.equal(res.body.settings.max_tooth_statuses, 10);
  });

  test('crown and root get different colours', async () => {
    let res = await doctor.post('/api/tooth/').send({ patient_uid: p.uid, tooth_id: 'LL6', crown_status: 'caries', root_status: 'rct' });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.record.crown_status, 'caries');
    assert.equal(res.body.record.root_status, 'rct');

    res = await doctor.post('/api/tooth/').send({ patient_uid: p.uid, tooth_id: 'LL6', crown_status: 'filled' });
    assert.equal(res.body.record.crown_status, 'filled');
    assert.equal(res.body.record.root_status, 'rct'); // untouched

    res = await doctor.post('/api/tooth/').send({ patient_uid: p.uid, tooth_id: 'LL6', crown_status: 'rct' });
    assert.equal(res.status, 400);
    assert.match(res.body.error.crown_status[0], /root/);
    res = await doctor.post('/api/tooth/').send({ patient_uid: p.uid, tooth_id: 'LL6', root_status: 'caries' });
    assert.equal(res.status, 400);

    res = await doctor.post('/api/tooth/').send({ patient_uid: p.uid, tooth_id: 'LL6', root_status: '' });
    assert.equal(res.body.record.root_status, '');
    assert.equal(res.body.record.crown_status, 'filled');
  });

  test('whole-tooth status ("missing") and clearing', async () => {
    let res = await doctor.post('/api/tooth/').send({ patient_uid: p.uid, tooth_id: 'UR8', status: 'missing' });
    assert.equal(res.body.record.crown_status, 'missing');
    assert.equal(res.body.record.root_status, 'missing');
    res = await doctor.post('/api/tooth/').send({ patient_uid: p.uid, tooth_id: 'UR8', status: '' });
    assert.equal(res.body.record.crown_status, '');
    assert.equal(res.body.record.root_status, '');
  });

  test('bulk: crown only keeps root colours', async () => {
    await doctor.post('/api/tooth/').send({ patient_uid: p.uid, tooth_id: 'UR1', root_status: 'rct' });
    const res = await doctor.post('/api/tooth/bulk/').send({ patient_uid: p.uid, tooth_ids: ['UR1', 'UR2'], crown_status: 'crown_cap' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const byId = Object.fromEntries(res.body.records.map((r) => [r.tooth_id, r]));
    assert.equal(byId.UR1.crown_status, 'crown_cap');
    assert.equal(byId.UR1.root_status, 'rct');
    assert.equal(byId.UR2.root_status, '');
  });

  test('admin: up to 10 colours, each for crown / root / both', async () => {
    const ten = Array.from({ length: 10 }, (_, i) => ({ label: `Colour ${i + 1}`, color: '#1188aa', part: ['both', 'crown', 'root'][i % 3] }));
    let res = await master.patch('/api/settings/').send({ tooth_statuses: ten });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.settings.tooth_statuses.length, 10);
    assert.equal(res.body.settings.tooth_statuses[2].part, 'root');
    res = await master.patch('/api/settings/').send({ tooth_statuses: [{ label: 'X', color: '#000000', part: 'gum' }] });
    assert.equal(res.status, 400);
  });

  test('removing colours writes which teeth had them to the history', async () => {
    const res = await master.get('/api/history/?area=settings');
    const entry = res.body.entries[0];
    assert.equal(entry.action, 'settings.update');
    const had = entry.details.teeth_that_had_removed_colours.filter((t) => t.patient_uid === p.uid);
    assert.ok(had.some((t) => t.tooth_id === 'LL6' && t.crown_status === 'filled'));
    assert.ok(had.some((t) => t.tooth_id === 'UR1' && t.root_status === 'rct'));
    const teeth = (await doctor.get(`/api/tooth/${p.uid}/`)).body.records;
    assert.ok(teeth.every((t) => !t.crown_status && !t.root_status));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('payments entered by mistake are voided, never erased', () => {
  let p;
  let wrong;
  before(async () => {
    p = await newPatient({ name: 'Void Patient' });
    await reception.post(`/api/patients/${p.uid}/payments/`).send({ paid_amount: 500, mode: 'cash' });
    const res = await reception.post(`/api/patients/${p.uid}/payments/`).send({ paid_amount: 300, mode: 'upi' });
    wrong = res.body.payment;
    assert.ok(wrong?.id, JSON.stringify(res.body));
  });

  test('only the admin can delete; it stops counting but is kept', async () => {
    let res = await reception.delete(`/api/patients/${p.uid}/payments/${wrong.id}/`);
    assert.equal(res.status, 403);
    res = await master.delete(`/api/patients/${p.uid}/payments/${wrong.id}/`).send({ reason: 'Typed twice' });
    assert.equal(res.status, 200);
    assert.equal(res.body.paid_amount, 500);
    res = await master.delete(`/api/patients/${p.uid}/payments/${wrong.id}/`);
    assert.equal(res.status, 404);

    res = await reception.get(`/api/patients/${p.uid}/payments/`);
    assert.equal(res.body.payments.length, 1);
    res = await reception.get(`/api/reports/receipt/${p.uid}/`);
    assert.equal(res.body.paid_total, '500.00');
    res = await master.get(`/api/payments/?from=${realToday()}&to=${realToday()}`);
    assert.ok(!res.body.payments.some((x) => x.id === wrong.id));

    const kept = await models.Payment.findById(wrong.id);
    assert.ok(kept.voided_at);
    assert.equal(kept.void_reason, 'Typed twice');
    res = await master.get(`/api/history/?patient_uid=${p.uid}&area=payment`);
    assert.equal(res.body.entries[0].action, 'payment.delete');
    assert.equal(res.body.entries[0].details.amount, 300);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('deleted files go to the trash and can be restored', () => {
  let p;
  let report;
  before(async () => {
    p = await newPatient({ name: 'File Patient' });
    const res = await reception
      .post('/api/reports/')
      .field('patient_uid', p.uid)
      .field('report_type', 'photo')
      .attach('file', Buffer.alloc(2048, 3), 'smile.jpg');
    assert.equal(res.status, 201, JSON.stringify(res.body));
    report = res.body.report;
  });

  test('delete → trash → restore', async () => {
    const { default: config } = await import('../src/config/env.js');
    const rel = decodeURIComponent(new URL(report.file_url).pathname.replace(/^\/media\//, ''));
    assert.ok(fs.existsSync(path.join(config.mediaRoot, rel)));

    let res = await master.delete(`/api/reports/delete/${report.id}/`);
    assert.equal(res.status, 200);
    assert.ok(!fs.existsSync(path.join(config.mediaRoot, rel)));
    assert.ok(fs.existsSync(path.join(config.mediaRoot, 'trash', rel)));
    res = await reception.get(`/api/reports/${p.uid}/`);
    assert.equal(res.body.reports.length, 0);

    res = await doctor.get(`/api/reports/${p.uid}/?deleted=1`);
    assert.equal(res.status, 403);
    res = await master.get(`/api/reports/${p.uid}/?deleted=1`);
    assert.equal(res.body.reports.length, 1);
    assert.ok(res.body.reports[0].deleted_at);
    assert.equal(res.body.reports[0].deleted_by_name, 'Admin User');

    res = await doctor.post(`/api/reports/${report.id}/restore/`);
    assert.equal(res.status, 403);
    res = await master.post(`/api/reports/${report.id}/restore/`);
    assert.equal(res.status, 200);
    assert.ok(fs.existsSync(path.join(config.mediaRoot, rel)));
    res = await reception.get(`/api/reports/${p.uid}/`);
    assert.equal(res.body.reports.length, 1);
    res = await request(app).get(new URL(res.body.reports[0].file_url).pathname);
    assert.equal(res.status, 200);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('change history (admin)', () => {
  test('admin only', async () => {
    for (const c of [doctor, reception]) assert.equal((await c.get('/api/history/')).status, 403);
  });

  test('records who did what, newest first, with filters and paging', async () => {
    let res = await master.get('/api/history/?limit=200');
    assert.equal(res.status, 200);
    const actions = new Set(res.body.entries.map((e) => e.action));
    for (const a of ['patient.create', 'team.remove', 'team.restore', 'appointment.create', 'visit.create', 'tooth.update', 'payment.create', 'file.delete', 'file.restore']) {
      assert.ok(actions.has(a), `missing ${a}`);
    }
    const times = res.body.entries.map((e) => new Date(e.at).getTime());
    assert.deepEqual(times, [...times].sort((a, b) => b - a));

    res = await master.get('/api/history/?hide_logins=1&limit=200');
    assert.ok(!res.body.entries.some((e) => e.action === 'auth.login'));
    res = await master.get('/api/history/?area=team');
    assert.ok(res.body.entries.every((e) => e.area === 'team'));
    res = await master.get('/api/history/?q=dr.%20rao');
    assert.ok(res.body.entries.length > 0);
    res = await master.get(`/api/history/?from=${realToday()}&to=${realToday()}&limit=1`);
    assert.equal(res.body.entries.length, 1);
    assert.ok(res.body.next_before);
    const page2 = await master.get(`/api/history/?limit=1&before=${encodeURIComponent(res.body.next_before)}`);
    assert.notEqual(page2.body.entries[0].id, res.body.entries[0].id);
    res = await master.get('/api/history/?from=2026-02-30');
    assert.equal(res.status, 400);
    res = await master.get('/api/history/?q=(((');
    assert.equal(res.status, 200);
  });

  test('entries name the person even after they are removed', async () => {
    const res = await master.get('/api/history/?q=Pain%20upper%20right');
    assert.equal(res.body.entries[0].actor_name, 'Dr. Rao');
    assert.equal(res.body.entries[0].actor_role, 'doctor');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('backups', () => {
  test('admin only', async () => {
    assert.equal((await doctor.get('/api/backups/')).status, 403);
    assert.equal((await reception.post('/api/backups/')).status, 403);
  });

  test('back up now → listed → download → readable', async () => {
    let res = await master.post('/api/backups/');
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const { file, counts } = res.body.backup;
    assert.match(file, /^icare32-backup-\d{4}-\d{2}-\d{2}_\d{4}\.jsonl\.gz$/);
    assert.ok(counts.patients > 5);
    assert.ok(!('password_resets' in counts));
    assert.ok(fs.existsSync(path.join(BACKUP_DIR, file)));
    assert.ok(fs.existsSync(path.join(BACKUP_DIR, 'media')));

    res = await master.get('/api/backups/');
    assert.equal(res.body.dir, BACKUP_DIR);
    assert.equal(res.body.files[0].name, file);
    assert.equal(res.body.last.file, file);

    res = await master.get(`/api/backups/download/${file}`).buffer(true).parse((r, cb) => {
      const chunks = [];
      r.on('data', (c) => chunks.push(c));
      r.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    assert.equal(res.status, 200);
    const first = zlib.gunzipSync(res.body).toString('utf8').split('\n')[0];
    assert.equal(JSON.parse(first).format, 'icare32-backup');

    const { readBackup } = await import('../src/utils/backup.js');
    const data = await readBackup(path.join(BACKUP_DIR, file));
    assert.equal(data.collections.patients.length, counts.patients);
    const someone = data.collections.patients[0];
    assert.ok(someone._id instanceof mongoose.Types.ObjectId);
    assert.ok(someone.created_at instanceof Date);

    // a second backup in the same minute gets its own name
    res = await master.post('/api/backups/');
    assert.notEqual(res.body.backup.file, file);
  });

  test('download refuses anything but backup files', async () => {
    for (const name of ['..%2F..%2Fpackage.json', 'icare32-backup-2026-01-01_0000.jsonl.gz', 'x.gz']) {
      const res = await master.get(`/api/backups/download/${name}`);
      assert.equal(res.status, 404, name);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('upgrading data saved by the earlier version', () => {
  test('nothing is lost: payments, colours, visits and next appointments are carried over', async () => {
    const { upgradeData } = await import('../src/utils/bootstrap.js');
    const admin = await models.User.findOne({ email: 'admin@dental.com' });
    const uid = 'OLD001';
    const created = new Date('2026-03-10T05:00:00Z');
    await models.Patient.collection.insertOne({
      uid, name: 'Old Record', age: 61, gender: 'female', phone: '', comorbidities: [], pre_problems: '',
      paid_amount: 900, manual_total_cost: null, next_appointment: plusDays(2), created_by: admin._id, created_at: created, updated_at: created,
    });
    await models.Payment.collection.insertOne({ patient_uid: uid, amount: 900, created_by: admin._id, created_at: created });
    await models.CheckIn.collection.insertOne({ patient_uid: uid, created_by: admin._id, created_at: created });
    await models.ToothRecord.collection.insertMany([
      { patient_uid: uid, tooth_id: 'UR6', notes: '{"R":"old root note"}', status: 'rct', recorded_at: created },
      { patient_uid: uid, tooth_id: 'UR7', notes: '', status: 'missing', recorded_at: created },
    ]);
    // the old settings had no crown/root part
    const settings = await models.ClinicSettings.findOne();
    const oldStatuses = [
      { id: 'missing', label: 'Missing', color: '#111111' },
      { id: 'rct', label: 'RCT', color: '#f59e0b' },
    ];
    await models.ClinicSettings.collection.updateOne({ _id: settings._id }, { $set: { tooth_statuses: oldStatuses } });

    await upgradeData();
    await upgradeData(); // safe to run on every start

    const pay = await models.Payment.findOne({ patient_uid: uid }).lean();
    assert.equal(pay.mode, 'cash');
    assert.equal(pay.amount, 900);
    const visit = await models.CheckIn.findOne({ patient_uid: uid }).lean();
    assert.equal(visit.visit_date, '2026-03-10');
    const teeth = Object.fromEntries((await models.ToothRecord.find({ patient_uid: uid }).lean()).map((t) => [t.tooth_id, t]));
    assert.equal(teeth.UR6.root_status, 'rct');
    assert.equal(teeth.UR6.crown_status, '');
    assert.equal(teeth.UR6.notes, '{"R":"old root note"}');
    assert.equal(teeth.UR7.crown_status, 'missing');
    assert.equal(teeth.UR7.root_status, 'missing');
    const parts = Object.fromEntries((await models.ClinicSettings.findOne().lean()).tooth_statuses.map((s) => [s.id, s.part]));
    assert.deepEqual(parts, { missing: 'both', rct: 'root' });
    const appts = await models.Appointment.find({ patient_uid: uid }).lean();
    assert.equal(appts.length, 1);
    assert.equal(appts[0].date, plusDays(2));

    // and it shows on that day
    pretendToday(plusDays(2));
    const res = await reception.get('/api/appointments/');
    assert.ok(res.body.appointments.some((a) => a.patient_uid === uid));
    backToToday();
  });
});
