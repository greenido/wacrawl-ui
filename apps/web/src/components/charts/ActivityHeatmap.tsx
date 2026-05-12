import { eachDayOfInterval, endOfYear, format, getDay, startOfYear } from 'date-fns';
import type { ActivityHeatmapPoint } from '../../api/client';
import { cn } from '../../lib/utils';
import { Card, CardTitle, Skeleton } from '../ui/Card';

interface ActivityHeatmapProps {
  data: ActivityHeatmapPoint[];
  loading: boolean;
  year: number;
}

type HeatmapCell =
  | { key: string; date: string; count: number }
  | { key: string; date?: never; count?: never };

function intensityClass(count: number): string {
  if (count === 0) return 'bg-slate-100';
  if (count < 10) return 'bg-emerald-200';
  if (count < 30) return 'bg-emerald-300';
  if (count < 75) return 'bg-emerald-500';
  return 'bg-emerald-700';
}

export function ActivityHeatmap({ data, loading, year }: ActivityHeatmapProps) {
  const counts = new Map(data.map((point) => [point.date, point.count]));
  const days = eachDayOfInterval({
    start: startOfYear(new Date(year, 0, 1)),
    end: endOfYear(new Date(year, 0, 1)),
  });
  const firstDayOffset = (getDay(days[0]) + 6) % 7;
  const cells: HeatmapCell[] = [...Array.from({ length: firstDayOffset }, (_, index) => ({ key: `empty-${index}` })), ...days.map((day) => {
    const date = format(day, 'yyyy-MM-dd');
    return {
      key: date,
      date,
      count: counts.get(date) ?? 0,
    };
  })];

  return (
    <Card className="col-span-2">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <CardTitle>Activity Heatmap</CardTitle>
          <p className="text-sm text-slate-500">Daily message count for {year}</p>
        </div>
        <div className="flex items-center gap-1 text-xs text-slate-500">
          Less
          <span className="h-3 w-3 rounded-sm bg-slate-100" />
          <span className="h-3 w-3 rounded-sm bg-emerald-200" />
          <span className="h-3 w-3 rounded-sm bg-emerald-300" />
          <span className="h-3 w-3 rounded-sm bg-emerald-500" />
          <span className="h-3 w-3 rounded-sm bg-emerald-700" />
          More
        </div>
      </div>
      {loading ? (
        <Skeleton className="h-40" />
      ) : (
        <div className="overflow-x-auto rounded-xl bg-slate-50 p-4">
          <div className="grid grid-flow-col grid-rows-7 gap-1">
            {cells.map((cell) => (
              <div
                key={cell.key}
                className={cn('h-3 w-3 rounded-sm', cell.date ? intensityClass(cell.count) : 'bg-transparent')}
                title={cell.date ? `${cell.date}: ${cell.count} messages` : undefined}
              />
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
