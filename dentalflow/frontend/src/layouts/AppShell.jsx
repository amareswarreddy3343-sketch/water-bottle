import { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import api from '../api';
import Icon from '../components/Icon';
import { ToothMark } from '../components/Logo';
import ChangePasswordForm from '../components/ChangePasswordForm';
import { Sheet } from '../components/ui';
import { useAuthStore } from '../store/authStore';
import { canRegister, canSeeCollections } from '../lib/access';
import { useThemeStore } from '../store/themeStore';
import { toast, useClinic, useSettings } from '../store/uiStore';

const ROLE_LABEL = { master: 'Admin', doctor: 'Doctor', receptionist: 'Reception' };

function navItems(user) {
  const items = [
    { to: '/dashboard', label: 'Home', icon: 'home' },
    { to: '/patients', label: 'Patients', icon: 'users', end: true },
  ];
  // new patients are registered at reception (doctors don't get this tab)
  if (canRegister(user)) items.push({ to: '/patients/new', label: 'Register', icon: 'plus', isNew: true });
  if (canSeeCollections(user)) items.push({ to: '/collections', label: 'Collections', icon: 'wallet' });
  if (user?.role === 'master') items.push({ to: '/admin', label: 'Admin', icon: 'sliders' });
  return items;
}

// refresh the signed-in profile now and then (the admin may change what someone can see)
let profileCheckedAt = 0;

function ChangePasswordSheet({ onClose }) {
  return (
    <Sheet open onClose={onClose} title="Change password" subtitle="Other phones and computers signed in to your account will be signed out.">
      <ChangePasswordForm
        onDone={() => {
          toast('Password changed');
          onClose();
        }}
      />
    </Sheet>
  );
}

function AccountSheet({ open, onClose, onChangePassword }) {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const refreshToken = useAuthStore((s) => s.refreshToken);
  const logout = useAuthStore((s) => s.logout);
  const isDark = useThemeStore((s) => s.isDarkMode);
  const toggleDark = useThemeStore((s) => s.toggleDarkMode);

  const signOut = async () => {
    try {
      if (refreshToken) await api.logout(refreshToken);
    } catch {
      /* already expired — sign out locally anyway */
    }
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <Sheet open={open} onClose={onClose} title={user?.name || 'Account'} subtitle={`${user?.email || ''}`}>
      <div className="row mb-12">
        <span className="tag tag-berry">{ROLE_LABEL[user?.role] || user?.role}</span>
      </div>
      <button type="button" className="menu-item" onClick={onChangePassword}>
        <Icon name="key" />
        Change password
      </button>
      <button type="button" className="menu-item" onClick={toggleDark}>
        <Icon name={isDark ? 'sun' : 'moon'} />
        {isDark ? 'Use light theme' : 'Use dark theme'}
      </button>
      <button type="button" className="menu-item danger" onClick={signOut}>
        <Icon name="logout" />
        Sign out
      </button>
    </Sheet>
  );
}

/**
 * Page frame: top bar (with optional back button and actions), bottom tab bar on
 * phones, sidebar on large screens.
 */
export default function AppShell({ title, back, actions, children, wide = false, titleOnScroll = false }) {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const loadSettings = useSettings((s) => s.load);
  const loadClinic = useClinic((s) => s.load);
  const [accountOpen, setAccountOpen] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [scrolled, setScrolled] = useState(0); // 0 top, 1 scrolled, 2 past the page heading

  useEffect(() => {
    loadSettings();
    loadClinic();
    if (Date.now() - profileCheckedAt > 120000) {
      profileCheckedAt = Date.now();
      api
        .me()
        .then((r) => r?.user && setUser({ ...useAuthStore.getState().user, ...r.user }))
        .catch(() => {});
    }
    // the date changes at midnight even if the app stays open
    const onFocus = () => loadClinic();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [loadSettings, loadClinic, setUser]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 120 ? 2 : window.scrollY > 4 ? 1 : 0);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    document.title = title ? `${title} — iCare 32` : 'iCare 32 Dental Clinic';
  }, [title]);

  const items = navItems(user);
  const goBack = () => {
    if (typeof back === 'string') navigate(back);
    else if (window.history.length > 1) navigate(-1);
    else navigate('/dashboard');
  };

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="row" style={{ gap: 10, padding: '0 8px' }}>
          <ToothMark size={30} />
          <div>
            <div className="display strong" style={{ fontSize: 18, lineHeight: 1.1 }}>
              iCare 32
            </div>
            <div className="tiny faint">Dental Clinic</div>
          </div>
        </div>
        <nav aria-label="Main">
          {items.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end}>
              <Icon name={item.icon} />
              {item.isNew ? 'Register patient' : item.label}
            </NavLink>
          ))}
        </nav>
        <button type="button" className="menu-item" onClick={() => setAccountOpen(true)}>
          <span className="avatar" style={{ width: 34, height: 34, borderRadius: 11, fontSize: 14 }}>
            {(user?.name || '?').slice(0, 1).toUpperCase()}
          </span>
          <span className="grow" style={{ lineHeight: 1.25 }}>
            <span className="ellipsis" style={{ display: 'block' }}>
              {user?.name}
            </span>
            <span className="tiny faint">{ROLE_LABEL[user?.role]}</span>
          </span>
        </button>
      </aside>

      <div>
        <header className={`topbar${scrolled ? ' scrolled' : ''}${scrolled === 2 ? ' scrolled-far' : ''}`}>
          {back ? (
            <button type="button" className="icon-btn" onClick={goBack} aria-label="Back">
              <Icon name="back" size={22} />
            </button>
          ) : (
            <div className="topbar-brand">
              <ToothMark size={24} />
              <span>iCare 32</span>
            </div>
          )}
          {back ? (
            <div className={`topbar-title${titleOnScroll ? ' on-scroll' : ''}`}>{title}</div>
          ) : (
            <div className="topbar-title desktop-only">{title}</div>
          )}
          {actions}
          <button
            type="button"
            className="icon-btn account-btn"
            onClick={() => setAccountOpen(true)}
            aria-label="Account and settings"
          >
            <span className="avatar" style={{ width: 32, height: 32, borderRadius: 10, fontSize: 14 }}>
              {(user?.name || '?').slice(0, 1).toUpperCase()}
            </span>
          </button>
        </header>

        <main className={`main${wide ? ' wide' : ''}`}>{children}</main>
      </div>

      <nav className="bottomnav" aria-label="Main">
        {items.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end}>
            {item.isNew ? (
              <span className="nav-new">
                <Icon name="plus" size={20} strokeWidth={2.4} />
              </span>
            ) : (
              <Icon name={item.icon} size={22} />
            )}
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <AccountSheet
        open={accountOpen}
        onClose={() => setAccountOpen(false)}
        onChangePassword={() => {
          setAccountOpen(false);
          setChangingPassword(true);
        }}
      />
      {changingPassword && <ChangePasswordSheet onClose={() => setChangingPassword(false)} />}
    </div>
  );
}
