import { eachDayOfInterval, endOfYear, format, getDay, parseISO, startOfYear } from 'date-fns';
import { useRef, useState, type MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import type { ActivityHeatmapPoint } from '../../api/client';
import { cn } from '../../lib/utils';
import { Card, CardTitle, Skeleton } from '../ui/Card';

interface ActivityHeatmapProps {
  data: ActivityHeatmapPoint[];
  loading: boolean;
  year: number;
  /** Where a day with messages links to. */
  dayPath?: (date: string) => string;
  /** The year's own page, linked from the card header. */
  yearPath?: string;
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

type HoverTip = { x: number; y: number; date: string; count: number };

export function ActivityHeatmap({ data, loading, year, dayPath, yearPath }: ActivityHeatmapProps) {
  const [hoverTip, setHoverTip] = useState<HoverTip | null>(null);
  const heatmapRef = useRef<HTMLDivElement | null>(null);
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

  function showTip(event: MouseEvent<HTMLElement>, date: string, count: number) {
    const cellRect = event.currentTarget.getBoundingClientRect();
    const heatmapRect = heatmapRef.current?.getBoundingClientRect();
    if (!heatmapRect) return;

    setHoverTip({
      x: cellRect.left - heatmapRect.left + cellRect.width / 2,
      y: cellRect.top - heatmapRect.top,
      date,
      count,
    });
  }

  return (
    <Card className="col-span-2">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <CardTitle>Activity Heatmap</CardTitle>
          <p className="text-sm text-slate-500">
            Daily message count for {year}{dayPath ? ' — click a day to see its messages' : ''}
            {yearPath ? (
              <>
                {' · '}
                <Link to={yearPath} className="font-medium text-brand-600 underline-offset-2 hover:underline dark:text-brand-500">Year in review</Link>
              </>
            ) : null}
          </p>
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
        <div ref={heatmapRef} className="relative overflow-x-auto rounded-xl bg-slate-50 p-4 dark:bg-slate-950/40">
          <div className="grid grid-flow-col grid-rows-7 gap-1">
            {cells.map((cell) => {
              if (!cell.date) return <div key={cell.key} className="h-3 w-3 bg-transparent" />;

              const label = `${format(parseISO(cell.date), 'MMMM d, yyyy')}: ${cell.count} ${cell.count === 1 ? 'message' : 'messages'}`;
              const swatch = <div className={cn('h-3 w-3 rounded-sm', intensityClass(cell.count))} />;
              const hoverProps = {
                onMouseEnter: (event: MouseEvent<HTMLElement>) => showTip(event, cell.date, cell.count),
                onMouseLeave: () => setHoverTip(null),
              };

              // Out of the tab order: a year of cells would be hundreds of stops
              // before the next card. The Search page's date filters reach the
              // same messages by keyboard.
              return dayPath && cell.count > 0 ? (
                <Link
                  key={cell.key}
                  to={dayPath(cell.date)}
                  tabIndex={-1}
                  aria-label={label}
                  className="block h-3 w-3 rounded-sm hover:ring-2 hover:ring-slate-500"
                  {...hoverProps}
                >
                  {swatch}
                </Link>
              ) : (
                <div key={cell.key} className="h-3 w-3" aria-label={label} {...hoverProps}>
                  {swatch}
                </div>
              );
            })}
          </div>
          {hoverTip ? (
            <div
              role="tooltip"
              className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full rounded-md bg-slate-900 px-2 py-1.5 text-xs text-white shadow-lg dark:bg-slate-700"
              style={{ left: hoverTip.x, top: hoverTip.y - 6 }}
            >
              <div className="font-medium">{format(parseISO(hoverTip.date), 'MMM d, yyyy')}</div>
              <div className="text-slate-300 dark:text-slate-200">
                Total messages: <span className="tabular-nums text-white">{hoverTip.count}</span>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </Card>
  );
}
