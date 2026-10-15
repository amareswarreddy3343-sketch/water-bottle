import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import { ToothMark } from '../components/Logo';
import { Field, FormError, LoadingBlock, PasswordInput } from '../components/ui';
import { MIN_PASSWORD, newPasswordProblem } from '../lib/password';
import { useAuthStore } from '../store/authStore';
import { getErrorMessage } from '../utils/errors';

/** The link in the email: /reset-password#token=… (the part after # never reaches the server logs) */
function tokenFromUrl() {
  const fromHash = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('token');
  return fromHash || new URLSearchParams(window.location.search).get('token') || '';
}

export default function ResetPasswordPage() {
  const [token] = useState(tokenFromUrl);
  const [link, setLink] = useState(() => (token ? null : { valid: false })); // { valid, email, name }
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const logout = useAuthStore((s) => s.logout);

  useEffect(() => {
    document.title = 'Choose a new password — iCare 32';
    if (!token) return;
    api
      .checkResetLink(token)
      .then(setLink)
      .catch(() => setLink({ valid: false, offline: true }));
  }, [token]);

  const submit = async (e) => {
    e.preventDefault();
    const problem = newPasswordProblem(password, confirm);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api.resetPassword(token, password);
      // the old sessions on this phone are no longer valid
      logout();
      window.history.replaceState(null, '', '/reset-password');
      setDone(true);
    } catch (err) {
      setError(getErrorMessage(err, 'Could not change the password.', ['password', 'token']));
    } finally {
      setBusy(false);
    }
  };

  let body;
  if (!link) {
    body = <LoadingBlock />;
  } else if (done) {
    body = (
      <div className="stack mt-12">
        <p className="muted">Your password is changed. Sign in with the new password.</p>
        <Link to="/login" className="btn btn-primary btn-block" style={{ minHeight: 50 }}>
          Sign in
        </Link>
      </div>
    );
  } else if (!link.valid) {
    body = (
      <div className="stack mt-12">
        <p className="muted">
          {link.offline
            ? 'Cannot reach the clinic server. Check the internet connection and open the link again.'
            : 'This link has expired or was already used. Links work once, for 30 minutes.'}
        </p>
        <Link to="/forgot-password" className="btn btn-primary btn-block" style={{ minHeight: 50 }}>
          Send a new link
        </Link>
      </div>
    );
  } else {
    body = (
      <>
        <p className="sub">
          For {link.name} ({link.email}).
        </p>
        <form className="stack" onSubmit={submit} noValidate>
          <Field label="New password" hint={`At least ${MIN_PASSWORD} characters`}>
            <PasswordInput value={password} onChange={setPassword} autoComplete="new-password" autoFocus />
          </Field>
          <Field label="Type it again">
            <PasswordInput value={confirm} onChange={setConfirm} autoComplete="new-password" />
          </Field>
          <FormError>{error}</FormError>
          <button type="submit" className="btn btn-primary btn-block" disabled={busy} style={{ minHeight: 50 }}>
            {busy ? 'Saving…' : 'Save new password'}
          </button>
        </form>
      </>
    );
  }

  return (
    <div className="login">
      <div className="login-card">
        <ToothMark size={44} strokeWidth={3.6} />
        <h1>{done ? 'Password changed' : 'Choose a new password'}</h1>
        {body}
        {!done && (
          <p className="mt-16">
            <Link to="/login" className="link-btn">
              Back to sign in
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
