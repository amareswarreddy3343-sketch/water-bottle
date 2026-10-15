import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import api from '../api';
import { ToothMark } from '../components/Logo';
import { Field, FormError, PasswordInput } from '../components/ui';
import { useAuthStore } from '../store/authStore';
import { getErrorMessage } from '../utils/errors';

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const login = useAuthStore((s) => s.login);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (isAuthenticated) return <Navigate to="/dashboard" replace />;

  const submit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const { user, tokens } = await api.login(email.trim().toLowerCase(), password);
      login(user, tokens.access, tokens.refresh);
      navigate(location.state?.from || '/dashboard', { replace: true });
    } catch (err) {
      setError(
        err.response
          ? getErrorMessage(err, 'Sign in failed.', ['non_field_errors', 'email', 'password'])
          : 'Cannot reach the clinic server. Check the Wi-Fi / network and try again.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <div className="login-card">
        <ToothMark size={52} strokeWidth={3.6} title="iCare 32" />
        <h1>iCare 32 Dental Clinic</h1>
        <p className="sub">Sign in to continue.</p>
        <form className="stack" onSubmit={submit} noValidate>
          <Field label="Email">
            <input
              className="input"
              type="email"
              autoComplete="username"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@clinic.com"
            />
          </Field>
          <Field label="Password">
            <PasswordInput value={password} onChange={setPassword} />
          </Field>
          <div style={{ textAlign: 'right', marginTop: -4 }}>
            <Link to="/forgot-password" className="link-btn small">
              Forgot password?
            </Link>
          </div>
          <FormError>{error}</FormError>
          <button type="submit" className="btn btn-primary btn-block" disabled={busy} style={{ minHeight: 50 }}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
