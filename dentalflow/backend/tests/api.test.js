/**
 * End-to-end API tests (node:test + supertest).
 * Run with `npm test` — uses a temporary in-memory MongoDB, or MONGODB_URI_TEST if set.
 */
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import request from 'supertest';
import { as, login, setup, teardown } from './helpers.js';

let app;
let models;
let master;
let doctor;
let reception;
let tokens = {};

const todayLocal = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(),
  );

before(async () => {
  ({ app, models } = await setup());
  tokens.master = await login(app, 'admin@dental.com');
  tokens.doctor = await login(app, 'doctor@dental.com');
  tokens.reception = await login(app, 'reception@dental.com');
  master = as(app, tokens.master.access);
  doctor = as(app, tokens.doctor.access);
  reception = as(app, tokens.reception.access);
});

after(teardown);

async function createPatient(client = reception, body = {}) {
  const res = await client.post('/api/patients/').send({ name: 'Ravi Kumar', age: 34, gender: 'male', phone: '9876543210', ...body });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.patient;
}

// ═══════════════════════════════════════════════════════════════════════════
describe('health & routing', () => {
  test('GET /api/health/ is public', async () => {
    const res = await request(app).get('/api/health/');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { status: 'ok', service: 'DentalFlow API' });
  });

  test('trailing slash is optional', async () => {
    const res = await request(app).get('/api/health');
    assert.equal(res.status, 200);
  });

  test('unknown routes return 404 JSON', async () => {
    const res = await request(app).get('/api/does-not-exist/');
    assert.equal(res.status, 404);
    assert.deepEqual(res.body, { detail: 'Not found.' });
  });

  test('wrong method returns 405', async () => {
    const res = await request(app).get('/api/auth/login/');
    assert.equal(res.status, 405);
    assert.match(res.body.detail, /Method "GET" not allowed/);
  });

  test('malformed JSON returns 400', async () => {
    const res = await request(app).post('/api/auth/login/').set('Content-Type', 'application/json').send('{bad');
    assert.equal(res.status, 400);
    assert.match(res.body.detail, /JSON parse error/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('auth', () => {
  test('login returns tokens + user profile', async () => {
    const res = await request(app).post('/api/auth/login/').send({ email: '  ADMIN@dental.com ', password: 'Admin@123' });
    assert.equal(res.status, 200);
    assert.ok(res.body.tokens.access && res.body.tokens.refresh);
    assert.deepEqual(Object.keys(res.body.user).sort(), ['can_edit_complaints', 'can_view_collections', 'email', 'id', 'must_change_password', 'name', 'role']);
    assert.equal(res.body.user.can_view_collections, true); // master always sees collections
    assert.equal(res.body.user.must_change_password, false);
    assert.equal(res.body.user.role, 'master');
  });

  test('wrong password → 401 non_field_errors', async () => {
    const res = await request(app).post('/api/auth/login/').send({ email: 'admin@dental.com', password: 'nope' });
    assert.equal(res.status, 401);
    assert.deepEqual(res.body, { error: { non_field_errors: ['Invalid email or password.'] } });
  });

  test('missing / invalid fields → 401 field errors', async () => {
    let res = await request(app).post('/api/auth/login/').send({});
    assert.equal(res.status, 401);
    assert.deepEqual(res.body.error.email, ['This field is required.']);
    assert.deepEqual(res.body.error.password, ['This field is required.']);
    res = await request(app).post('/api/auth/login/').send({ email: 'not-an-email', password: 'x' });
    assert.deepEqual(res.body.error.email, ['Enter a valid email address.']);
  });

  test('me returns the current user', async () => {
    const res = await doctor.get('/api/auth/me/');
    assert.equal(res.status, 200);
    assert.equal(res.body.user.email, 'doctor@dental.com');
  });

  test('no / bad token → 401 detail', async () => {
    let res = await request(app).get('/api/auth/me/');
    assert.equal(res.status, 401);
    assert.equal(res.body.detail, 'Authentication credentials were not provided.');
    res = await request(app).get('/api/auth/me/').set('Authorization', 'Bearer garbage');
    assert.equal(res.status, 401);
    assert.equal(res.body.code, 'token_not_valid');
    // a refresh token cannot be used as an access token
    res = await request(app).get('/api/auth/me/').set('Authorization', `Bearer ${tokens.master.refresh}`);
    assert.equal(res.status, 401);
  });

  test('refresh issues a new access (and rotated refresh) token', async () => {
    const res = await request(app).post('/api/auth/refresh/').send({ refresh: tokens.doctor.refresh });
    assert.equal(res.status, 200);
    assert.ok(res.body.access);
    assert.ok(res.body.refresh);
    const me = await as(app, res.body.access).get('/api/auth/me/');
    assert.equal(me.status, 200);
  });

  test('refresh with invalid token → 401', async () => {
    const res = await request(app).post('/api/auth/refresh/').send({ refresh: 'nope' });
    assert.equal(res.status, 401);
    assert.equal(res.body.code, 'token_not_valid');
  });

  test('logout blacklists the refresh token', async () => {
    const t = await login(app, 'reception@dental.com');
    let res = await as(app, t.access).post('/api/auth/logout/').send({});
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { error: 'Refresh token required.' });
    res = await as(app, t.access).post('/api/auth/logout/').send({ refresh: 'bad' });
    assert.deepEqual(res.body, { error: 'Invalid token.' });
    res = await as(app, t.access).post('/api/auth/logout/').send({ refresh: t.refresh });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { message: 'Logged out successfully.' });
    res = await request(app).post('/api/auth/refresh/').send({ refresh: t.refresh });
    assert.equal(res.status, 401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('admin user management', () => {
  let newUserId;

  test('only master can manage users', async () => {
    let res = await doctor.get('/api/auth/admin/users/list/');
    assert.equal(res.status, 403);
    assert.deepEqual(res.body, { error: 'Only Master can view users.' });
    res = await reception.post('/api/auth/admin/users/create/').send({});
    assert.deepEqual(res.body, { error: 'Only Master can create users.' });
  });

  test('create validates fields', async () => {
    const res = await master.post('/api/auth/admin/users/create/').send({
      email: 'admin@dental.com',
      name: 'A',
      role: 'boss',
      password: '123',
    });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body.error.email, ['User with this email already exists.']);
    assert.deepEqual(res.body.error.name, ['Name must be at least 2 characters.']);
    assert.deepEqual(res.body.error.role, ["Invalid role. Must be one of: ['master', 'receptionist', 'doctor']"]);
    assert.deepEqual(res.body.error.password, ['Ensure this field has at least 6 characters.']);
  });

  test('create → list → detail', async () => {
    let res = await master.post('/api/auth/admin/users/create/').send({
      email: 'Priya@Dental.com',
      name: '  Dr. Priya ',
      role: 'doctor',
      password: 'secret1',
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.message, 'User created successfully.');
    assert.equal(res.body.user.email, 'priya@dental.com');
    assert.equal(res.body.user.name, 'Dr. Priya');
    assert.equal(res.body.user.is_active, true);
    assert.equal(res.body.user.can_edit_complaints, false);
    newUserId = res.body.user.id;

    res = await master.get('/api/auth/admin/users/list/');
    assert.equal(res.status, 200);
    assert.equal(res.body.total, 4);
    assert.equal(res.body.users[0].id, newUserId); // newest first

    res = await master.get(`/api/auth/admin/users/${newUserId}/`);
    assert.equal(res.body.user.email, 'priya@dental.com');

    res = await master.get('/api/auth/admin/users/123/');
    assert.equal(res.status, 404);
    assert.deepEqual(res.body, { error: 'User not found.' });

    // new user can log in
    await login(app, 'priya@dental.com', 'secret1');
  });

  test('toggle complaint access (doctors only)', async () => {
    let res = await master.patch(`/api/auth/admin/users/${newUserId}/toggle-complaint-access/`);
    assert.equal(res.status, 200);
    assert.equal(res.body.user.can_edit_complaints, true);
    res = await master.patch(`/api/auth/admin/users/${newUserId}/toggle-complaint-access/`).send({ can_edit_complaints: false });
    assert.equal(res.body.user.can_edit_complaints, false);

    const admin = (await master.get('/api/auth/me/')).body.user;
    res = await master.patch(`/api/auth/admin/users/${admin.id}/toggle-complaint-access/`);
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { error: 'Complaint access applies only to doctors.' });
  });

  test('update + deactivate; inactive users are locked out', async () => {
    const t = await login(app, 'priya@dental.com', 'secret1');
    let res = await master.patch(`/api/auth/admin/users/${newUserId}/update/`).send({ name: 'Dr. Priya S', role: 'nurse' });
    assert.equal(res.status, 400);
    assert.ok(res.body.error.role);

    res = await master.patch(`/api/auth/admin/users/${newUserId}/update/`).send({ name: 'Dr. Priya S', is_active: false });
    assert.equal(res.status, 200);
    assert.equal(res.body.user.name, 'Dr. Priya S');
    assert.equal(res.body.user.is_active, false);

    res = await as(app, t.access).get('/api/auth/me/');
    assert.equal(res.status, 401);
    assert.equal(res.body.code, 'user_inactive');

    res = await request(app).post('/api/auth/login/').send({ email: 'priya@dental.com', password: 'secret1' });
    assert.equal(res.status, 401);
    assert.deepEqual(res.body.error.non_field_errors, ['This account has been deactivated.']);
  });

  test('cannot deactivate or demote the last master', async () => {
    const admin = (await master.get('/api/auth/me/')).body.user;
    let res = await master.patch(`/api/auth/admin/users/${admin.id}/update/`).send({ is_active: false });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { error: 'Cannot deactivate the last Master user.' });
    res = await master.patch(`/api/auth/admin/users/${admin.id}/update/`).send({ role: 'doctor' });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { error: 'Cannot change the role of the last Master user.' });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('patients', () => {
  let p;

  test('register validates input', async () => {
    const res = await reception.post('/api/patients/').send({ name: '', age: 'abc', gender: 'x' });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body.error.name, ['This field may not be blank.']);
    assert.deepEqual(res.body.error.age, ['A valid integer is required.']);
    assert.deepEqual(res.body.error.gender, ['"x" is not a valid choice.']);
  });

  test('register creates a patient with a 6-char UID', async () => {
    p = await createPatient();
    assert.match(p.uid, /^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{6}$/);
    assert.equal(p.paid_amount, '0.00');
    assert.equal(p.manual_total, null);
    assert.equal(p.next_appointment, null);
    assert.equal(p.pre_problems, '');
    assert.deepEqual(p.comorbidities, []);
    assert.equal(p.created_by_name, 'Reception Desk');
    assert.deepEqual(Object.keys(p).sort(), [
      'age', 'comorbidities', 'created_at', 'created_by', 'created_by_name', 'gender', 'manual_total',
      'name', 'next_appointment', 'paid_amount', 'phone', 'pre_problems', 'uid',
    ]);
  });

  test('phone is optional (no server error)', async () => {
    const res = await reception.post('/api/patients/').send({ name: 'No Phone', age: 5, gender: 'female' });
    assert.equal(res.status, 201);
    assert.equal(res.body.patient.phone, '');
  });

  test('detail by UID (case / space insensitive) and 404', async () => {
    let res = await doctor.get(`/api/patients/ ${p.uid.toLowerCase()} /`);
    assert.equal(res.status, 200);
    assert.equal(res.body.patient.uid, p.uid);
    res = await doctor.get('/api/patients/ZZZZZZ/');
    assert.equal(res.status, 404);
    assert.deepEqual(res.body, { error: 'Patient ZZZZZZ not found' });
  });

  test('search by uid / name / phone, empty search lists all newest first', async () => {
    await createPatient(reception, { name: 'Anita (Sharma)', phone: '9000011111', gender: 'female' });
    let res = await reception.get('/api/patients/search/?search=ravi');
    assert.equal(res.status, 200);
    assert.ok(res.body.results.some((x) => x.uid === p.uid));
    res = await reception.get(`/api/patients/search/?search=${p.uid.slice(0, 4).toLowerCase()}`);
    assert.ok(res.body.results.some((x) => x.uid === p.uid));
    res = await reception.get('/api/patients/search/?search=90000');
    assert.equal(res.body.results[0].name, 'Anita (Sharma)');
    res = await reception.get(`/api/patients/search/?search=${encodeURIComponent('(Sharma')}`);
    assert.equal(res.body.results.length, 1);
    res = await reception.get('/api/patients/search/?search=');
    assert.equal(res.body.results.length, 3);
    assert.equal(res.body.results[0].name, 'Anita (Sharma)');
  });

  test('UID "SEARCH" is not confused with /search/ (case-sensitive routes)', async () => {
    await models.Patient.create({ uid: 'SEARCH', name: 'Edge Case', age: 1, gender: 'other', created_by: (await models.User.findOne())._id });
    const res = await reception.get('/api/patients/SEARCH/');
    assert.equal(res.status, 200);
    assert.equal(res.body.patient.name, 'Edge Case');
    await models.Patient.deleteOne({ uid: 'SEARCH' });
  });

  test('pre-existing problems (receptionist forbidden)', async () => {
    let res = await reception.patch(`/api/patients/${p.uid}/problems/`).send({ pre_problems: 'x' });
    assert.equal(res.status, 403);
    assert.deepEqual(res.body, { error: 'Receptionists cannot edit medical problems.' });
    res = await doctor.patch(`/api/patients/${p.uid}/problems/`).send({ pre_problems: '  Diabetic  ' });
    assert.deepEqual(res.body, { message: 'Updated.', pre_problems: 'Diabetic' });
  });

  test('payments: validation, incremental totals, history', async () => {
    let res = await reception.patch(`/api/patients/${p.uid}/payment/`).send({ paid_amount: 'abc' });
    assert.deepEqual(res.body, { error: 'Invalid amount.' });
    res = await reception.patch(`/api/patients/${p.uid}/payment/`).send({ paid_amount: 0 });
    assert.deepEqual(res.body, { error: 'Paid amount must be greater than zero.' });

    res = await reception.patch(`/api/patients/${p.uid}/payment/`).send({ paid_amount: 500 });
    assert.equal(res.status, 200);
    const { payment, ...rest } = res.body;
    assert.deepEqual(rest, { message: 'Payment recorded.', paid_amount: 500, total_cost: 0, pending_amount: -500 });
    assert.equal(payment.amount, '500.00');
    assert.equal(payment.mode, 'cash'); // default when no mode is sent (older clients)

    res = await reception.post(`/api/patients/${p.uid}/payments/`).send({ paid_amount: '250.5' });
    assert.equal(res.body.paid_amount, 750.5);

    res = await reception.get(`/api/patients/${p.uid}/payments/`);
    assert.equal(res.body.payments.length, 2);
    assert.equal(res.body.payments[0].amount, '250.50');
    assert.equal(res.body.payments[0].created_by_name, 'Reception Desk');

    res = await reception.get(`/api/patients/${p.uid}/`);
    assert.equal(res.body.patient.paid_amount, '750.50');
  });

  test('manual total override (master only)', async () => {
    let res = await doctor.patch(`/api/patients/${p.uid}/total/`).send({ manual_total: 100 });
    assert.equal(res.status, 403);
    assert.deepEqual(res.body, { error: 'Only master admin can edit total.' });
    res = await master.patch(`/api/patients/${p.uid}/total/`).send({ manual_total: -1 });
    assert.deepEqual(res.body, { error: 'Total cannot be negative.' });
    res = await master.patch(`/api/patients/${p.uid}/total/`).send({ manual_total: 2000 });
    assert.deepEqual(res.body, { message: 'Manual total updated.', manual_total: 2000 });
    res = await reception.patch(`/api/patients/${p.uid}/payment/`).send({ paid_amount: 250 });
    assert.equal(res.body.total_cost, 2000);
    assert.equal(res.body.pending_amount, 999.5); // 2000 - (750.50 + 250)
    res = await reception.get(`/api/patients/${p.uid}/`);
    assert.equal(res.body.patient.manual_total, '2000.00');
    res = await master.patch(`/api/patients/${p.uid}/total/`).send({ manual_total: '' });
    assert.equal(res.body.manual_total, null);
  });

  test('edit basic details records history', async () => {
    let res = await reception.patch(`/api/patients/${p.uid}/edit/`).send({ name: 'Ravi Kumar', age: 34 });
    assert.deepEqual(res.body, { message: 'No changes detected.' });
    res = await reception.patch(`/api/patients/${p.uid}/edit/`).send({ age: 'x' });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { error: 'Invalid age' });
    res = await reception.patch(`/api/patients/${p.uid}/edit/`).send({ name: 'Ravi K', age: 35, phone: '9876543210' });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, {
      message: 'Patient updated.',
      changes: { name: { old: 'Ravi Kumar', new: 'Ravi K' }, age: { old: 34, new: 35 } },
    });
    res = await reception.get(`/api/patients/${p.uid}/edits/`);
    assert.equal(res.body.edits.length, 1);
    assert.deepEqual(res.body.edits[0].changes.age, { old: 34, new: 35 });
    assert.equal(res.body.edits[0].created_by_name, 'Reception Desk (receptionist)');
  });

  test('check-ins', async () => {
    // registering a new patient already records today's visit; checking in again keeps one
    let res = await reception.post(`/api/patients/${p.uid}/checkin/`);
    assert.equal(res.status, 200);
    assert.equal(res.body.message, 'Already registered for today');
    assert.equal(res.body.already, true);
    assert.ok(res.body.checkin_id);
    res = await reception.get(`/api/patients/${p.uid}/checkin/`);
    assert.equal(res.body.checkins.length, 1);
  });

  test('appointments + today list', async () => {
    let res = await reception.patch(`/api/patients/${p.uid}/appointment/`).send({ next_appointment: todayLocal() });
    assert.equal(res.status, 403);
    assert.deepEqual(res.body, { error: 'Receptionists cannot set appointments.' });
    res = await doctor.patch(`/api/patients/${p.uid}/appointment/`).send({ next_appointment: '2026-02-30' });
    assert.equal(res.status, 400);
    res = await doctor.patch(`/api/patients/${p.uid}/appointment/`).send({ next_appointment: todayLocal() });
    assert.deepEqual(res.body, { message: 'Appointment set.', next_appointment: todayLocal() });

    res = await reception.get('/api/patients/appointments/today/');
    assert.equal(res.body.date, todayLocal());
    assert.equal(res.body.count, 1);
    assert.equal(res.body.appointments[0].uid, p.uid);

    res = await doctor.patch(`/api/patients/${p.uid}/appointment/`).send({ next_appointment: null });
    assert.deepEqual(res.body, { message: 'Appointment set.', next_appointment: null });
    res = await reception.get('/api/patients/appointments/today/');
    assert.equal(res.body.count, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('complaints', () => {
  let p;
  before(async () => {
    p = await createPatient(reception, { name: 'Complaint Patient' });
  });

  test('role rules', async () => {
    let res = await reception.post('/api/complaints/').send({ patient_uid: p.uid, complaint_text: 'Pain' });
    assert.equal(res.status, 403);
    assert.deepEqual(res.body, { error: 'Receptionists cannot enter chief complaints.' });
    res = await reception.get(`/api/complaints/${p.uid}/`);
    assert.deepEqual(res.body, { error: 'Receptionists cannot view chief complaints.' });

    // every doctor can write chief complaints (the old per-doctor switch is gone)
    const doc = await models.User.findOne({ email: 'doctor@dental.com' });
    doc.can_edit_complaints = false;
    await doc.save();
    res = await doctor.post('/api/complaints/').send({ patient_uid: p.uid, complaint_text: 'Sensitivity' });
    assert.equal(res.status, 201);
    doc.can_edit_complaints = true;
    await doc.save();
  });

  test('validation', async () => {
    const res = await doctor.post('/api/complaints/').send({ patient_uid: 'ZZZZZZZ', complaint_text: ' ab ' });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body.error.patient_uid, ['Ensure this field has no more than 6 characters.']);
    assert.deepEqual(res.body.error.complaint_text, ['Ensure this field has at least 3 characters.']);
    const res2 = await doctor.post('/api/complaints/').send({ patient_uid: 'zzzzzz', complaint_text: 'Toothache' });
    assert.deepEqual(res2.body.error.patient_uid, ['Patient with UID ZZZZZZ not found.']);
  });

  test('create multiple + list newest first', async () => {
    let res = await doctor.post('/api/complaints/').send({ patient_uid: p.uid.toLowerCase(), complaint_text: '  Toothache upper left ' });
    assert.equal(res.status, 201);
    assert.equal(res.body.message, 'Chief complaint saved.');
    assert.equal(res.body.complaint.complaint_text, 'Toothache upper left');
    assert.equal(res.body.complaint.created_by_name, 'Dr. Sharma');
    assert.equal(res.body.complaint.last_edited_by_name, 'Dr. Sharma');
    await master.post('/api/complaints/').send({ patient_uid: p.uid, complaint_text: 'Bleeding gums' });
    res = await doctor.get(`/api/complaints/${p.uid}/`);
    assert.equal(res.body.complaints.length, 3);
    assert.equal(res.body.complaints[0].complaint_text, 'Bleeding gums');
    res = await doctor.get('/api/complaints/ZZZZZZ/');
    assert.deepEqual(res.body, { complaints: [] });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('tooth records', () => {
  let p;
  before(async () => {
    p = await createPatient(reception, { name: 'Tooth Patient' });
  });

  test('receptionist forbidden', async () => {
    const res = await reception.post('/api/tooth/').send({ patient_uid: p.uid, tooth_id: 'UR1', notes: 'x' });
    assert.equal(res.status, 403);
    assert.deepEqual(res.body, { error: 'Receptionists cannot access tooth records.' });
  });

  test('create (201) then update (200) the same tooth', async () => {
    let res = await doctor.post('/api/tooth/').send({ patient_uid: p.uid, tooth_id: 'ur6', notes: '{"O":"Cavity"}' });
    assert.equal(res.status, 201);
    assert.equal(res.body.message, 'Tooth record saved.');
    assert.equal(res.body.record.tooth_id, 'UR6');
    assert.equal(res.body.record.edited_by_name, 'Dr. Sharma');
    res = await master.post('/api/tooth/').send({ patient_uid: p.uid, tooth_id: 'UR6', notes: '' });
    assert.equal(res.status, 200);
    assert.equal(res.body.message, 'Tooth record updated.');
    assert.equal(res.body.record.notes, '');
    assert.equal(res.body.record.edited_by_name, 'Admin User');
  });

  test('invalid tooth id', async () => {
    const res = await doctor.post('/api/tooth/').send({ patient_uid: p.uid, tooth_id: 'UR9' });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body.error.tooth_id, ['Invalid tooth ID. Must be one of: UR1-UR8, UL1-UL8, LR1-LR8, LL1-LL8.']);
  });

  test('list sorted by tooth id, detail and delete', async () => {
    await doctor.post('/api/tooth/').send({ patient_uid: p.uid, tooth_id: 'LL3', notes: 'Chipped' });
    let res = await doctor.get(`/api/tooth/${p.uid}/`);
    assert.equal(res.body.total, 2);
    assert.deepEqual(res.body.records.map((r) => r.tooth_id), ['LL3', 'UR6']);
    res = await doctor.get(`/api/tooth/${p.uid}/ll3/`);
    assert.equal(res.body.record.notes, 'Chipped');
    res = await doctor.delete(`/api/tooth/${p.uid}/LL3/`);
    assert.deepEqual(res.body, { message: 'Tooth record deleted successfully.' });
    res = await doctor.get(`/api/tooth/${p.uid}/LL3/`);
    assert.equal(res.status, 404);
    assert.deepEqual(res.body, { error: `No record found for tooth LL3 of patient ${p.uid}.` });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('treatments', () => {
  let p;
  before(async () => {
    p = await createPatient(reception, { name: 'Treatment Patient' });
  });

  test('empty list returns total_cost "0"', async () => {
    const res = await reception.get(`/api/treatments/${p.uid}/`);
    assert.deepEqual(res.body, { patient_uid: p.uid, total: 0, total_cost: '0', treatments: [] });
  });

  test('validation', async () => {
    let res = await reception.post('/api/treatments/').send({ patient_uid: p.uid, description: 'Scaling', cost: 10 });
    assert.equal(res.status, 403);
    assert.deepEqual(res.body, { error: 'Receptionists cannot add treatment records.' });
    res = await doctor.post('/api/treatments/').send({ patient_uid: p.uid, description: 'ab', cost: 10.555, treatment_date: '2026-13-01' });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body.error.description, ['Ensure this field has at least 3 characters.']);
    assert.deepEqual(res.body.error.cost, ['Ensure that there are no more than 2 decimal places.']);
    assert.deepEqual(res.body.error.treatment_date, ['Date has wrong format. Use one of these formats instead: YYYY-MM-DD.']);
    res = await doctor.post('/api/treatments/').send({ patient_uid: p.uid, description: 'Scaling', cost: -5 });
    assert.deepEqual(res.body.error.cost, ['Ensure this value is greater than or equal to 0.']);
  });

  test('create with and without date; totals', async () => {
    let res = await doctor.post('/api/treatments/').send({ patient_uid: p.uid, description: 'Root canal', cost: 1500, treatment_date: '2026-07-01' });
    assert.equal(res.status, 201);
    assert.equal(res.body.message, 'Treatment recorded successfully.');
    assert.equal(res.body.treatment.cost, '1500.00');
    assert.equal(res.body.treatment.treatment_date, '2026-07-01');
    assert.equal(res.body.treatment.performed_by_name, 'Dr. Sharma');

    // missing date → today (the original API crashed with a 500 here)
    res = await doctor.post('/api/treatments/').send({ patient_uid: p.uid, description: 'Scaling', cost: '499.50' });
    assert.equal(res.status, 201);
    assert.equal(res.body.treatment.treatment_date, todayLocal());

    res = await reception.get(`/api/treatments/${p.uid}/`);
    assert.equal(res.body.total, 2);
    assert.equal(res.body.total_cost, '1999.50');
    assert.equal(res.body.treatments[0].description, 'Scaling'); // newest first

    res = await reception.patch(`/api/patients/${p.uid}/payment/`).send({ paid_amount: 1000 });
    assert.equal(res.body.total_cost, 1999.5);
    assert.equal(res.body.pending_amount, 999.5);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('stats', () => {
  test('dashboard stats (doctor gets personal numbers)', async () => {
    let res = await doctor.get('/api/patients/stats/');
    assert.equal(res.status, 200);
    const s = res.body.stats;
    for (const key of ['total_users', 'active_users', 'total_patients', 'registered_today', 'pending_patients', 'total_treatments', 'today_appointments', 'my_patients', 'my_treatments']) {
      assert.equal(typeof s[key], 'number', key);
    }
    assert.equal(s.total_users, 4);
    assert.equal(s.active_users, 3);
    assert.equal(s.total_patients, 6);
    assert.equal(s.registered_today, 6);
    assert.equal(s.total_treatments, 2);
    assert.equal(s.pending_patients, 5);
    assert.equal(s.my_patients, 1);
    assert.equal(s.my_treatments, 2);

    res = await reception.get('/api/patients/stats/');
    assert.equal(res.body.stats.my_patients, undefined);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('reports & receipt', () => {
  let p;
  let reportId;
  let fileUrl;

  before(async () => {
    p = await createPatient(reception, { name: 'Report Patient' });
  });

  test('upload validation', async () => {
    let res = await doctor.post('/api/reports/').field('patient_uid', p.uid).field('report_type', 'xray');
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { error: 'patient_uid, file, and report_type are required' });
    res = await doctor
      .post('/api/reports/')
      .field('patient_uid', p.uid)
      .field('report_type', 'selfie')
      .attach('file', Buffer.from('x'), 'a.png');
    assert.deepEqual(res.body, { error: 'Invalid report type. Choose from: photo, xray, prescription, lab_report, other' });
  });

  test('upload → list → open file', async () => {
    const content = Buffer.alloc(3000, 7);
    let res = await doctor
      .post('/api/reports/')
      .field('patient_uid', p.uid.toLowerCase())
      .field('report_type', 'xray')
      .field('description', ' Panoramic X-ray ')
      .attach('file', content, 'pano scan (1).png');
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const r = res.body.report;
    assert.equal(r.patient_uid, p.uid);
    assert.equal(r.report_type, 'xray');
    assert.equal(r.description, 'Panoramic X-ray');
    assert.equal(r.file_size_kb, 2);
    assert.equal(r.uploaded_by_name, 'Dr. Sharma');
    assert.match(r.file_url, /^http:\/\/127\.0\.0\.1:\d+\/media\/reports\/\d{4}\/\d{2}\/pano_scan_1\.png$/);
    reportId = r.id;
    fileUrl = new URL(r.file_url).pathname;

    res = await request(app).get(fileUrl);
    assert.equal(res.status, 200);
    assert.equal(res.body.length, 3000);

    // same file name again → stored under a unique name
    res = await doctor.post('/api/reports/').field('patient_uid', p.uid).field('report_type', 'other').attach('file', content, 'pano scan (1).png');
    assert.equal(res.status, 201);
    assert.notEqual(new URL(res.body.report.file_url).pathname, fileUrl);

    res = await reception.get(`/api/reports/${p.uid}/`);
    assert.equal(res.body.reports.length, 2);
    assert.equal(res.body.reports[0].report_type, 'other');
  });

  test('delete: 404 / doctor forbidden / master ok (file removed)', async () => {
    let res = await master.delete('/api/reports/delete/000000000000000000000000/');
    assert.equal(res.status, 404);
    assert.deepEqual(res.body, { error: 'Report not found' });
    res = await doctor.delete(`/api/reports/delete/${reportId}/`);
    assert.equal(res.status, 403);
    assert.deepEqual(res.body, { error: 'Only master admin can delete reports' });
    res = await master.delete(`/api/reports/delete/${reportId}/`);
    assert.deepEqual(res.body, { message: 'Report deleted successfully' });
    res = await request(app).get(fileUrl);
    assert.equal(res.status, 404);
  });

  test('receipt', async () => {
    let res = await reception.get('/api/reports/receipt/ZZZZZZ/');
    assert.equal(res.status, 404);
    assert.deepEqual(res.body, { error: 'Patient with UID ZZZZZZ not found' });
    res = await reception.get(`/api/reports/receipt/${p.uid}/`);
    assert.equal(res.status, 404);
    assert.deepEqual(res.body, { error: 'No treatments found for this patient' });

    await doctor.post('/api/treatments/').send({ patient_uid: p.uid, description: 'Filling', cost: 800, treatment_date: '2026-01-10' });
    await doctor.post('/api/treatments/').send({ patient_uid: p.uid, description: 'Crown', cost: 4200.25, treatment_date: '2026-03-05' });
    await doctor.post('/api/tooth/').send({ patient_uid: p.uid, tooth_id: 'UL6', notes: 'Crown placed' });
    await doctor.post('/api/complaints/').send({ patient_uid: p.uid, complaint_text: 'Broken tooth' });

    res = await reception.get(`/api/reports/receipt/${p.uid}/`);
    assert.equal(res.status, 200);
    assert.deepEqual(Object.keys(res.body).sort(), [
      'balance', 'billed_total', 'complaints', 'paid_cash', 'paid_total', 'paid_unrecorded', 'paid_upi',
      'patient', 'payments', 'tooth_records', 'total_cost', 'treatments',
    ]);
    assert.equal(res.body.billed_total, '5000.25');
    assert.equal(res.body.balance, '5000.25');
    assert.equal(res.body.patient.uid, p.uid);
    assert.equal(res.body.total_cost, 5000.25);
    assert.deepEqual(res.body.treatments.map((t) => t.description), ['Crown', 'Filling']); // by date desc
    assert.equal(res.body.tooth_records[0].tooth_id, 'UL6');
    assert.equal(res.body.complaints[0].complaint_text, 'Broken tooth');
  });
});
