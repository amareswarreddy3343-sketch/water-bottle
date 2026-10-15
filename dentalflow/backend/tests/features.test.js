/**
 * Tests for the clinic features added after the MERN conversion:
 * clinic settings, comorbidities, tooth status / root notes / bulk updates,
 * treatment plan (quotation), payment modes and the collections report.
 */
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { as, login, setup, teardown } from './helpers.js';

let app;
let models;
let master;
let doctor;
let reception;

const todayLocal = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(),
  );

before(async () => {
  ({ app, models } = await setup());
  master = as(app, (await login(app, 'admin@dental.com')).access);
  doctor = as(app, (await login(app, 'doctor@dental.com')).access);
  reception = as(app, (await login(app, 'reception@dental.com')).access);
});

after(teardown);

async function newPatient(body = {}) {
  const res = await reception.post('/api/patients/').send({ name: 'Lakshmi', age: 52, gender: 'female', phone: '9988776655', ...body });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.patient;
}

// ═══════════════════════════════════════════════════════════════════════════
describe('clinic settings', () => {
  test('defaults are readable by every role', async () => {
    for (const client of [master, doctor, reception]) {
      const res = await client.get('/api/settings/');
      assert.equal(res.status, 200);
      assert.ok(res.body.settings.comorbidity_options.includes('Diabetes'));
      assert.ok(res.body.settings.comorbidity_options.includes('Hypertension'));
      assert.ok(res.body.settings.comorbidity_options.includes('Cardiac disease'));
      const ids = res.body.settings.tooth_statuses.map((s) => s.id);
      assert.deepEqual(ids.slice(0, 2), ['missing', 'caries']);
      assert.equal(res.body.settings.tooth_statuses[0].color, '#111111'); // black = missing
      assert.equal(res.body.settings.tooth_statuses[1].color, '#9ca3af'); // gray = caries
    }
  });

  test('only master can change settings', async () => {
    let res = await doctor.patch('/api/settings/').send({ comorbidity_options: ['X'] });
    assert.equal(res.status, 403);
    res = await reception.patch('/api/settings/').send({ comorbidity_options: ['X'] });
    assert.equal(res.status, 403);
  });

  test('comorbidity list: add / remove, trimmed and de-duplicated', async () => {
    const res = await master.patch('/api/settings/').send({
      comorbidity_options: ['Diabetes', ' Hypertension ', 'diabetes', 'HIV', ''],
    });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.settings.comorbidity_options, ['Diabetes', 'Hypertension', 'HIV']);
    const bad = await master.patch('/api/settings/').send({ comorbidity_options: 'Diabetes' });
    assert.equal(bad.status, 400);
    assert.ok(bad.body.error.comorbidity_options);
  });

  test('tooth statuses: at most 10, valid colours, unique names', async () => {
    const eleven = Array.from({ length: 11 }, (_, i) => ({ label: `S${i}`, color: '#000000' }));
    let res = await master.patch('/api/settings/').send({ tooth_statuses: eleven });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body.error.tooth_statuses, ['You can define at most 10 tooth statuses.']);

    res = await master.patch('/api/settings/').send({ tooth_statuses: [{ label: 'Caries', color: 'grey' }] });
    assert.match(res.body.error.tooth_statuses[0], /colour/);

    res = await master.patch('/api/settings/').send({
      tooth_statuses: [{ label: 'A', color: '#000000' }, { label: 'a', color: '#ffffff' }],
    });
    assert.match(res.body.error.tooth_statuses[0], /listed twice/);
  });

  test('renaming keeps the id; removing a status clears it from teeth', async () => {
    const p = await newPatient();
    let res = await doctor.post('/api/tooth/').send({ patient_uid: p.uid, tooth_id: 'UR6', status: 'rct' });
    assert.equal(res.status, 201);
    assert.equal(res.body.record.status, 'rct');
    await doctor.post('/api/tooth/').send({ patient_uid: p.uid, tooth_id: 'UR7', status: 'caries' });

    res = await master.patch('/api/settings/').send({
      tooth_statuses: [
        { id: 'missing', label: 'Missing', color: '#000000' },
        { id: 'caries', label: 'Decay', color: '#808080' },
        { label: 'Crown', color: '#A855F7' },
      ],
    });
    assert.equal(res.status, 200);
    const statuses = res.body.settings.tooth_statuses;
    assert.equal(statuses.length, 3);
    assert.deepEqual(statuses[1], { id: 'caries', label: 'Decay', color: '#808080', part: 'crown' }); // part kept
    assert.equal(statuses[2].part, 'both');
    assert.match(statuses[2].id, /^st_[0-9a-f]{8}$/);
    assert.equal(statuses[2].color, '#a855f7');

    res = await doctor.get(`/api/tooth/${p.uid}/`);
    const byId = Object.fromEntries(res.body.records.map((r) => [r.tooth_id, r.status]));
    assert.equal(byId.UR6, ''); // "rct" was removed
    assert.equal(byId.UR7, 'caries'); // renamed, still linked
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('comorbidities', () => {
  test('set at registration and edited by doctors', async () => {
    const p = await newPatient({ comorbidities: ['Diabetes', 'Hypertension', 'diabetes'], pre_problems: 'Penicillin allergy' });
    assert.deepEqual(p.comorbidities, ['Diabetes', 'Hypertension']);
    assert.equal(p.pre_problems, 'Penicillin allergy');

    let res = await reception.patch(`/api/patients/${p.uid}/problems/`).send({ comorbidities: [] });
    assert.equal(res.status, 403);

    // Only the list is changed — the notes stay
    res = await doctor.patch(`/api/patients/${p.uid}/problems/`).send({ comorbidities: ['Cardiac disease'] });
    assert.deepEqual(res.body, { message: 'Updated.', pre_problems: 'Penicillin allergy', comorbidities: ['Cardiac disease'] });

    res = await doctor.patch(`/api/patients/${p.uid}/problems/`).send({ comorbidities: ['Asthma'], pre_problems: '' });
    assert.deepEqual(res.body.comorbidities, ['Asthma']);
    assert.equal(res.body.pre_problems, '');

    res = await doctor.patch(`/api/patients/${p.uid}/problems/`).send({ comorbidities: 'Asthma' });
    assert.equal(res.status, 400);

    res = await doctor.get(`/api/patients/${p.uid}/`);
    assert.deepEqual(res.body.patient.comorbidities, ['Asthma']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('tooth chart: status, root notes, select-all updates', () => {
  let p;
  before(async () => {
    p = await newPatient();
  });

  test('status validation; notes are kept when only the status changes', async () => {
    let res = await doctor.post('/api/tooth/').send({ patient_uid: p.uid, tooth_id: 'LL6', notes: '{"R":"Periapical lesion"}' });
    assert.equal(res.status, 201);
    res = await doctor.post('/api/tooth/').send({ patient_uid: p.uid, tooth_id: 'LL6', status: 'nope' });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body.error.status, ['Unknown tooth status.']);
    res = await doctor.post('/api/tooth/').send({ patient_uid: p.uid, tooth_id: 'LL6', status: 'caries' });
    assert.equal(res.status, 200);
    assert.equal(res.body.record.status, 'caries');
    assert.equal(res.body.record.notes, '{"R":"Periapical lesion"}');
    res = await doctor.post('/api/tooth/').send({ patient_uid: p.uid, tooth_id: 'LL6', status: null });
    assert.equal(res.body.record.status, '');
  });

  test('bulk: status + note on many teeth, append and replace', async () => {
    const upper = ['UR1', 'UR2', 'UL1', 'UL2'];
    let res = await doctor.post('/api/tooth/bulk/').send({
      patient_uid: p.uid,
      tooth_ids: [...upper, 'ur1'],
      status: 'caries',
      note: { part: 'G', text: 'Scaling done' },
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.records.length, 4);
    for (const r of res.body.records) {
      assert.equal(r.status, 'caries');
      assert.deepEqual(JSON.parse(r.notes), { G: 'Scaling done' });
    }

    // append to the root note of an existing record (keeps the other parts)
    res = await doctor.post('/api/tooth/bulk/').send({
      patient_uid: p.uid,
      tooth_ids: ['UR1', 'LL6'],
      note: { part: 'R', text: 'RCT planned' },
    });
    const ll6 = res.body.records.find((r) => r.tooth_id === 'LL6');
    assert.deepEqual(JSON.parse(ll6.notes), { R: 'Periapical lesion\nRCT planned' });
    const ur1 = res.body.records.find((r) => r.tooth_id === 'UR1');
    assert.deepEqual(JSON.parse(ur1.notes), { G: 'Scaling done', R: 'RCT planned' });
    assert.equal(ur1.status, 'caries'); // status untouched

    // replace with empty text clears that part
    res = await doctor.post('/api/tooth/bulk/').send({
      patient_uid: p.uid,
      tooth_ids: ['UR1'],
      status: '',
      note: { part: 'G', text: '', mode: 'replace' },
    });
    assert.deepEqual(JSON.parse(res.body.records[0].notes), { R: 'RCT planned' });
    assert.equal(res.body.records[0].status, '');
  });

  test('bulk validation and permissions', async () => {
    let res = await reception.post('/api/tooth/bulk/').send({ patient_uid: p.uid, tooth_ids: ['UR1'], status: 'caries' });
    assert.equal(res.status, 403);
    res = await doctor.post('/api/tooth/bulk/').send({ patient_uid: p.uid, tooth_ids: [], status: 'caries' });
    assert.deepEqual(res.body.error.tooth_ids, ['Select at least one tooth.']);
    res = await doctor.post('/api/tooth/bulk/').send({ patient_uid: p.uid, tooth_ids: ['UR9'], status: 'caries' });
    assert.deepEqual(res.body.error.tooth_ids, ['Invalid tooth ID: UR9.']);
    res = await doctor.post('/api/tooth/bulk/').send({ patient_uid: p.uid, tooth_ids: ['UR1'] });
    assert.deepEqual(res.body.error, { non_field_errors: ['Choose a status or write a note to apply.'] });
    res = await doctor.post('/api/tooth/bulk/').send({ patient_uid: p.uid, tooth_ids: ['UR1'], note: { part: 'X', text: 'a' } });
    assert.equal(res.status, 400);
    res = await doctor.post('/api/tooth/bulk/').send({ patient_uid: 'ZZZZZZ', tooth_ids: ['UR1'], status: 'caries' });
    assert.deepEqual(res.body.error.patient_uid, ['Patient with UID ZZZZZZ not found.']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('treatment plan (quotation)', () => {
  let p;
  let rct;
  let crown;
  before(async () => {
    p = await newPatient();
  });

  test('doctors add items; reception can only read', async () => {
    let res = await reception.post('/api/proposals/').send({ patient_uid: p.uid, procedure: 'Scaling', cost: 800 });
    assert.equal(res.status, 403);

    res = await doctor.post('/api/proposals/').send({ patient_uid: p.uid, procedure: 'Root canal', tooth: 'LL6', cost: '4500' });
    assert.equal(res.status, 201);
    rct = res.body.proposal;
    assert.equal(rct.cost, '4500.00');
    assert.equal(rct.status, 'proposed');
    assert.equal(rct.created_by_name, 'Dr. Sharma');

    res = await master.post('/api/proposals/').send({ patient_uid: p.uid, procedure: 'Zirconia crown', tooth: 'LL6', cost: 9000 });
    crown = res.body.proposal;

    res = await doctor.post('/api/proposals/').send({ patient_uid: p.uid, procedure: 'x', cost: -1 });
    assert.equal(res.status, 400);
    assert.ok(res.body.error.procedure && res.body.error.cost);

    res = await reception.get(`/api/proposals/${p.uid.toLowerCase()}/`);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.proposals.map((x) => x.procedure), ['Root canal', 'Zirconia crown']);
    assert.equal(res.body.total_proposed, '13500.00');
    assert.equal(res.body.total_done, '0.00');
  });

  test('proposals do not change the bill until done', async () => {
    const res = await reception.get(`/api/treatments/${p.uid}/`);
    assert.equal(res.body.total, 0);
  });

  test('edit and delete', async () => {
    let res = await doctor.patch(`/api/proposals/item/${crown.id}/`).send({ cost: 8500.5, tooth: '' });
    assert.equal(res.body.proposal.cost, '8500.50');
    assert.equal(res.body.proposal.tooth, '');
    res = await reception.delete(`/api/proposals/item/${crown.id}/`);
    assert.equal(res.status, 403);
    res = await doctor.patch('/api/proposals/item/nope/').send({ cost: 1 });
    assert.equal(res.status, 404);
  });

  test('mark done creates a treatment; undo removes it', async () => {
    let res = await doctor.post(`/api/proposals/item/${rct.id}/done/`).send({});
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.proposal.status, 'done');
    assert.equal(res.body.treatment.description, 'Root canal (LL6)');
    assert.equal(res.body.treatment.cost, '4500.00');
    assert.equal(res.body.treatment.treatment_date, todayLocal());

    res = await doctor.post(`/api/proposals/item/${rct.id}/done/`).send({});
    assert.equal(res.status, 400);
    res = await doctor.patch(`/api/proposals/item/${rct.id}/`).send({ cost: 1 });
    assert.deepEqual(res.body, { error: 'Completed items cannot be edited.' });

    res = await reception.get(`/api/treatments/${p.uid}/`);
    assert.equal(res.body.total_cost, '4500.00');
    res = await reception.get(`/api/proposals/${p.uid}/`);
    assert.equal(res.body.total_proposed, '8500.50');
    assert.equal(res.body.total_done, '4500.00');

    res = await doctor.post(`/api/proposals/item/${rct.id}/undo/`).send();
    assert.equal(res.body.proposal.status, 'proposed');
    res = await reception.get(`/api/treatments/${p.uid}/`);
    assert.equal(res.body.total, 0);

    // done with a different date / final cost
    res = await doctor.post(`/api/proposals/item/${crown.id}/done/`).send({ treatment_date: '2026-02-01', cost: 8000 });
    assert.equal(res.body.treatment.treatment_date, '2026-02-01');
    assert.equal(res.body.proposal.cost, '8000.00');
    res = await doctor.delete(`/api/proposals/item/${crown.id}/`);
    assert.deepEqual(res.body, { message: 'Removed from treatment plan.' });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('payments: cash / UPI and collections', () => {
  let p;
  before(async () => {
    p = await newPatient({ name: 'Payment Patient' });
    await doctor.post('/api/treatments/').send({ patient_uid: p.uid, description: 'Extraction', cost: 1500 });
  });

  test('mode and UPI reference are recorded', async () => {
    let res = await reception.post(`/api/patients/${p.uid}/payments/`).send({ paid_amount: 1000, mode: 'UPI', reference: 'UTR123456' });
    assert.equal(res.status, 200);
    assert.equal(res.body.payment.mode, 'upi');
    assert.equal(res.body.payment.reference, 'UTR123456');
    assert.equal(res.body.pending_amount, 500);

    res = await reception.patch(`/api/patients/${p.uid}/payment/`).send({ paid_amount: 200, mode: 'cash', reference: 'ignored' });
    assert.equal(res.body.payment.reference, '');

    res = await reception.post(`/api/patients/${p.uid}/payments/`).send({ paid_amount: 10, mode: 'card' });
    assert.deepEqual(res.body, { error: 'Payment mode must be cash or upi.' });

    res = await doctor.get(`/api/patients/${p.uid}/payments/`);
    assert.deepEqual(res.body.summary, { total: '1200.00', cash: '200.00', upi: '1000.00' });
    assert.deepEqual(res.body.payments.map((x) => x.mode), ['cash', 'upi']);
  });

  test('collections report: master, and doctors the admin allows (not reception)', async () => {
    let res = await reception.get('/api/payments/');
    assert.equal(res.status, 403);
    // doctors only see collections when the admin allows it
    res = await doctor.get('/api/payments/');
    assert.equal(res.status, 403);
    const users = (await master.get('/api/auth/admin/users/list/')).body.users;
    const doc = users.find((u) => u.email === 'doctor@dental.com');
    res = await master.patch(`/api/auth/admin/users/${doc.id}/update/`).send({ can_view_collections: true });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    res = await doctor.get('/api/payments/');
    assert.equal(res.status, 200);
    assert.equal(res.body.from, todayLocal());
    assert.equal(res.body.total, '1200.00');
    assert.equal(res.body.cash, '200.00');
    assert.equal(res.body.upi, '1000.00');
    assert.equal(res.body.payments[0].patient_name, 'Payment Patient');
    assert.equal(res.body.payments[0].created_by_name, 'Reception Desk');

    res = await master.get('/api/payments/?mode=upi');
    assert.equal(res.body.payments.length, 1);
    assert.equal(res.body.total, '1200.00'); // totals always cover both modes

    res = await master.get('/api/payments/?from=2020-01-01&to=2020-01-31');
    assert.equal(res.body.count, 0);
    res = await master.get('/api/payments/?from=2026-02-30');
    assert.equal(res.status, 400);
    res = await master.get('/api/payments/?from=2026-03-02&to=2026-03-01');
    assert.equal(res.status, 400);
  });

  test("dashboard shows today's collection", async () => {
    const res = await reception.get('/api/patients/stats/');
    assert.equal(res.body.stats.collected_today, 1200);
    assert.equal(res.body.stats.collected_today_cash, 200);
    assert.equal(res.body.stats.collected_today_upi, 1000);
  });

  test('receipt lists every payment with its mode', async () => {
    const res = await reception.get(`/api/reports/receipt/${p.uid}/`);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.payments.map((x) => [x.amount, x.mode]), [['1000.00', 'upi'], ['200.00', 'cash']]);
    assert.equal(res.body.billed_total, '1500.00');
    assert.equal(res.body.paid_total, '1200.00');
    assert.equal(res.body.paid_upi, '1000.00');
    assert.equal(res.body.balance, '300.00');
    assert.equal(res.body.paid_unrecorded, '0.00');
  });

  test('only master can delete a payment (total goes down)', async () => {
    let res = await doctor.get(`/api/patients/${p.uid}/payments/`);
    const cash = res.body.payments.find((x) => x.mode === 'cash');
    res = await reception.delete(`/api/patients/${p.uid}/payments/${cash.id}/`);
    assert.equal(res.status, 403);
    res = await master.delete(`/api/patients/${p.uid}/payments/${cash.id}/`);
    assert.equal(res.status, 200);
    assert.equal(res.body.paid_amount, 1000);
    assert.equal(res.body.pending_amount, 500);
    res = await master.delete(`/api/patients/${p.uid}/payments/${cash.id}/`);
    assert.equal(res.status, 404);
  });

  test('receipt works with only an advance payment; older totals are shown as unrecorded', async () => {
    const q = await newPatient({ name: 'Advance' });
    let res = await reception.get(`/api/reports/receipt/${q.uid}/`);
    assert.equal(res.status, 404);
    await reception.post(`/api/patients/${q.uid}/payments/`).send({ paid_amount: 300 });
    await models.Patient.updateOne({ uid: q.uid }, { $inc: { paid_amount: 100 } }); // paid before history existed
    res = await reception.get(`/api/reports/receipt/${q.uid}/`);
    assert.equal(res.status, 200);
    assert.equal(res.body.paid_total, '400.00');
    assert.equal(res.body.paid_unrecorded, '100.00');
    assert.equal(res.body.balance, '-400.00');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('patient list extras', () => {
  test('search results include treatment count and last treatment date', async () => {
    const p = await newPatient({ name: 'Count Me' });
    await doctor.post('/api/treatments/').send({ patient_uid: p.uid, description: 'Filling', cost: 500, treatment_date: '2026-01-05' });
    await doctor.post('/api/treatments/').send({ patient_uid: p.uid, description: 'Filling 2', cost: 500, treatment_date: '2026-03-07' });
    const res = await doctor.get('/api/patients/search/?search=count me');
    assert.equal(res.body.results[0].treatment_count, 2);
    assert.equal(res.body.results[0].last_treatment_date, '2026-03-07');
    const other = await doctor.get('/api/patients/search/?search=Advance');
    assert.equal(other.body.results[0].treatment_count, 0);
    assert.equal(other.body.results[0].last_treatment_date, null);
  });

  test('photo is an accepted report type', async () => {
    const p = await newPatient({ name: 'Photo' });
    const res = await reception
      .post('/api/reports/')
      .field('patient_uid', p.uid)
      .field('report_type', 'photo')
      .attach('file', Buffer.from('jpegdata'), 'smile.jpg');
    assert.equal(res.status, 201);
    assert.equal(res.body.report.report_type, 'photo');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('hosting helpers', () => {
  test('database name is detected in MongoDB addresses', async () => {
    const { hasDatabaseName } = await import('../src/config/db.js');
    assert.equal(hasDatabaseName('mongodb://mongo:pw@mongodb.railway.internal:27017'), false);
    assert.equal(hasDatabaseName('mongodb://mongo:pw@mongodb.railway.internal:27017/'), false);
    assert.equal(hasDatabaseName('mongodb://mongo:pw@host:27017/?authSource=admin'), false);
    assert.equal(hasDatabaseName('mongodb://127.0.0.1:27017/dentalflow'), true);
    assert.equal(hasDatabaseName('mongodb+srv://u:p@cluster0.x.mongodb.net/clinic?retryWrites=true'), true);
  });
});
