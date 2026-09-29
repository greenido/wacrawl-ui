import type { ArchivedChats } from '../../api/client';
import { formatNumber } from '../../lib/utils';
import { Card, CardTitle, Skeleton } from '../ui/Card';

interface ArchivedChatsCardProps {
  data: ArchivedChats | null;
  loading: boolean;
  onOpenChat: (jid: string) => void;
}

function percent(part: number, whole: number): number {
  return whole === 0 ? 0 : Math.round((part / whole) * 100);
}

/** Archived chats that kept talking anyway. */
export function ArchivedChatsCard({ data, loading, onOpenChat }: ArchivedChatsCardProps) {
  return (
    <Card className="dark:border-slate-800 dark:bg-slate-900">
      <CardTitle className="dark:text-slate-50">Buried, Not Dead</CardTitle>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        {data?.available
          ? `Chats you archived that still had messages in the last ${data.windowDays} days`
          : 'Chats you archived that are still talking'}
      </p>
      {loading || !data ? <Skeleton className="mt-4 h-48" /> : !data.available ? (
        <p className="mt-4 rounded-xl bg-slate-50 px-3 py-4 text-sm text-slate-500 dark:bg-slate-800 dark:text-slate-400">
          This archive does not record which chats are archived. A newer wacrawl version does.
        </p>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-800">
              <p className="text-xs text-slate-500 dark:text-slate-400">Archived</p>
              <p className="text-lg font-semibold text-slate-950 dark:text-slate-50">
                {formatNumber(data.archivedChats)}
                <span className="ml-1 text-sm font-normal text-slate-500">({percent(data.archivedChats, data.totalChats)}%)</span>
              </p>
              <p className="text-[11px] text-slate-400">
                {formatNumber(data.archivedDirect)} people · {formatNumber(data.archivedGroups)} groups
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-800">
              <p className="text-xs text-slate-500 dark:text-slate-400">Still talking</p>
              <p className="text-lg font-semibold text-slate-950 dark:text-slate-50">{formatNumber(data.stillActiveCount)}</p>
              <p className="text-[11px] text-slate-400">archived, yet active in {data.windowDays} days</p>
            </div>
          </div>
          <div className="mt-3 space-y-2">
            {data.stillActive.length === 0 ? (
              <p className="rounded-xl bg-slate-50 px-3 py-4 text-sm text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                Everything you archived has stayed quiet.
              </p>
            ) : data.stillActive.map((chat) => (
              <div key={chat.jid} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800">
                <button
                  type="button"
                  onClick={() => onOpenChat(chat.jid)}
                  className="mr-2 truncate text-left font-medium underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 dark:text-slate-100"
                >
                  {chat.name}
                </button>
                <span className="shrink-0 text-xs text-slate-500">
                  {formatNumber(chat.recentMessages)} msgs
                  {chat.recentFromMe > 0 ? ` · ${formatNumber(chat.recentFromMe)} from you` : ''}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}
