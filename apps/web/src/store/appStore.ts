import { create } from 'zustand';

export type Period = 'day' | 'week' | 'month' | 'year' | 'all';

interface AppState {
  period: Period;
  setPeriod: (period: Period) => void;
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
  setPeriod: (period) => set({ period }),
}));
