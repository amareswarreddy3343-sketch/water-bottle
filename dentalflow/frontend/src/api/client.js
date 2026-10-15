import axios from 'axios';
import { useAuthStore } from '../store/authStore';

// Defaults to the same server that serves the app (works on any host / IP)
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

const client = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Requests that must never trigger the "refresh token and retry" logic
const NO_REFRESH_PATHS = ['/auth/login/', '/auth/refresh/', '/auth/logout/'];

// Request interceptor — add token to every request
client.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().accessToken;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

function forceLogout() {
  useAuthStore.getState().logout();
  if (window.location.pathname !== '/login') {
    window.location.href = '/login';
  }
}

// One refresh at a time — parallel 401s (e.g. dashboard polling) share it
let refreshPromise = null;

// Response interceptor — handle 401 and refresh token
client.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const url = originalRequest?.url || '';
    const skipRefresh = NO_REFRESH_PATHS.some((path) => url.includes(path));

    // A 401 from the login endpoint just means "wrong credentials" — let the
    // login form show the message instead of logging out and reloading the page.
    if (error.response?.status === 401 && originalRequest && !originalRequest._retry && !skipRefresh) {
      originalRequest._retry = true;

      const { refreshToken } = useAuthStore.getState();
      if (!refreshToken) {
        forceLogout();
        return Promise.reject(error);
      }

      try {
        if (!refreshPromise) {
          refreshPromise = axios
            .post(`${API_BASE_URL}/auth/refresh/`, { refresh: refreshToken })
            .finally(() => {
              refreshPromise = null;
            });
        }
        const response = await refreshPromise;

        const { access, refresh } = response.data;
        useAuthStore.getState().setAccessToken(access);
        if (refresh) {
          useAuthStore.getState().setRefreshToken(refresh);
        }

        originalRequest.headers.Authorization = `Bearer ${access}`;
        return client(originalRequest);
      } catch (refreshError) {
        forceLogout();
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default client;
