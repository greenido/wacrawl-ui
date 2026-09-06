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

export const useAppStore = create<AppState>((set) => ({
  period: 'year',
  theme: 'light',
  dataVersion: 0,
  setPeriod: (period) => set({ period }),
  toggleTheme: () => set((state) => ({ theme: state.theme === 'light' ? 'dark' : 'light' })),
  invalidateData: () => set((state) => ({ dataVersion: state.dataVersion + 1 })),
}));
