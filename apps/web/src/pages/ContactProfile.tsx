import { format } from 'date-fns';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, type ContactProfile as Profile } from '../api/client';
import { Card, CardTitle, Skeleton } from '../components/ui/Card';
import { ListCard, ListRow, StatCard } from '../components/ui/cards';
import { ScanNote } from '../components/ui/ScanNote';
import { formatBytes, formatDuration, formatNumber } from '../lib/utils';
import { useAppStore } from '../store/appStore';

function shortDate(value: string | null): string {
  return value ? format(new Date(value), 'd MMM yyyy') : '—';
}

/** Archives label one-to-one chats 'dm'; the fixtures say 'direct'. */
function kindLabel(kind: string): string {
  if (kind === 'group') return 'Group chat';
  return kind === 'dm' || kind === 'direct' ? 'Direct chat' : `${kind} chat`;
}

/** Two counts as a labelled split bar; the shape reads faster than the numbers. */
function SplitBar({ leftLabel, left, rightLabel, right }: { leftLabel: string; left: number; rightLabel: string; right: number }) {
  const total = left + right;
  const leftPct = total === 0 ? 50 : Math.round((left / total) * 100);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
        <span>{leftLabel} {formatNumber(left)}</span>
        <span>{rightLabel} {formatNumber(right)}</span>
      </div>
      <div className="flex h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div className="bg-brand-500" style={{ width: `${leftPct}%` }} />
        <div className="bg-slate-400 dark:bg-slate-500" style={{ width: `${100 - leftPct}%` }} />
      </div>
    </div>
  );
}

export function ContactProfile() {
  const { jid = '' } = useParams();
  const navigate = useNavigate();
  const dataVersion = useAppStore((state) => state.dataVersion);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setProfile(null);

    api.contactProfile(jid)
      .then((result) => {
        if (active) setProfile(result);
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
  }, [dataVersion, jid]);

  if (error) {
    return (
      <main className="p-8">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-red-900">
          <h2 className="text-xl font-semibold">Cannot load this profile</h2>
          <p className="mt-2 text-sm">{error}</p>
          <Link to="/people" className="mt-5 inline-block rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white">
            Back to People
          </Link>
        </div>
      </main>
    );
  }

  if (loading || !profile) {
    return (
      <main className="space-y-6 p-8">
        <Skeleton className="h-12 w-72" />
        <div className="grid grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-72" />
      </main>
    );
  }

  const { totals, latency, initiation, lastWord, longestSilence } = profile;

  return (
    <main className="space-y-6 p-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-500">{kindLabel(profile.kind)}</p>
          <h1 className="text-3xl font-bold text-slate-950 dark:text-slate-50">{profile.name}</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {profile.phone ? `${profile.phone} · ` : ''}
            {shortDate(totals.firstMessageAt)} → {shortDate(totals.lastMessageAt)}
            {totals.daysSinceLastMessage != null ? ` · quiet for ${totals.daysSinceLastMessage} days` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate(`/chats?contact=${encodeURIComponent(profile.jid)}`)}
          className="rounded-full bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
        >
          Open conversation
        </button>
      </header>

      <section className="grid grid-cols-4 gap-4">
        <StatCard label="Messages" value={formatNumber(totals.messages)} loading={false} />
        <StatCard label="Media" value={formatNumber(totals.media)} loading={false} />
        <StatCard label="Active days" value={formatNumber(totals.activeDays)} loading={false} />
        <StatCard
          label="Longest silence"
          value={longestSilence ? `${formatNumber(longestSilence.days)} days` : 'Never quiet'}
          loading={false}
        />
      </section>

      <section className="grid grid-cols-2 gap-6">
        <Card className="dark:border-slate-800 dark:bg-slate-900">
          <CardTitle className="dark:text-slate-50">Balance</CardTitle>
          <div className="mt-4 space-y-4">
            <SplitBar leftLabel="You sent" left={totals.sentByMe} rightLabel="They sent" right={totals.sentByThem} />
            <SplitBar leftLabel="You opened" left={initiation.byMe} rightLabel="They opened" right={initiation.byThem} />
            <SplitBar leftLabel="You closed" left={lastWord.mine} rightLabel="They closed" right={lastWord.theirs} />
            <p className="text-xs text-slate-500 dark:text-slate-400">
              A conversation opens after a gap of four hours or more; whoever sent the message before that gap closed the previous one.
            </p>
          </div>
        </Card>

        <Card className="dark:border-slate-800 dark:bg-slate-900">
          <CardTitle className="dark:text-slate-50">Turnaround</CardTitle>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-slate-50 px-4 py-3 dark:bg-slate-800">
              <p className="font-semibold text-brand-600 dark:text-brand-400">You reply in</p>
              <p className="mt-1 text-2xl font-bold text-slate-950 dark:text-slate-50">{formatDuration(latency.mine.medianSeconds)}</p>
              <p className="mt-1 text-xs text-slate-500">p90 {formatDuration(latency.mine.p90Seconds)} · {formatNumber(latency.mine.count)} replies</p>
            </div>
            <div className="rounded-xl bg-slate-50 px-4 py-3 dark:bg-slate-800">
              <p className="font-semibold text-slate-600 dark:text-slate-300">They reply in</p>
              <p className="mt-1 text-2xl font-bold text-slate-950 dark:text-slate-50">{formatDuration(latency.theirs.medianSeconds)}</p>
              <p className="mt-1 text-xs text-slate-500">p90 {formatDuration(latency.theirs.p90Seconds)} · {formatNumber(latency.theirs.count)} replies</p>
            </div>
          </div>
          {longestSilence ? (
            <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
              Longest gap ran from {shortDate(longestSilence.startedAt)} to {shortDate(longestSilence.endedAt)}.
            </p>
          ) : null}
        </Card>

        <Card className="col-span-2 dark:border-slate-800 dark:bg-slate-900">
          <CardTitle className="dark:text-slate-50">Volume by Month</CardTitle>
          {profile.monthlyVolume.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">No messages to chart.</p>
          ) : (
            <div className="mt-4 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={profile.monthlyVolume} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={24} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={40} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Area name="You" type="monotone" dataKey="sent" stroke="#22c55e" fill="#22c55e30" strokeWidth={2} />
                  <Area name="Them" type="monotone" dataKey="received" stroke="#64748b" fill="#64748b30" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card className="dark:border-slate-800 dark:bg-slate-900">
          <CardTitle className="dark:text-slate-50">When You Talk</CardTitle>
          <div className="mt-4 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={profile.hourOfDay.map((point) => ({ ...point, label: `${point.hour}:00` }))}
                margin={{ left: 0, right: 12, top: 8, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval={2} />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={40} />
                <Tooltip />
                <Bar dataKey="count" fill="#22c55e" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <ListCard title="Media Exchanged">
          {profile.mediaBreakdown.length === 0 ? (
            <p className="rounded-xl bg-slate-50 px-3 py-4 text-sm text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              Nothing but text in this chat.
            </p>
          ) : profile.mediaBreakdown.map((item) => (
            <ListRow
              key={item.mediaType}
              label={<span className="capitalize">{item.mediaType}</span>}
              value={`${formatNumber(item.count)} · ${formatBytes(item.totalBytes)}`}
            />
          ))}
        </ListCard>

        <Card className="dark:border-slate-800 dark:bg-slate-900">
          <CardTitle className="dark:text-slate-50">What You Talk About</CardTitle>
          <div className="mt-4 flex flex-wrap gap-2">
            {profile.topWords.map((term) => (
              <Link
                key={term.text}
                to={`/search?q=${encodeURIComponent(term.text)}`}
                className="rounded-full bg-brand-50 px-3 py-1 text-sm font-medium text-brand-600 transition hover:bg-brand-100 dark:bg-brand-600/20 dark:text-brand-50"
                style={{ fontSize: `${Math.min(22, 12 + term.value)}px` }}
              >
                {term.text}
              </Link>
            ))}
          </div>
          {profile.topEmojis.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {profile.topEmojis.map((item) => (
                <span key={item.emoji} className="flex items-center gap-1 rounded-xl bg-slate-50 px-3 py-1.5 text-sm dark:bg-slate-800">
                  <span className="text-xl">{item.emoji}</span>
                  <span className="text-slate-500">{formatNumber(item.count)}</span>
                </span>
              ))}
            </div>
          )}
          <ScanNote scan={profile.scan} />
        </Card>
      </section>
    </main>
  );
}
