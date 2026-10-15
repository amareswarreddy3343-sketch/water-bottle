import { useEffect } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import ChangePasswordForm from '../components/ChangePasswordForm';
import { ToothMark } from '../components/Logo';
import { useAuthStore } from '../store/authStore';
import { toast } from '../store/uiStore';

/** Shown right after signing in with a temporary password from the admin */
export default function ChangePasswordPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  useEffect(() => {
    document.title = 'Choose your password — iCare 32';
  }, []);

  if (!user?.must_change_password) return <Navigate to="/dashboard" replace />;

  return (
    <div className="login">
      <div className="login-card">
        <ToothMark size={44} strokeWidth={3.6} />
        <h1>Choose your password</h1>
        <p className="sub">
          Hello {user.name}. You signed in with a temporary password, so choose your own before you continue.
        </p>
        <ChangePasswordForm
          temporary
          submitLabel="Save and continue"
          onDone={() => {
            toast('Password saved');
            navigate('/dashboard', { replace: true });
          }}
          footer={
            <button
              type="button"
              className="btn btn-ghost btn-block"
              onClick={() => {
                logout();
                navigate('/login', { replace: true });
              }}
            >
              Sign out
            </button>
          }
        />
      </div>
    </div>
  );
}
