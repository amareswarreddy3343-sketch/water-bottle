import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import { ToothMark } from '../components/Logo';
import { Field, FormError, LoadingBlock } from '../components/ui';
import { getErrorMessage } from '../utils/errors';

export default function ForgotPasswordPage() {
  const [emailEnabled, setEmailEnabled] = useState(null);
  const [minutes, setMinutes] = useState(30);
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.title = 'Forgot password — iCare 32';
    api
      .passwordOptions()
      .then((r) => {
        setEmailEnabled(r.email_enabled);
        setMinutes(r.link_minutes || 30);
      })
      .catch(() => setEmailEnabled(false));
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError('Enter the email you sign in with.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await api.forgotPassword(email.trim().toLowerCase());
      if (res.email_enabled === false) setEmailEnabled(false);
      else setSentTo(email.trim().toLowerCase());
    } catch (err) {
      setError(
        err.response
          ? getErrorMessage(err, 'Could not send the email. Try again in a few minutes.', ['email'])
          : 'Cannot reach the clinic server. Check the internet connection.',
      );
    } finally {
      setBusy(false);
    }
  };

  const askAdmin = (
    <p className="muted">
      Ask the clinic admin to reset it. In <b>Admin → Team</b> they tap your name and choose <b>Reset password</b>,
      then tell you a temporary password. You’ll choose your own when you sign in.
    </p>
  );

  return (
    <div className="login">
      <div className="login-card">
        <ToothMark size={44} strokeWidth={3.6} />
        <h1>{sentTo ? 'Check your email' : 'Forgot your password?'}</h1>

        {emailEnabled === null ? (
          <LoadingBlock />
        ) : sentTo ? (
          <div className="stack mt-12">
            <p className="muted">
              If <b>{sentTo}</b> has an account, we’ve sent it a link to choose a new password. The link works once, for{' '}
              {minutes} minutes. Check the spam folder if you don’t see it.
            </p>
            <div className="section" style={{ marginBottom: 0 }}>
              <div className="strong mb-8">No email?</div>
              {askAdmin}
            </div>
          </div>
        ) : emailEnabled ? (
          <>
            <p className="sub">Enter the email you sign in with. We’ll send you a link to choose a new password.</p>
            <form className="stack" onSubmit={submit} noValidate>
              <Field label="Email">
                <input
                  className="input"
                  type="email"
                  inputMode="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@clinic.com"
                  autoFocus
                />
              </Field>
              <FormError>{error}</FormError>
              <button type="submit" className="btn btn-primary btn-block" disabled={busy} style={{ minHeight: 50 }}>
                {busy ? 'Sending…' : 'Send reset link'}
              </button>
            </form>
          </>
        ) : (
          <div className="stack mt-12">{askAdmin}</div>
        )}

        <p className="mt-16">
          <Link to="/login" className="link-btn">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
