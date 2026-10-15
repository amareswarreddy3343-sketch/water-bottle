/**
 * App-wide UI state: clinic settings (comorbidity list, tooth colours), toasts and
 * the confirmation dialog.
 */
import { create } from 'zustand';
import api from '../api';
import { localDateISO } from '../utils/date';

export const DEFAULT_SETTINGS = {
  comorbidity_options: [
    'Diabetes',
    'Hypertension',
    'Cardiac disease',
    'Asthma / respiratory',
    'Thyroid disorder',
    'Bleeding disorder / on blood thinners',
    'Kidney disease',
    'Liver disease / hepatitis',
    'Epilepsy',
    'Pregnancy',
    'Drug allergy',
    'Smoking / tobacco',
  ],
  tooth_statuses: [
    { id: 'missing', label: 'Missing / extracted', color: '#111111', part: 'both' },
    { id: 'caries', label: 'Caries', color: '#9ca3af', part: 'crown' },
    { id: 'filled', label: 'Filled', color: '#3b82f6', part: 'crown' },
    { id: 'rct', label: 'Root canal treated', color: '#f59e0b', part: 'root' },
    { id: 'crown_cap', label: 'Crown / cap', color: '#a855f7', part: 'crown' },
    { id: 'periapical', label: 'Infection (periapical)', color: '#dc2626', part: 'root' },
  ],
  max_tooth_statuses: 10,
};

export const useSettings = create((set, get) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,
  load: async (force = false) => {
    if (get().loaded && !force) return get().settings;
    try {
      const { settings } = await api.getSettings();
      set({ settings, loaded: true });
      return settings;
    } catch {
      return get().settings;
    }
  },
  replace: (settings) => set({ settings, loaded: true }),
}));

/**
 * The clinic's date comes from the server (Asia/Kolkata), not from the phone, so
 * "today" is the same on every device even if a phone's clock or time zone is wrong.
 */
export const useClinic = create((set, get) => ({
  today: localDateISO(),
  emailEnabled: false,
  loadedAt: 0,
  load: async (force = false) => {
    if (!force && Date.now() - get().loadedAt < 60000) return get().today;
    try {
      const meta = await api.meta();
      set({ today: meta.today, emailEnabled: Boolean(meta.email_enabled), loadedAt: Date.now() });
      return meta.today;
    } catch {
      return get().today;
    }
  },
  setToday: (today) => {
    if (today && today !== get().today) set({ today });
  },
}));

/** Today's date at the clinic ('YYYY-MM-DD') */
export const useToday = () => useClinic((s) => s.today);

let toastId = 0;
export const useToasts = create((set) => ({
  toasts: [],
  push: (message, kind = 'info') => {
    const id = ++toastId;
    set((s) => ({ toasts: [...s.toasts.slice(-2), { id, message, kind }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), kind === 'error' ? 5000 : 2800);
  },
}));

export const toast = (message) => useToasts.getState().push(message, 'info');
export const toastError = (message) => useToasts.getState().push(message, 'error');

export const useConfirmStore = create((set) => ({
  request: null,
  open: (request) =>
    new Promise((resolve) => {
      set({ request: { ...request, resolve } });
    }),
  close: (result) =>
    set((s) => {
      s.request?.resolve(result);
      return { request: null };
    }),
}));

/** await confirmAction({ title, message, confirmLabel, danger }) → true / false */
export const confirmAction = (request) => useConfirmStore.getState().open(request);
