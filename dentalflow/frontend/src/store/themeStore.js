import { create } from 'zustand';

const read = () => {
  try {
    return localStorage.getItem('theme-mode') === 'dark';
  } catch {
    return false;
  }
};

function apply(isDark) {
  try {
    localStorage.setItem('theme-mode', isDark ? 'dark' : 'light');
  } catch {
    /* private mode */
  }
  document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', isDark ? '#0e1412' : '#f3f5f3');
}

export const useThemeStore = create((set) => ({
  isDarkMode: read(),
  toggleDarkMode: () =>
    set((state) => {
      apply(!state.isDarkMode);
      return { isDarkMode: !state.isDarkMode };
    }),
  setDarkMode: (isDarkMode) => {
    apply(isDarkMode);
    set({ isDarkMode });
  },
}));
