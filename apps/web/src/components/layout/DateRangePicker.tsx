import { PERIOD_OPTIONS, useAppStore, type Period } from '../../store/appStore';
import { cn } from '../../lib/utils';

export function DateRangePicker() {
  const period = useAppStore((state) => state.period);
  const setPeriod = useAppStore((state) => state.setPeriod);

  return (
    <div className="flex rounded-full border border-slate-200 bg-white p-1 shadow-sm" aria-label="Dashboard period">
      {PERIOD_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => setPeriod(option.value as Period)}
          className={cn(
            'rounded-full px-4 py-2 text-sm font-medium transition',
            period === option.value
              ? 'bg-brand-500 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
