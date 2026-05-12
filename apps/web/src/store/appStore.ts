import { create } from 'zustand';

export type Period = 'day' | 'week' | 'month' | 'year' | 'all';
export type Theme = 'light' | 'dark';

interface AppState {
  period: Period;
  theme: Theme;
  setPeriod: (period: Period) => void;
  toggleTheme: () => void;
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
  setPeriod: (period) => set({ period }),
  toggleTheme: () => set((state) => ({ theme: state.theme === 'light' ? 'dark' : 'light' })),
}));
