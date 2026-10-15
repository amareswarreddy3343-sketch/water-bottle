import { create } from 'zustand';

const AUTH_KEYS = ['auth-user', 'auth-token', 'refresh-token'];

// Clear tokens saved by older builds so opening the app does not auto-login.
AUTH_KEYS.forEach((key) => localStorage.removeItem(key));

export const useAuthStore = create((set, get) => ({
  // State
  user: JSON.parse(sessionStorage.getItem('auth-user') || 'null'),
  accessToken: sessionStorage.getItem('auth-token') || null,
  refreshToken: sessionStorage.getItem('refresh-token') || null,
  isAuthenticated: !!sessionStorage.getItem('auth-token'),

  // Actions
  login: (user, accessToken, refreshToken) => {
    sessionStorage.setItem('auth-user', JSON.stringify(user));
    sessionStorage.setItem('auth-token', accessToken);
    sessionStorage.setItem('refresh-token', refreshToken);
    set({
      user,
      accessToken,
      refreshToken,
      isAuthenticated: true,
    });
  },

  logout: () => {
    AUTH_KEYS.forEach((key) => {
      sessionStorage.removeItem(key);
      localStorage.removeItem(key);
    });
    set({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
    });
  },

  setAccessToken: (accessToken) => {
    sessionStorage.setItem('auth-token', accessToken);
    set({ accessToken });
  },

  // The API rotates refresh tokens — keep the newest one
  setRefreshToken: (refreshToken) => {
    sessionStorage.setItem('refresh-token', refreshToken);
    set({ refreshToken });
  },

  /** New tokens + profile after a password change (other sessions are signed out by the server) */
  updateSession: (user, accessToken, refreshToken) => {
    sessionStorage.setItem('auth-user', JSON.stringify(user));
    sessionStorage.setItem('auth-token', accessToken);
    sessionStorage.setItem('refresh-token', refreshToken);
    set({ user, accessToken, refreshToken, isAuthenticated: true });
  },

  setUser: (user) => {
    sessionStorage.setItem('auth-user', JSON.stringify(user));
    set({ user });
  },

  hasRole: (role) => {
    const state = get();
    return state.user?.role === role;
  },

  hasAnyRole: (roles) => {
    const state = get();
    return roles.includes(state.user?.role);
  },
}));
