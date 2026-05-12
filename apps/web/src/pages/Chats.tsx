import { useEffect, useState } from 'react';
import { api, type ChatSummary, type MessageSummary } from '../api/client';
import { Card, Skeleton } from '../components/ui/Card';
import { cn } from '../lib/utils';
import { displayNameOrUnknown, formatDateTime, formatNumber, isLidIdentifier } from '../lib/utils';

export function Chats() {
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [selected, setSelected] = useState<ChatSummary | null>(null);
  const [messages, setMessages] = useState<MessageSummary[]>([]);
  const [loadingChats, setLoadingChats] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api.chats(100)
      .then((result) => {
        if (!active) return;
        setChats(result.data);
        setSelected(result.data[0] ?? null);
      })
      .catch((err: Error) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoadingChats(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!selected) return;
    let active = true;
    setLoadingMessages(true);
    api.chatMessages(selected.jid, 100)
      .then((result) => {
        if (active) setMessages(result.data);
      })
      .catch((err: Error) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoadingMessages(false);
      });
    return () => {
      active = false;
    };
  }, [selected]);

  return (
    <main className="space-y-6 p-8">
      <div>
        <h2 className="text-2xl font-semibold text-slate-950 dark:text-slate-50">Chats</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">Browse direct and group conversations without modifying the archive.</p>
      </div>

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</div> : null}

      <section className="grid grid-cols-[360px_1fr] gap-6">
        <Card className="max-h-[calc(100vh-180px)] overflow-y-auto p-0 dark:border-slate-800 dark:bg-slate-900">
          {loadingChats ? (
            <div className="space-y-3 p-5">
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {chats.map((chat) => (
                <button
                  key={chat.jid}
                  type="button"
                  onClick={() => setSelected(chat)}
                  className={cn(
                    'block w-full p-4 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800',
                    selected?.jid === chat.jid && 'bg-brand-50 dark:bg-slate-800',
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-semibold text-slate-950 dark:text-slate-50">{chat.name}</h3>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs capitalize text-slate-600 dark:bg-slate-800 dark:text-slate-300">{chat.kind}</span>
                  </div>
                  <p className="mt-1 truncate text-sm text-slate-500">{chat.lastMessageText ?? 'No preview'}</p>
                  <p className="mt-2 text-xs text-slate-400">{formatNumber(chat.messageCount)} messages · {formatDateTime(chat.lastMessageAt)}</p>
                </button>
              ))}
            </div>
          )}
        </Card>

        <Card className="max-h-[calc(100vh-180px)] overflow-y-auto dark:border-slate-800 dark:bg-slate-900">
          {selected ? (
            <>
              <div className="mb-4 border-b border-slate-100 pb-4 dark:border-slate-800">
                <h3 className="text-lg font-semibold text-slate-950 dark:text-slate-50">{selected.name}</h3>
                {!isLidIdentifier(selected.jid) ? <p className="text-sm text-slate-500">{selected.jid}</p> : null}
              </div>
              {loadingMessages ? (
                <Skeleton className="h-72" />
              ) : (
                <div className="space-y-3">
                  {messages.map((message) => (
                    <article key={message.id} className={cn('rounded-2xl p-4', message.fromMe ? 'ml-auto max-w-[75%] bg-brand-50 dark:bg-brand-600/20' : 'mr-auto max-w-[75%] bg-slate-50 dark:bg-slate-800')}>
                      <div className="mb-1 flex items-center justify-between gap-3 text-xs text-slate-500">
                        <span>{message.fromMe ? 'Me' : displayNameOrUnknown(message.senderName, message.senderJid)}</span>
                        <span>{formatDateTime(message.sentAt)}</span>
                      </div>
                      <p className="whitespace-pre-wrap text-sm text-slate-800 dark:text-slate-100">{message.text ?? `[${message.mediaType ?? message.messageType ?? 'message'}]`}</p>
                    </article>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="flex h-72 items-center justify-center text-slate-500">Select a chat to inspect messages.</div>
          )}
        </Card>
      </section>
    </main>
  );
}
