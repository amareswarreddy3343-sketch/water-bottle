import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ConfirmHost, ToastHost } from './components/ui';
import AdminPage from './pages/AdminPage';
import ChangePasswordPage from './pages/ChangePasswordPage';
import CollectionsPage from './pages/CollectionsPage';
import DashboardPage from './pages/DashboardPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import LoginPage from './pages/LoginPage';
import NewPatientPage from './pages/NewPatientPage';
import PatientPage from './pages/PatientPage';
import PatientsPage from './pages/PatientsPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import { canRegister, canSeeCollections } from './lib/access';
import { useAuthStore } from './store/authStore';

const isMaster = (u) => u?.role === 'master';

function RequireAuth({ children, allow }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const location = useLocation();
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  // signed in with a temporary password from the admin → choose a new one first
  if (user?.must_change_password) return <Navigate to="/change-password" replace />;
  if (allow && !allow(user)) return <Navigate to="/dashboard" replace />;
  return children;
}

const auth = (el, allow) => <RequireAuth allow={allow}>{el}</RequireAuth>;

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/change-password" element={<ChangePasswordPage />} />
        <Route path="/dashboard" element={auth(<DashboardPage />)} />
        <Route path="/patients" element={auth(<PatientsPage />)} />
        <Route path="/patients/new" element={auth(<NewPatientPage />, canRegister)} />
        <Route path="/patients/:uid" element={auth(<PatientPage />)} />
        <Route path="/collections" element={auth(<CollectionsPage />, canSeeCollections)} />
        <Route path="/admin" element={auth(<AdminPage />, isMaster)} />
        {/* addresses used by the previous version */}
        <Route path="/register-patient" element={<Navigate to="/patients/new" replace />} />
        <Route path="/doctor-hub" element={<Navigate to="/patients" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
      <ToastHost />
      <ConfirmHost />
    </BrowserRouter>
  );
}
