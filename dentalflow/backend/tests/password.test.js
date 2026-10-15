/**
 * Forgot / reset / change password, admin reset, email providers and recovery variables.
 */
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { after, before, beforeEach, describe, test } from 'node:test';
import request from 'supertest';
import { as, login, setup, teardown } from './helpers.js';

process.env.MAIL_TRANSPORT = 'memory';
process.env.APP_URL = 'https://clinic.example.com/';

let app;
let models;
let master;
let outbox;

before(async () => {
  ({ app, models } = await setup());
  ({ memoryOutbox: outbox } = await import('../src/utils/mailer.js'));
  master = as(app, (await login(app, 'admin@dental.com')).access);
});

after(teardown);

const lastLinkToken = () => {
  const mail = outbox.at(-1);
  const m = /reset-password#token=([A-Za-z0-9_-]+)/.exec(mail.text);
  assert.ok(m, 'email contains a reset link');
  return m[1];
};

async function newUser(email, role = 'receptionist', password = 'start123') {
  const res = await master.post('/api/auth/admin/users/create/').send({ email, name: `User ${email}`, role, password });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.user;
}

// ═══════════════════════════════════════════════════════════════════════════
describe('forgot password by email', () => {
  beforeEach(() => {
    process.env.MAIL_TRANSPORT = 'memory';
  });

  test('options say whether email is set up', async () => {
    let res = await request(app).get('/api/auth/password/options/');
    assert.deepEqual(res.body, { email_enabled: true, link_minutes: 30 });
    process.env.MAIL_TRANSPORT = '';
    res = await request(app).get('/api/auth/password/options/');
    assert.equal(res.body.email_enabled, false);
    res = await request(app).post('/api/auth/password/forgot/').send({ email: 'doctor@dental.com' });
    assert.equal(res.status, 200);
    assert.equal(res.body.email_enabled, false);
    assert.match(res.body.message, /Ask the clinic admin/);
  });

  test('same answer for known and unknown emails; only real accounts get mail', async () => {
    const before = outbox.length;
    const a = await request(app).post('/api/auth/password/forgot/').send({ email: 'nobody@dental.com' });
    const b = await request(app).post('/api/auth/password/forgot/').send({ email: 'Doctor@Dental.com' });
    assert.equal(a.status, 200);
    assert.deepEqual(a.body, b.body);
    assert.equal(outbox.length, before + 1);
    const mail = outbox.at(-1);
    assert.equal(mail.to, 'doctor@dental.com');
    assert.equal(mail.subject, 'Reset your iCare 32 password');
    assert.match(mail.text, /https:\/\/clinic\.example\.com\/reset-password#token=/);
    assert.match(mail.html, /Choose a new password/);

    const bad = await request(app).post('/api/auth/password/forgot/').send({ email: 'not-an-email' });
    assert.equal(bad.status, 400);
  });

  test('asking twice within a minute sends only one email', async () => {
    const before = outbox.length;
    await request(app).post('/api/auth/password/forgot/').send({ email: 'doctor@dental.com' });
    assert.equal(outbox.length, before);
  });

  test('reset with the link: old sessions end, link works once', async () => {
    const user = await newUser('forgetful@dental.com');
    const oldTokens = await login(app, 'forgetful@dental.com', 'start123');
    await request(app).post('/api/auth/password/forgot/').send({ email: user.email });
    const token = lastLinkToken();

    let res = await request(app).post('/api/auth/password/reset/check/').send({ token });
    assert.equal(res.body.valid, true);
    assert.equal(res.body.email, 'f••••••l@dental.com');

    res = await request(app).post('/api/auth/password/reset/').send({ token, password: '123' });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body.error.password, ['Ensure this field has at least 6 characters.']);

    // wait a second so the old tokens are clearly older than the change
    await new Promise((r) => setTimeout(r, 1100));
    res = await request(app).post('/api/auth/password/reset/').send({ token, password: 'brand new pass' });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { message: 'Password changed. Sign in with your new password.' });

    res = await as(app, oldTokens.access).get('/api/auth/me/');
    assert.equal(res.status, 401);
    assert.equal(res.body.detail, 'Your password was changed. Please sign in again.');
    res = await request(app).post('/api/auth/refresh/').send({ refresh: oldTokens.refresh });
    assert.equal(res.status, 401);

    res = await request(app).post('/api/auth/login/').send({ email: user.email, password: 'start123' });
    assert.equal(res.status, 401);
    const fresh = await login(app, user.email, 'brand new pass');
    assert.ok(fresh.access);

    res = await request(app).post('/api/auth/password/reset/').send({ token, password: 'another pass' });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /expired or was already used/);
    res = await request(app).post('/api/auth/password/reset/check/').send({ token });
    assert.equal(res.body.valid, false);
  });

  test('expired, garbage and newer-link cases', async () => {
    await newUser('late@dental.com');
    await request(app).post('/api/auth/password/forgot/').send({ email: 'late@dental.com' });
    const token = lastLinkToken();
    await models.PasswordReset.updateMany({}, { $set: { expires_at: new Date(Date.now() - 1000) } });
    let res = await request(app).post('/api/auth/password/reset/').send({ token, password: 'whatever1' });
    assert.equal(res.status, 400);
    res = await request(app).post('/api/auth/password/reset/check/').send({ token: 'garbage' });
    assert.equal(res.body.valid, false);
    res = await request(app).post('/api/auth/password/reset/').send({ password: 'whatever1' });
    assert.equal(res.status, 400);
  });

  test('deactivated accounts get no email', async () => {
    const user = await newUser('gone@dental.com');
    await master.patch(`/api/auth/admin/users/${user.id}/update/`).send({ is_active: false });
    const before = outbox.length;
    await request(app).post('/api/auth/password/forgot/').send({ email: 'gone@dental.com' });
    assert.equal(outbox.length, before);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('change own password', () => {
  test('needs the current password; other sessions end, this one continues', async () => {
    await newUser('changer@dental.com', 'doctor', 'first-pass');
    const other = await login(app, 'changer@dental.com', 'first-pass');
    const mine = await login(app, 'changer@dental.com', 'first-pass');
    const client = as(app, mine.access);

    let res = await client.post('/api/auth/password/change/').send({ current_password: 'wrong', new_password: 'second-pass' });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body.error, { current_password: ['Current password is not correct.'] });
    res = await client.post('/api/auth/password/change/').send({ current_password: 'first-pass', new_password: 'first-pass' });
    assert.deepEqual(res.body.error, { new_password: ['Choose a password different from the current one.'] });
    res = await client.post('/api/auth/password/change/').send({ current_password: 'first-pass', new_password: 'abc' });
    assert.equal(res.status, 400);

    await new Promise((r) => setTimeout(r, 1100));
    res = await client.post('/api/auth/password/change/').send({ current_password: 'first-pass', new_password: 'second-pass' });
    assert.equal(res.status, 200);
    assert.equal(res.body.user.must_change_password, false);
    assert.ok(res.body.tokens.access);

    assert.equal((await as(app, res.body.tokens.access).get('/api/auth/me/')).status, 200);
    assert.equal((await as(app, other.access).get('/api/auth/me/')).status, 401);
    assert.ok(await login(app, 'changer@dental.com', 'second-pass'));
  });

  test('requires sign in', async () => {
    const res = await request(app).post('/api/auth/password/change/').send({ new_password: 'xxxxxxx' });
    assert.equal(res.status, 401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('admin reset', () => {
  test('only master; temporary password must be changed at next sign in', async () => {
    const user = await newUser('temp@dental.com', 'doctor', 'orig-pass');
    const doctor = as(app, (await login(app, 'doctor@dental.com')).access);
    let res = await doctor.post(`/api/auth/admin/users/${user.id}/reset-password/`).send({});
    assert.equal(res.status, 403);
    res = await master.post('/api/auth/admin/users/nope/reset-password/').send({});
    assert.equal(res.status, 404);

    res = await master.post(`/api/auth/admin/users/${user.id}/reset-password/`).send({});
    assert.equal(res.status, 200);
    assert.match(res.body.temporary_password, /^[a-z2-9]{5}-[a-z2-9]{5}$/);
    const temp = res.body.temporary_password;

    res = await request(app).post('/api/auth/login/').send({ email: 'temp@dental.com', password: temp });
    assert.equal(res.status, 200);
    assert.equal(res.body.user.must_change_password, true);
    const list = await master.get('/api/auth/admin/users/list/');
    assert.equal(list.body.users.find((u) => u.id === user.id).must_change_password, true);

    // no current password needed after a temporary one
    res = await as(app, res.body.tokens.access).post('/api/auth/password/change/').send({ new_password: 'my-own-pass' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.user.must_change_password, false);
    assert.ok(await login(app, 'temp@dental.com', 'my-own-pass'));
  });

  test('admin can choose the temporary password', async () => {
    const user = await newUser('chosen@dental.com');
    let res = await master.post(`/api/auth/admin/users/${user.id}/reset-password/`).send({ password: '12' });
    assert.equal(res.status, 400);
    res = await master.post(`/api/auth/admin/users/${user.id}/reset-password/`).send({ password: 'clinic2026' });
    assert.equal(res.body.temporary_password, 'clinic2026');
    assert.ok(await login(app, 'chosen@dental.com', 'clinic2026'));
  });

  test('email a reset link (and a clear error when email is off)', async () => {
    const user = await newUser('linked@dental.com');
    process.env.MAIL_TRANSPORT = 'memory';
    let res = await master.post(`/api/auth/admin/users/${user.id}/reset-password/`).send({ mode: 'email' });
    assert.equal(res.status, 200);
    assert.equal(outbox.at(-1).to, 'linked@dental.com');
    assert.match(outbox.at(-1).text, /clinic admin has sent you a link/);
    process.env.MAIL_TRANSPORT = '';
    res = await master.post(`/api/auth/admin/users/${user.id}/reset-password/`).send({ mode: 'email' });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /Email is not set up/);
    process.env.MAIL_TRANSPORT = 'memory';
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('email providers', () => {
  let server;
  let received;
  let status = 201;
  before(async () => {
    server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        received = { url: req.url, headers: req.headers, body: JSON.parse(body || '{}') };
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end('{}');
      });
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
  });
  after(() => {
    server.close();
    for (const k of ['MAIL_TRANSPORT', 'BREVO_API_KEY', 'BREVO_API_URL', 'RESEND_API_KEY', 'RESEND_API_URL', 'MAIL_FROM', 'SMTP_HOST', 'SMTP_PORT']) delete process.env[k];
    process.env.MAIL_TRANSPORT = 'memory';
  });

  test('Brevo request', async () => {
    const { sendMail, isEmailEnabled } = await import('../src/utils/mailer.js');
    process.env.MAIL_TRANSPORT = '';
    process.env.BREVO_API_KEY = 'xkeysib-test';
    assert.equal(isEmailEnabled(), false); // MAIL_FROM still missing
    process.env.MAIL_FROM = 'icare322025@gmail.com';
    process.env.BREVO_API_URL = `http://127.0.0.1:${server.address().port}/v3/smtp/email`;
    assert.equal(isEmailEnabled(), true);
    await sendMail({ to: 'a@b.com', subject: 'Hi', html: '<p>Hi</p>', text: 'Hi' });
    assert.equal(received.headers['api-key'], 'xkeysib-test');
    assert.deepEqual(received.body, {
      sender: { email: 'icare322025@gmail.com', name: 'iCare 32 Dental Clinic' },
      to: [{ email: 'a@b.com' }],
      subject: 'Hi',
      htmlContent: '<p>Hi</p>',
      textContent: 'Hi',
    });
    status = 401;
    await assert.rejects(sendMail({ to: 'a@b.com', subject: 'Hi', html: 'x', text: 'x' }), /answered 401/);
    status = 200;
    delete process.env.BREVO_API_KEY;
  });

  test('Resend request', async () => {
    const { sendMail } = await import('../src/utils/mailer.js');
    process.env.RESEND_API_KEY = 're_test';
    process.env.MAIL_FROM = 'clinic@icare32.in';
    process.env.RESEND_API_URL = `http://127.0.0.1:${server.address().port}/emails`;
    await sendMail({ to: 'a@b.com', subject: 'Hi', html: '<p>Hi</p>', text: 'Hi' });
    assert.equal(received.headers.authorization, 'Bearer re_test');
    assert.deepEqual(received.body, {
      from: 'iCare 32 Dental Clinic <clinic@icare32.in>',
      to: ['a@b.com'],
      subject: 'Hi',
      html: '<p>Hi</p>',
      text: 'Hi',
    });
    delete process.env.RESEND_API_KEY;
  });

  test('SMTP delivery', async () => {
    // a tiny SMTP server that accepts one message
    let data = '';
    const smtp = net.createServer((socket) => {
      let inData = false;
      socket.write('220 test ESMTP\r\n');
      socket.on('data', (chunk) => {
        for (const line of chunk.toString().split('\r\n')) {
          if (inData) {
            if (line === '.') { inData = false; socket.write('250 OK queued\r\n'); } else data += `${line}\n`;
            continue;
          }
          if (/^(EHLO|HELO)/i.test(line)) socket.write('250-test\r\n250 OK\r\n');
          else if (/^(MAIL FROM|RCPT TO)/i.test(line)) socket.write('250 OK\r\n');
          else if (/^DATA/i.test(line)) { inData = true; socket.write('354 go ahead\r\n'); }
          else if (/^QUIT/i.test(line)) { socket.write('221 bye\r\n'); socket.end(); }
        }
      });
    });
    await new Promise((r) => smtp.listen(0, '127.0.0.1', r));
    const { sendMail } = await import('../src/utils/mailer.js');
    process.env.SMTP_HOST = '127.0.0.1';
    process.env.SMTP_PORT = String(smtp.address().port);
    process.env.MAIL_FROM = 'icare322025@gmail.com';
    await sendMail({ to: 'staff@clinic.com', subject: 'SMTP test', html: '<p>Hello</p>', text: 'Hello' });
    smtp.close();
    assert.match(data, /Subject: SMTP test/);
    assert.match(data, /To: staff@clinic.com/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('recovery variables', () => {
  test('RESET_PASSWORD_EMAIL / RESET_PASSWORD reset once', async () => {
    const { applyPasswordRecovery } = await import('../src/controllers/password.controller.js');
    const { loadSettings } = models;
    process.env.RESET_PASSWORD_EMAIL = 'ADMIN@dental.com';
    process.env.RESET_PASSWORD = 'recovered-123';
    await applyPasswordRecovery({ loadSettings });
    let res = await request(app).post('/api/auth/login/').send({ email: 'admin@dental.com', password: 'recovered-123' });
    assert.equal(res.status, 200);
    assert.equal(res.body.user.must_change_password, true);

    // admin changes it; a restart with the same variables must not undo that
    await new Promise((r) => setTimeout(r, 1100));
    res = await as(app, res.body.tokens.access).post('/api/auth/password/change/').send({ new_password: 'final-admin-pass' });
    assert.equal(res.status, 200);
    await applyPasswordRecovery({ loadSettings });
    assert.ok(await login(app, 'admin@dental.com', 'final-admin-pass'));
    delete process.env.RESET_PASSWORD_EMAIL;
    delete process.env.RESET_PASSWORD;
  });
});
