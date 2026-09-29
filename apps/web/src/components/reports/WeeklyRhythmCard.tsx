import type { WeeklyRhythm } from '../../api/client';
import { cn, formatNumber } from '../../lib/utils';
import { Card, CardTitle, Skeleton } from '../ui/Card';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_NAMES = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];
/** Monday first, matching the activity heatmap above it. */
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

/** Scaled to the busiest cell, since absolute counts differ by orders of magnitude between periods. */
function intensityClass(count: number, max: number): string {
  if (count === 0 || max === 0) return 'bg-slate-100 dark:bg-slate-800';
  const share = count / max;
  if (share < 0.15) return 'bg-emerald-200 dark:bg-emerald-900';
  if (share < 0.35) return 'bg-emerald-300 dark:bg-emerald-700';
  if (share < 0.65) return 'bg-emerald-500';
  return 'bg-emerald-700 dark:bg-emerald-400';
}

/** Hour × weekday grid: when the week actually happens. */
export function WeeklyRhythmCard({ data, loading }: { data: WeeklyRhythm | null; loading: boolean }) {
  const counts = new Map((data?.cells ?? []).map((cell) => [cell.day * 24 + cell.hour, cell.count]));
  const max = data?.peak?.count ?? 0;

  return (
    <Card className="col-span-2 dark:border-slate-800 dark:bg-slate-900">
      <CardTitle className="dark:text-slate-50">Weekly Rhythm</CardTitle>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        {data?.peak
          ? `Busiest slot: ${DAY_NAMES[data.peak.day]} at ${data.peak.hour}:00 — ${formatNumber(data.peak.count)} of ${formatNumber(data.total)} messages`
          : 'Messages by hour and weekday, in your timezone'}
      </p>
      {loading || !data ? <Skeleton className="mt-4 h-48" /> : data.total === 0 ? (
        <p className="mt-4 rounded-xl bg-slate-50 px-3 py-4 text-sm text-slate-500 dark:bg-slate-800 dark:text-slate-400">
          No messages in this period.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <div
            role="grid"
            aria-label="Messages by weekday and hour"
            className="grid min-w-[40rem] gap-1"
            style={{ gridTemplateColumns: '2.5rem repeat(24, minmax(0, 1fr))' }}
          >
            <div />
            {HOURS.map((hour) => (
              <div key={hour} className="text-center text-[10px] text-slate-400">
                {hour % 3 === 0 ? hour : ''}
              </div>
            ))}
            {DAY_ORDER.map((day) => (
              <div key={day} role="row" className="contents">
                <div className="flex items-center text-xs text-slate-500">{DAY_LABELS[day]}</div>
                {HOURS.map((hour) => {
                  const count = counts.get(day * 24 + hour) ?? 0;
                  const label = `${DAY_LABELS[day]} ${hour}:00 — ${formatNumber(count)} ${count === 1 ? 'message' : 'messages'}`;
                  return (
                    <div
                      key={hour}
                      role="gridcell"
                      title={label}
                      aria-label={label}
                      className={cn('h-5 rounded-sm', intensityClass(count, max))}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
