import { useState } from 'react';
import api from '../api';
import { MIN_PASSWORD, newPasswordProblem } from '../lib/password';
import { useAuthStore } from '../store/authStore';
import { getErrorMessage } from '../utils/errors';
import { Field, FormError, PasswordInput } from './ui';

/**
 * Change your own password. With `temporary`, the current password is not asked
 * (the user just signed in with a temporary one from the admin).
 */
export default function ChangePasswordForm({ temporary = false, onDone, submitLabel = 'Change password', footer }) {
  const updateSession = useAuthStore((s) => s.updateSession);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!temporary && !current) {
      setError('Enter your current password.');
      return;
    }
    const problem = newPasswordProblem(next, confirm);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await api.changePassword(temporary ? { new_password: next } : { current_password: current, new_password: next });
      updateSession(res.user, res.tokens.access, res.tokens.refresh);
      onDone?.();
    } catch (err) {
      setError(getErrorMessage(err, 'Could not change the password.', ['current_password', 'new_password']));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="stack" onSubmit={submit} noValidate>
      {!temporary && (
        <Field label="Current password">
          <PasswordInput value={current} onChange={setCurrent} autoComplete="current-password" autoFocus />
        </Field>
      )}
      <Field label="New password" hint={`At least ${MIN_PASSWORD} characters`}>
        <PasswordInput value={next} onChange={setNext} autoComplete="new-password" autoFocus={temporary} />
      </Field>
      <Field label="Type it again">
        <PasswordInput value={confirm} onChange={setConfirm} autoComplete="new-password" />
      </Field>
      <FormError>{error}</FormError>
      <button type="submit" className="btn btn-primary btn-block" disabled={busy} style={{ minHeight: 50 }}>
        {busy ? 'Saving…' : submitLabel}
      </button>
      {footer}
    </form>
  );
}
