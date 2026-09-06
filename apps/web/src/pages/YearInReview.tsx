import { format } from 'date-fns';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, type OverviewStats, type YearInReview as Review } from '../api/client';
import { Card, CardTitle, Skeleton } from '../components/ui/Card';
import { ListCard, ListRow, StatCard } from '../components/ui/cards';
import { ScanNote } from '../components/ui/ScanNote';
import { formatBytes, formatNumber, cn } from '../lib/utils';
import { useAppStore } from '../store/appStore';

function archiveYears(overview: OverviewStats | null): number[] {
  if (!overview?.oldestMessage || !overview.newestMessage) return [new Date().getFullYear()];
  const first = new Date(overview.oldestMessage).getFullYear();
  const last = new Date(overview.newestMessage).getFullYear();
  const years: number[] = [];
  for (let year = last; year >= first; year -= 1) years.push(year);
  return years;
}

export function YearInReview() {
  const params = useParams();
  const navigate = useNavigate();
  const dataVersion = useAppStore((state) => state.dataVersion);
  const year = Number(params.year) || new Date().getFullYear();
  const [review, setReview] = useState<Review | null>(null);
  const [overview, setOverview] = useState<OverviewStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api.overview()
      .then((stats) => {
        if (active) setOverview(stats);
      })
      .catch(() => {
        // The year picker falls back to the current year; the review itself
        // reports its own failure below.
      });

    return () => {
      active = false;
    };
  }, [dataVersion]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    api.yearInReview(year)
      .then((result) => {
        if (active) setReview(result);
      })
      .catch((err: Error) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [dataVersion, year]);

  const years = archiveYears(overview);

  return (
    <main className="space-y-6 p-8">
      <header className="space-y-3">
        <h1 className="text-3xl font-bold text-slate-950 dark:text-slate-50">{year} in review</h1>
        <div className="flex flex-wrap gap-2">
          {years.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => navigate(`/years/${value}`)}
              className={cn(
                'rounded-full px-3 py-1.5 text-sm font-semibold transition',
                value === year
                  ? 'bg-brand-600 text-white dark:bg-brand-500'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200',
              )}
            >
              {value}
            </button>
          ))}
        </div>
      </header>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</div>
      ) : null}

      {loading || !review ? (
        <div className="space-y-6">
          <div className="grid grid-cols-4 gap-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div>
          <Skeleton className="h-72" />
        </div>
      ) : review.totals.messages === 0 ? (
        <Card className="dark:border-slate-800 dark:bg-slate-900">
          <p className="text-sm text-slate-500 dark:text-slate-400">Nothing in the archive for {year}.</p>
        </Card>
      ) : (
        <>
          <section className="grid grid-cols-4 gap-4">
            <StatCard label="Messages" value={formatNumber(review.totals.messages)} loading={false} />
            <StatCard label="Chats" value={formatNumber(review.totals.chats)} loading={false} />
            <StatCard label="Active days" value={`${review.totals.activeDays} of 365`} loading={false} />
            <StatCard label="Longest streak" value={`${review.longestStreakDays} days`} loading={false} />
          </section>

          <section className="grid grid-cols-3 gap-4 text-sm">
            <Highlight
              title="Busiest day"
              value={review.busiestDay ? format(new Date(`${review.busiestDay.date}T00:00:00`), 'd MMMM') : '—'}
              detail={review.busiestDay ? `${formatNumber(review.busiestDay.count)} messages` : ''}
            />
            <Highlight
              title="Busiest month"
              value={review.busiestMonth ? format(new Date(`${review.busiestMonth.month}-01T00:00:00`), 'MMMM') : '—'}
              detail={review.busiestMonth ? `${formatNumber(review.busiestMonth.count)} messages` : ''}
            />
            <Highlight
              title="Versus last year"
              value={formatChange(review.previousYear?.changeRatio)}
              detail={review.previousYear ? `${formatNumber(review.previousYear.messages)} in ${year - 1}` : 'Nothing archived for the year before'}
            />
          </section>

          <Card className="dark:border-slate-800 dark:bg-slate-900">
            <CardTitle className="dark:text-slate-50">Month by Month</CardTitle>
            <div className="mt-4 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={review.monthlyVolume} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={44} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar name="You" dataKey="sent" stackId="a" fill="#22c55e" radius={[0, 0, 0, 0]} />
                  <Bar name="Them" dataKey="received" stackId="a" fill="#64748b" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <section className="grid grid-cols-2 gap-6">
            <ListCard title="Top Chats">
              {review.topChats.map((chat) => (
                <ListRow
                  key={chat.jid}
                  label={<Link to={`/contacts/${encodeURIComponent(chat.jid)}`} className="underline-offset-2 hover:underline">{chat.name}</Link>}
                  value={`${formatNumber(chat.messageCount)} messages`}
                />
              ))}
            </ListCard>

            <ListCard title="New That Year" hint="Chats whose very first message landed in this year">
              {review.newContacts.length === 0 ? (
                <p className="rounded-xl bg-slate-50 px-3 py-4 text-sm text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                  No new conversations started in {year}.
                </p>
              ) : review.newContacts.map((contact) => (
                <ListRow
                  key={contact.jid}
                  label={<Link to={`/contacts/${encodeURIComponent(contact.jid)}`} className="underline-offset-2 hover:underline">{contact.name}</Link>}
                  value={`${format(new Date(contact.firstMessageAt), 'd MMM')} · ${formatNumber(contact.messageCount)} messages`}
                />
              ))}
            </ListCard>

            <ListCard title="Media">
              {review.mediaBreakdown.length === 0 ? (
                <p className="rounded-xl bg-slate-50 px-3 py-4 text-sm text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                  No media shared in {year}.
                </p>
              ) : review.mediaBreakdown.map((item) => (
                <ListRow
                  key={item.mediaType}
                  label={<span className="capitalize">{item.mediaType}</span>}
                  value={`${formatNumber(item.count)} · ${formatBytes(item.totalBytes)}`}
                />
              ))}
            </ListCard>

            <Card className="dark:border-slate-800 dark:bg-slate-900">
              <CardTitle className="dark:text-slate-50">Words and Emoji of {year}</CardTitle>
              <div className="mt-4 flex flex-wrap gap-2">
                {review.topWords.map((term) => (
                  <Link
                    key={term.text}
                    to={`/search?q=${encodeURIComponent(term.text)}`}
                    className="rounded-full bg-brand-50 px-3 py-1 text-sm font-medium text-brand-600 transition hover:bg-brand-100 dark:bg-brand-600/20 dark:text-brand-50"
                  >
                    {term.text}
                  </Link>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {review.topEmojis.map((item) => (
                  <span key={item.emoji} className="flex items-center gap-1 rounded-xl bg-slate-50 px-3 py-1.5 text-sm dark:bg-slate-800">
                    <span className="text-xl">{item.emoji}</span>
                    <span className="text-slate-500">{formatNumber(item.count)}</span>
                  </span>
                ))}
              </div>
              <ScanNote scan={review.scan} unit="text messages" />
            </Card>
          </section>
        </>
      )}
    </main>
  );
}

/**
 * A percentage stops carrying meaning past a few hundred percent — a year that
 * follows a near-empty one reads as "+18007%", which nobody can picture. Past
 * that point a multiplier is the readable form.
 */
function formatChange(ratio: number | null | undefined): string {
  if (ratio == null) return 'No comparison';
  if (ratio >= 3) return `${(ratio + 1).toFixed(ratio >= 10 ? 0 : 1)}× more`;
  return `${ratio > 0 ? '+' : ''}${Math.round(ratio * 100)}%`;
}

function Highlight({ title, value, detail }: { title: string; value: string; detail: string }) {
  return (
    <Card className="dark:border-slate-800 dark:bg-slate-900">
      <p className="text-sm font-medium text-slate-500">{title}</p>
      <p className="mt-1 text-2xl font-bold text-slate-950 dark:text-slate-50">{value}</p>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{detail}</p>
    </Card>
  );
}
