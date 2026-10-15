import { create } from 'zustand';

export type Period = 'day' | 'week' | 'month' | 'year' | 'all';
export type Theme = 'light' | 'dark';

interface AppState {
  period: Period;
  theme: Theme;
  /**
   * Bumped to tell every page its data is stale. Pages list it in their fetch
   * effect dependencies, which is the whole refresh mechanism — there is no
   * client-side cache to invalidate, so re-running the effects is enough.
   */
  dataVersion: number;
  setPeriod: (period: Period) => void;
  toggleTheme: () => void;
  invalidateData: () => void;
}

export const PERIOD_OPTIONS: Array<{ value: Period; label: string }> = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
  { value: 'all', label: 'All' },
];

const THEME_STORAGE_KEY = 'wacrawl:theme';

function resolveInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'dark' || stored === 'light') return stored;
  } catch {
    // Storage may be unavailable in private browsing contexts.
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export const useAppStore = create<AppState>((set) => ({
  period: 'year',
  theme: resolveInitialTheme(),
  dataVersion: 0,
  setPeriod: (period) => set({ period }),
  toggleTheme: () =>
    set((state) => {
      const next: Theme = state.theme === 'light' ? 'dark' : 'light';
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, next);
      } catch {
        // Ignore storage write errors in restricted contexts.
      }
      return { theme: next };
    }),
  invalidateData: () => set((state) => ({ dataVersion: state.dataVersion + 1 })),
}));
