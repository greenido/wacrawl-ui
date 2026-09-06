import { useState } from 'react';
import type { EmojiAnalytics } from '../../api/client';
import { formatNumber, cn } from '../../lib/utils';
import { Card, CardTitle, Skeleton } from '../ui/Card';
import { ScanNote } from '../ui/ScanNote';

const TABS = ['all', 'sent', 'received'] as const;
type Tab = (typeof TABS)[number];

export function EmojiAnalyticsCard({ data, loading }: { data: EmojiAnalytics | null; loading: boolean }) {
  const [tab, setTab] = useState<Tab>('all');

  if (loading || !data) {
    return (
      <Card className="col-span-2 dark:border-slate-800 dark:bg-slate-900">
        <CardTitle className="dark:text-slate-50">Emoji Analytics</CardTitle>
        <Skeleton className="mt-4 h-64" />
      </Card>
    );
  }

  const emojis = tab === 'sent' ? data.topSentEmojis : tab === 'received' ? data.topReceivedEmojis : data.topEmojis;

  return (
    <Card className="col-span-2 dark:border-slate-800 dark:bg-slate-900">
      <CardTitle className="dark:text-slate-50">Emoji Analytics</CardTitle>
      <div className="mt-4 space-y-4">
        <div className="flex items-center gap-6 text-sm">
          <div className="rounded-xl bg-slate-50 px-4 py-2 dark:bg-slate-800">
            <span className="text-slate-500 dark:text-slate-400">Total emojis</span>
            <span className="ml-2 font-bold text-slate-900 dark:text-slate-50">{formatNumber(data.totalEmojiCount)}</span>
          </div>
          <div className="rounded-xl bg-slate-50 px-4 py-2 dark:bg-slate-800">
            <span className="text-slate-500 dark:text-slate-400">Unique</span>
            <span className="ml-2 font-bold text-slate-900 dark:text-slate-50">{formatNumber(data.uniqueEmojiCount)}</span>
          </div>
        </div>
        <ScanNote scan={data.scan} unit="text messages" />

        <div className="space-y-3">
          <div role="tablist" aria-label="Emoji view mode" className="flex flex-wrap gap-2">
            {TABS.map((value) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={tab === value}
                onClick={() => setTab(value)}
                className={cn(
                  'rounded-full px-3 py-1.5 text-sm font-semibold capitalize outline-none ring-brand-400 transition focus-visible:ring-4',
                  tab === value
                    ? 'bg-brand-600 text-white dark:bg-brand-500'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700',
                )}
              >
                {value}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-3">
            {emojis.map((item, index) => (
              <div key={item.emoji} className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-800">
                <span style={{ fontSize: `${Math.max(20, 36 - index * 1.5)}px` }}>{item.emoji}</span>
                <span className="text-sm font-medium text-slate-600 dark:text-slate-300">{formatNumber(item.count)}</span>
              </div>
            ))}
          </div>
        </div>

        {data.topEmojiUsers.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Top Emoji Users</p>
            <div className="grid grid-cols-2 gap-2">
              {data.topEmojiUsers.slice(0, 6).map((user) => (
                <div key={user.jid} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800">
                  <span className="mr-2 truncate font-medium dark:text-slate-100">{user.name}</span>
                  <span className="flex shrink-0 items-center gap-1 text-slate-500">
                    <span className="text-lg">{user.topEmoji}</span>
                    <span>{formatNumber(user.count)}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
