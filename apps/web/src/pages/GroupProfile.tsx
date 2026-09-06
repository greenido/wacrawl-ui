import { format } from 'date-fns';
import { Crown, LogOut } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, type GroupProfile as Profile } from '../api/client';
import { Card, CardTitle, Skeleton } from '../components/ui/Card';
import { ListCard, ListRow, StatCard } from '../components/ui/cards';
import { ScanNote } from '../components/ui/ScanNote';
import { displayNameOrUnknown, formatBytes, formatNumber } from '../lib/utils';

/** A silent-members list is a signal, not a directory; ten rows carry it. */
const QUIET_ROWS_SHOWN = 10;

function shortDate(value: string | null): string {
  return value ? format(new Date(value), 'd MMM yyyy') : '—';
}

/**
 * A label for someone the archive holds no name for.
 *
 * In a public group most members are bare `@lid` identifiers, and rendering
 * every one of them as "Unknown" turns a leaderboard into a column of identical
 * rows. The trailing digits are meaningless on their own but they do tell two
 * strangers apart, which is the whole job here.
 */
function memberLabel(name: string, jid: string): string {
  const resolved = displayNameOrUnknown(name, jid);
  if (resolved !== 'Unknown') return resolved;
  const digits = jid.replace(/\D/g, '');
  return digits ? `Unknown ·${digits.slice(-4)}` : 'Unknown';
}

function percent(share: number): string {
  if (share === 0) return '0%';
  return share < 0.01 ? '<1%' : `${Math.round(share * 100)}%`;
}

/**
 * Talk share as a bar the width of the row, so the shape of a lopsided group is
 * visible before any of the numbers are read.
 */
function ParticipantRow({ name, count, share, isAdmin, isActive }: {
  name: string;
  count: number;
  share: number;
  isAdmin: boolean;
  isActive: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate font-medium dark:text-slate-100">{name}</span>
          {isAdmin ? <Crown className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-label="Admin" /> : null}
          {isActive ? null : <LogOut className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-label="No longer a member" />}
        </span>
        <span className="shrink-0 text-slate-500">{formatNumber(count)} · {percent(share)}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.max(share * 100, 1)}%` }} />
      </div>
    </div>
  );
}

export function GroupProfile() {
  const { jid = '' } = useParams();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setProfile(null);

    api.groupProfile(jid)
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
  }, [jid]);

  if (error) {
    return (
      <main className="p-8">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-red-900">
          <h2 className="text-xl font-semibold">Cannot load this group</h2>
          <p className="mt-2 text-sm">{error}</p>
          <Link to="/groups" className="mt-5 inline-block rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white">
            Back to Groups
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

  const { totals, roster, concentration } = profile;

  return (
    <main className="space-y-6 p-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-500">Group chat</p>
          <h1 className="text-3xl font-bold text-slate-950 dark:text-slate-50">{profile.name}</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {profile.createdAt ? `Created ${shortDate(profile.createdAt)} · ` : ''}
            {profile.ownerName ? `by ${profile.ownerName} · ` : ''}
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

      {profile.hasRoster ? null : (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
          This archive has no membership records, so the roster figures below are empty. Everything derived from messages is unaffected.
        </div>
      )}

      <section className="grid grid-cols-4 gap-4">
        <StatCard label="Members" value={profile.hasRoster ? formatNumber(roster.active) : '—'} loading={false} />
        <StatCard label="Messages" value={formatNumber(totals.messages)} loading={false} />
        <StatCard label="Sent by me" value={formatNumber(totals.sentByMe)} loading={false} />
        <StatCard label="Active days" value={formatNumber(totals.activeDays)} loading={false} />
      </section>

      <section className="grid grid-cols-2 gap-6">
        <Card className="dark:border-slate-800 dark:bg-slate-900">
          <CardTitle className="dark:text-slate-50">Who Carries It</CardTitle>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Share of everything other people have sent here. Your own messages are excluded.
          </p>
          <div className="mt-4 space-y-3">
            {profile.topParticipants.length === 0 ? (
              <p className="rounded-xl bg-slate-50 px-3 py-4 text-sm text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                Nobody else has posted in this group.
              </p>
            ) : profile.topParticipants.map((person) => (
              <ParticipantRow
                key={person.jid}
                name={memberLabel(person.name, person.jid)}
                count={person.messageCount}
                share={person.share}
                isAdmin={person.isAdmin}
                isActive={person.isActive}
              />
            ))}
          </div>
        </Card>

        <div className="space-y-6">
          <Card className="dark:border-slate-800 dark:bg-slate-900">
            <CardTitle className="dark:text-slate-50">The Room</CardTitle>
            {profile.hasRoster ? (
              <>
                <div className="mt-4 grid grid-cols-3 gap-3 text-center text-sm">
                  <Tally label="Talking" value={roster.speakers} />
                  <Tally label="Silent" value={roster.lurkers} tone={roster.lurkers > roster.speakers ? 'warn' : undefined} />
                  <Tally label="Left" value={roster.departed} />
                </div>
                <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
                  {roster.others === 0
                    ? 'You are the only member on record.'
                    : `${percent(roster.lurkers / roster.others)} of the ${formatNumber(roster.others)} people here have never posted. ${formatNumber(roster.admins)} of them ${roster.admins === 1 ? 'is an admin' : 'are admins'}.`}
                </p>
              </>
            ) : (
              <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">No membership records in this archive.</p>
            )}
          </Card>

          <Card className="dark:border-slate-800 dark:bg-slate-900">
            <CardTitle className="dark:text-slate-50">Concentration</CardTitle>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-slate-50 px-4 py-3 dark:bg-slate-800">
                <p className="font-semibold text-brand-600 dark:text-brand-400">Loudest member</p>
                <p className="mt-1 text-2xl font-bold text-slate-950 dark:text-slate-50">{percent(concentration.topOneShare)}</p>
              </div>
              <div className="rounded-xl bg-slate-50 px-4 py-3 dark:bg-slate-800">
                <p className="font-semibold text-slate-600 dark:text-slate-300">Loudest five</p>
                <p className="mt-1 text-2xl font-bold text-slate-950 dark:text-slate-50">{percent(concentration.topFiveShare)}</p>
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
              {concentration.topFiveShare >= 0.8 && roster.others > 10
                ? 'A handful of people account for nearly everything — this is a broadcast channel wearing a group’s clothes.'
                : 'Share of messages held by the most active member, and by the most active five.'}
            </p>
          </Card>
        </div>

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
                  <Area name="Everyone else" type="monotone" dataKey="received" stroke="#64748b" fill="#64748b30" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card className="dark:border-slate-800 dark:bg-slate-900">
          <CardTitle className="dark:text-slate-50">When It Talks</CardTitle>
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

        <ListCard
          title="Never Posted"
          hint={profile.quietMembers.length === 0 ? undefined : 'Current members with nothing on record here. Named people and admins first.'}
        >
          {profile.quietMembers.length === 0 ? (
            <p className="rounded-xl bg-slate-50 px-3 py-4 text-sm text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              {profile.hasRoster ? 'Everyone here has posted at least once.' : 'No membership records in this archive.'}
            </p>
          ) : (
            <>
              {profile.quietMembers.slice(0, QUIET_ROWS_SHOWN).map((member) => (
                <ListRow
                  key={member.jid}
                  label={memberLabel(member.name, member.jid)}
                  value={member.isAdmin ? 'Admin' : ''}
                />
              ))}
              {roster.lurkers > QUIET_ROWS_SHOWN ? (
                <p className="px-3 pt-1 text-xs text-slate-500 dark:text-slate-400">
                  and {formatNumber(roster.lurkers - QUIET_ROWS_SHOWN)} more.
                </p>
              ) : null}
            </>
          )}
        </ListCard>

        <ListCard title="Media Shared">
          {profile.mediaBreakdown.length === 0 ? (
            <p className="rounded-xl bg-slate-50 px-3 py-4 text-sm text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              Nothing but text in this group.
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
          <CardTitle className="dark:text-slate-50">What It Talks About</CardTitle>
          <div className="mt-4 flex flex-wrap gap-2">
            {profile.topWords.map((term) => (
              <Link
                key={term.text}
                to={`/search?q=${encodeURIComponent(term.text)}`}
                className="rounded-full bg-brand-50 px-3 py-1 text-sm font-medium text-brand-600 transition hover:bg-brand-100 dark:bg-brand-600/20 dark:text-brand-50"
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

function Tally({ label, value, tone }: { label: string; value: number; tone?: 'warn' }) {
  return (
    <div className="rounded-xl bg-slate-50 px-2 py-3 dark:bg-slate-800">
      <p className={tone === 'warn'
        ? 'text-2xl font-bold text-amber-600 dark:text-amber-400'
        : 'text-2xl font-bold text-slate-950 dark:text-slate-50'}>
        {formatNumber(value)}
      </p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}
