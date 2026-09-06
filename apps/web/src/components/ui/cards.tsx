import type { ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardTitle, ClickableCard, Skeleton } from './Card';

/**
 * Card shells shared by every report.
 *
 * Each takes an optional `onDeepDive`, and becomes a link-role card when given
 * one — otherwise a plain card, so a report with nowhere to drill into does not
 * advertise a click target it does not have.
 */

interface DeepDivable {
  onDeepDive?: () => void;
}

function wrap(content: ReactNode, label: string, onDeepDive?: () => void, className?: string) {
  const shell = className ?? 'dark:border-slate-800 dark:bg-slate-900';
  if (onDeepDive) {
    return (
      <ClickableCard className={shell} onActivate={onDeepDive} aria-label={`Open ${label} deep dive`}>
        {content}
      </ClickableCard>
    );
  }
  return <Card className={shell}>{content}</Card>;
}

interface StatCardProps extends DeepDivable {
  label: string;
  value: string;
  loading: boolean;
}

export function StatCard({ label, value, loading, onDeepDive }: StatCardProps) {
  const content = (
    <>
      <p className="text-sm font-medium text-slate-500">{label}</p>
      {loading ? (
        <Skeleton className="mt-3 h-8 max-w-full" />
      ) : (
        <p
          className="mt-2 break-words font-semibold leading-tight tracking-tight text-slate-950 dark:text-slate-50"
          style={{ fontSize: 'clamp(0.75rem, calc(0.45rem + 4.5cqw), 1.5rem)' }}
        >
          {value}
        </p>
      )}
    </>
  );

  return wrap(content, label, onDeepDive, '@container min-w-0 p-4 dark:border-slate-800 dark:bg-slate-900');
}

interface CompactBarCardProps extends DeepDivable {
  title: string;
  data: Array<Record<string, string | number>>;
  dataKey: string;
  nameKey: string;
  loading: boolean;
}

export function CompactBarCard({ title, data, dataKey, nameKey, loading, onDeepDive }: CompactBarCardProps) {
  const content = (
    <>
      <CardTitle className="dark:text-slate-50">{title}</CardTitle>
      {loading ? <Skeleton className="mt-4 h-64" /> : (
        <div className="mt-4 h-64 overflow-x-auto">
          <BarChart width={520} height={256} data={data} margin={{ left: 0, right: 12, top: 12, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey={nameKey} tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} width={36} />
            <Tooltip />
            <Bar dataKey={dataKey} fill="#22c55e" radius={[8, 8, 0, 0]} />
          </BarChart>
        </div>
      )}
    </>
  );

  return wrap(content, title, onDeepDive);
}

interface ListCardProps extends DeepDivable {
  title: string;
  /** Optional one-liner explaining what the numbers mean. */
  hint?: string;
  children: ReactNode;
}

export function ListCard({ title, hint, children, onDeepDive }: ListCardProps) {
  const content = (
    <>
      <CardTitle className="dark:text-slate-50">{title}</CardTitle>
      {hint ? <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</p> : null}
      <div className="mt-4 space-y-3">{children}</div>
    </>
  );

  return wrap(content, title, onDeepDive);
}

/** One row of a list card: a name on the left, a figure on the right. */
export function ListRow({ label, value, title }: { label: ReactNode; value: ReactNode; title?: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800">
      <span className="mr-2 truncate font-medium dark:text-slate-100">{label}</span>
      <span className="shrink-0 text-slate-500" title={title}>{value}</span>
    </div>
  );
}
