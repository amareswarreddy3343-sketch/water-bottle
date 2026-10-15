/**
 * Sending email (password-reset links).
 *
 * Pick ONE of these in backend/.env (or the host's variables). MAIL_FROM is the sender.
 *   Brevo  (free, works with a Gmail sender):  BREVO_API_KEY=...   MAIL_FROM=icare322025@gmail.com
 *   Resend (needs your own domain):            RESEND_API_KEY=...  MAIL_FROM=clinic@yourdomain.com
 *   SMTP   (e.g. Gmail app password; not on Railway Hobby, which blocks SMTP):
 *          SMTP_HOST=smtp.gmail.com SMTP_PORT=465 SMTP_USER=icare322025@gmail.com SMTP_PASS=<app password>
 * Brevo and Resend send over HTTPS, so they work on Railway's Hobby plan.
 * Without any of these, email is off and the admin resets passwords from Admin → Team.
 */
import nodemailer from 'nodemailer';

/** Messages "sent" with MAIL_TRANSPORT=memory (used by the automated tests) */
export const memoryOutbox = [];

const env = (name) => (process.env[name] || '').trim();

export function mailSettings() {
  const explicit = env('MAIL_TRANSPORT').toLowerCase();
  let transport = explicit;
  if (!transport) {
    if (env('BREVO_API_KEY')) transport = 'brevo';
    else if (env('RESEND_API_KEY')) transport = 'resend';
    else if (env('SMTP_HOST')) transport = 'smtp';
  }
  const from = env('MAIL_FROM') || (transport === 'smtp' ? env('SMTP_USER') : '');
  const fromName = env('MAIL_FROM_NAME') || 'iCare 32 Dental Clinic';
  const valid = ['brevo', 'resend', 'smtp', 'memory'].includes(transport) && (from || transport === 'memory');
  return { transport: valid ? transport : null, from: from || 'clinic@example.com', fromName };
}

export const isEmailEnabled = () => Boolean(mailSettings().transport);

async function postJson(url, headers, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Email service answered ${res.status}: ${text.slice(0, 300)}`);
  }
}

let smtpTransport = null;
function getSmtp() {
  if (!smtpTransport) {
    const port = parseInt(env('SMTP_PORT') || '465', 10);
    smtpTransport = nodemailer.createTransport({
      host: env('SMTP_HOST'),
      port,
      secure: env('SMTP_SECURE') ? env('SMTP_SECURE') === 'true' : port === 465,
      auth: env('SMTP_USER') ? { user: env('SMTP_USER'), pass: env('SMTP_PASS') } : undefined,
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 20000,
    });
  }
  return smtpTransport;
}

/** Send one email. Throws if email is not set up or the provider refuses it. */
export async function sendMail({ to, subject, html, text }) {
  const { transport, from, fromName } = mailSettings();
  if (!transport) throw new Error('Email is not set up on this server.');

  if (transport === 'memory') {
    memoryOutbox.push({ to, subject, html, text, from });
    return;
  }
  if (transport === 'brevo') {
    await postJson(
      env('BREVO_API_URL') || 'https://api.brevo.com/v3/smtp/email',
      { 'api-key': env('BREVO_API_KEY') },
      { sender: { email: from, name: fromName }, to: [{ email: to }], subject, htmlContent: html, textContent: text },
    );
    return;
  }
  if (transport === 'resend') {
    await postJson(
      env('RESEND_API_URL') || 'https://api.resend.com/emails',
      { Authorization: `Bearer ${env('RESEND_API_KEY')}` },
      { from: `${fromName} <${from}>`, to: [to], subject, html, text },
    );
    return;
  }
  await getSmtp().sendMail({ from: { name: fromName, address: from }, to, subject, html, text });
}

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** The password-reset email */
export function resetEmail({ name, link, minutes, byAdmin }) {
  const intro = byAdmin
    ? 'The clinic admin has sent you a link to set a new password for the iCare 32 clinic app.'
    : 'Someone (hopefully you) asked to reset the password for your iCare 32 clinic app account.';
  const text = [
    `Hello ${name},`,
    '',
    intro,
    `Open this link to choose a new password (it works for ${minutes} minutes, once):`,
    link,
    '',
    'If you did not ask for this, you can ignore this email — your password stays the same.',
    '',
    'iCare 32 Dental Clinic',
  ].join('\n');
  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f3f5f3;font-family:Arial,Helvetica,sans-serif;color:#17231f">
  <div style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #e2e6e3;border-radius:16px;padding:28px">
    <p style="margin:0 0 4px;font-size:20px;font-weight:700;color:#a3245f">iCare 32 Dental Clinic</p>
    <p style="margin:0 0 20px;color:#4b5853;font-size:14px">Password reset</p>
    <p style="margin:0 0 12px;font-size:15px">Hello ${escapeHtml(name)},</p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.5">${escapeHtml(intro)}</p>
    <p style="margin:0 0 24px">
      <a href="${escapeHtml(link)}" style="display:inline-block;background:#a3245f;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:10px">Choose a new password</a>
    </p>
    <p style="margin:0 0 8px;font-size:13px;color:#4b5853">The link works once, for ${minutes} minutes.</p>
    <p style="margin:0;font-size:13px;color:#4b5853">If you did not ask for this, ignore this email. Your password stays the same.</p>
  </div>
</body></html>`;
  return { subject: 'Reset your iCare 32 password', html, text };
}
