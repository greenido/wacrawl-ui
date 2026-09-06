import { Area, AreaChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { ConversationDynamics } from '../../api/client';
import { cn } from '../../lib/utils';
import { Card, CardTitle, Skeleton } from '../ui/Card';
import { ScanNote } from '../ui/ScanNote';

const TRAJECTORY_STYLE = {
  growing: { label: 'Growing closer', text: 'text-emerald-500', stroke: '#22c55e', fill: '#22c55e20' },
  fading: { label: 'Drifting apart', text: 'text-red-400', stroke: '#f87171', fill: '#f8717120' },
  stable: { label: 'Stable', text: 'text-slate-400', stroke: '#94a3b8', fill: '#94a3b820' },
} as const;

interface Props {
  data: ConversationDynamics | null;
  loading: boolean;
  onOpenContact: (jid: string) => void;
}

export function ConversationDynamicsSection({ data, loading, onOpenContact }: Props) {
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">Conversation Dynamics &amp; Relationship Insights</h2>
      {loading || !data ? (
        <div className="grid grid-cols-2 gap-6">
          <Card className="dark:border-slate-800 dark:bg-slate-900"><Skeleton className="h-64" /></Card>
          <Card className="dark:border-slate-800 dark:bg-slate-900"><Skeleton className="h-64" /></Card>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-6">
          {data.initiationRatio.length > 0 && (
            <Card className="dark:border-slate-800 dark:bg-slate-900">
              <CardTitle className="dark:text-slate-50">Who Starts Conversations</CardTitle>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Who fires the first message per chat (sessions with 4h+ gap)</p>
              <div className="mt-4 space-y-3">
                {data.initiationRatio.map((item) => {
                  const mePct = Math.round(item.ratio * 100);
                  return (
                    <div key={item.jid} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <ContactLink name={item.name} jid={item.jid} onOpen={onOpenContact} />
                        <span className="shrink-0 text-xs text-slate-500">
                          You {item.initiatedByMe} · Them {item.initiatedByThem}
                        </span>
                      </div>
                      <div className="flex h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                        <div className="bg-brand-500 transition-all duration-500" style={{ width: `${mePct}%` }} title={`You: ${mePct}%`} />
                        <div className="bg-slate-400 transition-all duration-500 dark:bg-slate-500" style={{ width: `${100 - mePct}%` }} title={`Them: ${100 - mePct}%`} />
                      </div>
                    </div>
                  );
                })}
                <div className="flex items-center gap-4 pt-1 text-[10px] text-slate-400">
                  <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-brand-500" /> You</span>
                  <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-slate-400 dark:bg-slate-500" /> Them</span>
                </div>
              </div>
            </Card>
          )}

          {data.conversationDepth.length > 0 && (
            <Card className="dark:border-slate-800 dark:bg-slate-900">
              <CardTitle className="dark:text-slate-50">Conversation Depth</CardTitle>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Average messages per conversation session</p>
              <div className="mt-4 space-y-2">
                {data.conversationDepth.map((item) => {
                  const maxDepth = data.conversationDepth[0]?.avgMessagesPerSession ?? 1;
                  return (
                    <div key={item.jid} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <ContactLink name={item.name} jid={item.jid} onOpen={onOpenContact} />
                        <span className="shrink-0 text-xs text-slate-500">
                          {item.avgMessagesPerSession} msgs · {item.totalSessions} sessions
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                        <div
                          className="h-full rounded-full bg-blue-500 transition-all duration-500"
                          style={{ width: `${Math.round((item.avgMessagesPerSession / maxDepth) * 100)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {data.ghostScore.length > 0 && (
            <Card className="dark:border-slate-800 dark:bg-slate-900">
              <CardTitle className="dark:text-slate-50">Ghost Score</CardTitle>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Messages you sent without a reply within 24 hours. Anything sent in the last day is excluded — it can still be answered.
              </p>
              <div className="mt-4 space-y-2">
                {data.ghostScore.map((item) => {
                  const pct = Math.round(item.ghostRate * 100);
                  const color = pct > 60 ? 'bg-red-500' : pct > 30 ? 'bg-amber-500' : 'bg-emerald-500';
                  return (
                    <div key={item.jid} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800">
                      <ContactLink name={item.name} jid={item.jid} onOpen={onOpenContact} />
                      <span className="flex shrink-0 items-center gap-2">
                        <span className={cn('inline-block h-2 w-2 rounded-full', color)} />
                        <span className="text-slate-500">{pct}% ghosted</span>
                        <span className="text-xs text-slate-400">({item.ghostedCount}/{item.totalSent})</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {data.lateNightTexters.length > 0 && (
            <Card className="dark:border-slate-800 dark:bg-slate-900">
              <CardTitle className="dark:text-slate-50">Late-Night Texters</CardTitle>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Who you talk to after midnight (12am-5am)</p>
              <div className="mt-4 space-y-2">
                {data.lateNightTexters.map((item) => (
                  <div key={item.jid} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800">
                    <ContactLink name={item.name} jid={item.jid} onOpen={onOpenContact} />
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="font-semibold text-indigo-500">{item.lateNightPct}%</span>
                      <span className="text-xs text-slate-400">
                        {item.lateNight} late · {item.workHours} work · {item.otherHours} other
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {data.relationshipTrajectory.length > 0 && (
            <Card className="col-span-2 dark:border-slate-800 dark:bg-slate-900">
              <CardTitle className="dark:text-slate-50">Relationship Trajectory</CardTitle>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Message frequency trend over months — growing closer or drifting apart?</p>
              <div className="mt-4 grid grid-cols-2 gap-4">
                {data.relationshipTrajectory.map((item) => {
                  const style = TRAJECTORY_STYLE[item.direction];
                  return (
                    <div key={item.jid} className="rounded-xl bg-slate-50 px-4 py-3 dark:bg-slate-800">
                      <div className="mb-1 flex items-center justify-between">
                        <ContactLink name={item.name} jid={item.jid} onOpen={onOpenContact} />
                        <span className={cn('text-xs font-semibold', style.text)}>{style.label}</span>
                      </div>
                      <div className="h-12">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={item.trend} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
                            <Area type="monotone" dataKey="count" stroke={style.stroke} fill={style.fill} strokeWidth={1.5} dot={false} />
                            <Tooltip
                              contentStyle={{ fontSize: '11px', padding: '4px 8px', borderRadius: '8px' }}
                              labelFormatter={(label) => String(label)}
                              formatter={(value) => [`${value} msgs`, '']}
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </div>
      )}
      <ScanNote scan={data?.scan} />
    </section>
  );
}

function ContactLink({ name, jid, onOpen }: { name: string; jid: string; onOpen: (jid: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(jid)}
      className="mr-2 truncate text-left text-sm font-medium text-slate-900 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 dark:text-slate-100"
      title={`Open profile for ${name}`}
    >
      {name}
    </button>
  );
}
