import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, type ChatSummary, type MessageSummary } from '../api/client';
import { MessageContent } from '../components/MessageContent';
import { Card, Skeleton } from '../components/ui/Card';
import { CopyButton } from '../components/ui/CopyButton';
import { FilterInput } from '../components/ui/FilterInput';
import { useUrlTextFilter } from '../hooks/useUrlTextFilter';
import { chatPreviewLine, messageClipboardText } from '../lib/messageMedia';
import { cn } from '../lib/utils';
import { displayNameOrUnknown, formatDateTime, formatNumber, isLidIdentifier } from '../lib/utils';
import { useAppStore } from '../store/appStore';

const KIND_FILTERS: Array<{ value: 'direct' | 'group' | undefined; label: string }> = [
  { value: undefined, label: 'All' },
  { value: 'direct', label: 'Direct' },
  { value: 'group', label: 'Groups' },
];

function parseKind(value: string | null): 'direct' | 'group' | undefined {
  return value === 'direct' || value === 'group' ? value : undefined;
}

export function Chats() {
  const dataVersion = useAppStore((state) => state.dataVersion);
  const [searchParams, setSearchParams] = useSearchParams();
  const contactJid = searchParams.get('contact');
  const targetMsgId = searchParams.get('msg') ? Number(searchParams.get('msg')) : null;
  const kind = parseKind(searchParams.get('kind'));
  const { value: filter, setValue: setFilter, applied: appliedFilter } = useUrlTextFilter();
  const listFiltered = Boolean(kind || appliedFilter);

  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [totalChats, setTotalChats] = useState(0);
  const [selected, setSelected] = useState<ChatSummary | null>(null);
  const [messages, setMessages] = useState<MessageSummary[]>([]);
  const [totalMessages, setTotalMessages] = useState(0);
  const [messagesOffset, setMessagesOffset] = useState(0);
  const [highlightedMsgId, setHighlightedMsgId] = useState<number | null>(null);

  const [loadingChats, setLoadingChats] = useState(true);
  const [loadingMoreChats, setLoadingMoreChats] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadingMoreMessages, setLoadingMoreMessages] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Read inside the reload effect without making it depend on the selection,
  // which would turn "reload the list" into a loop.
  const selectedJidRef = useRef<string | null>(null);
  useEffect(() => {
    selectedJidRef.current = selected?.jid ?? null;
  }, [selected]);

  // Tells a "load more" still in flight that the list it belongs to has gone.
  const listKey = `${kind ?? ''}|${appliedFilter}`;
  const listKeyRef = useRef(listKey);
  useEffect(() => {
    listKeyRef.current = listKey;
  }, [listKey]);

  useEffect(() => {
    let active = true;
    setLoadingChats(true);

    const loadChats = async () => {
      const openJid = selectedJidRef.current;

      try {
        let targetChat: ChatSummary | null = null;
        if (contactJid) {
          const targetRes = await api.chats(1, 0, undefined, contactJid);
          if (targetRes.data.length > 0) {
            targetChat = targetRes.data[0];
          }
        }

        const listRes = await api.chats(50, 0, kind, undefined, appliedFilter);
        if (!active) return;

        // A deep link's chat tops the list, unless the list is deliberately narrowed.
        const pinTarget = targetChat && !listFiltered && !listRes.data.some((c) => c.jid === targetChat!.jid);
        const mergedChats = pinTarget ? [targetChat!, ...listRes.data] : listRes.data;
        if (targetChat) {
          setSelected(targetChat);
        } else {
          // Filtering must not swap out the conversation being read, nor should a
          // refresh throw the reader back to the top of the list. So an open chat
          // stays open, even when the filter hides its row.
          setSelected((open) => {
            const refreshed = mergedChats.find((chat) => chat.jid === openJid);
            if (refreshed) return refreshed;
            return open && listFiltered ? open : mergedChats[0] ?? null;
          });
        }

        setChats(mergedChats);
        setTotalChats(listRes.pagination.total + (pinTarget ? 1 : 0));
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (active) setLoadingChats(false);
      }
    };

    loadChats();

    return () => {
      active = false;
    };
  }, [appliedFilter, contactJid, dataVersion, kind, listFiltered]);

  const selectedJid = selected?.jid ?? null;

  useEffect(() => {
    if (!selectedJid) {
      setMessages([]);
      setTotalMessages(0);
      setMessagesOffset(0);
      return;
    }
    let active = true;
    setLoadingMessages(true);

    const loadMessages = async () => {
      try {
        let queryOffset = 0;
        if (targetMsgId) {
          try {
            const offsetRes = await api.messageOffset(targetMsgId);
            if (offsetRes.chatJid === selectedJid) {
              queryOffset = Math.max(0, offsetRes.offset - 20);
            }
          } catch (e) {
            console.error('Failed to resolve message offset', e);
          }
        }

        const result = await api.chatMessages(selectedJid, 50, queryOffset);
        if (!active) return;

        setMessages(result.data);
        setTotalMessages(result.pagination.total);
        setMessagesOffset(queryOffset);

        if (targetMsgId) {
          setHighlightedMsgId(targetMsgId);
          setTimeout(() => {
            const element = document.getElementById(`message-${targetMsgId}`);
            if (element) {
              element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          }, 200);

          setTimeout(() => {
            if (active) setHighlightedMsgId(null);
          }, 3500);
        }
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (active) setLoadingMessages(false);
      }
    };

    loadMessages();

    return () => {
      active = false;
    };
    // Keyed on the JID so that refiltering the list leaves an open chat alone; a
    // real refresh is dataVersion's job.
  }, [dataVersion, selectedJid, targetMsgId]);

  const loadMoreChats = () => {
    if (loadingMoreChats || chats.length >= totalChats) return;
    setLoadingMoreChats(true);
    const requestedFor = listKey;
    api.chats(50, chats.length, kind, undefined, appliedFilter)
      .then((result) => {
        if (listKeyRef.current !== requestedFor) return;
        setChats((prev) => {
          const existingJids = new Set(prev.map((c) => c.jid));
          const newChats = result.data.filter((c) => !existingJids.has(c.jid));
          return [...prev, ...newChats];
        });
        setTotalChats(result.pagination.total);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoadingMoreChats(false));
  };

  const loadMoreMessages = () => {
    if (!selected || loadingMoreMessages || messages.length >= totalMessages) return;
    setLoadingMoreMessages(true);
    api.chatMessages(selected.jid, 50, messagesOffset + messages.length)
      .then((result) => {
        setMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          const newMessages = result.data.filter((m) => !existingIds.has(m.id));
          return [...prev, ...newMessages];
        });
        setTotalMessages(result.pagination.total);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoadingMoreMessages(false));
  };

  const handleSidebarScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    if (target.scrollHeight - target.scrollTop <= target.clientHeight + 50) {
      loadMoreChats();
    }
  };

  const handleMessagesScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    if (target.scrollHeight - target.scrollTop <= target.clientHeight + 50) {
      loadMoreMessages();
    }
  };

  return (
    <main className="space-y-6 p-8">
      <div>
        <h2 className="text-2xl font-semibold text-slate-950 dark:text-slate-50">Chats</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">Browse direct and group conversations without modifying the archive.</p>
      </div>

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</div> : null}

      <section className="grid grid-cols-[360px_1fr] gap-6">
        <Card
          className="max-h-[calc(100vh-180px)] overflow-y-auto p-0 dark:border-slate-800 dark:bg-slate-900"
          onScroll={handleSidebarScroll}
        >
          <div className="sticky top-0 z-10 space-y-2 border-b border-slate-100 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <FilterInput value={filter} onChange={setFilter} placeholder="Filter by name" />
            <div className="flex items-center gap-1">
              {KIND_FILTERS.map((option) => (
                <button
                  key={option.label}
                  type="button"
                  aria-pressed={kind === option.value}
                  onClick={() => setSearchParams((previous) => {
                    const next = new URLSearchParams(previous);
                    if (option.value) next.set('kind', option.value);
                    else next.delete('kind');
                    return next;
                  }, { replace: true })}
                  className={cn(
                    'rounded-full px-3 py-1 text-xs font-semibold transition',
                    kind === option.value
                      ? 'bg-brand-600 text-white dark:bg-brand-500'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200',
                  )}
                >
                  {option.label}
                </button>
              ))}
              {loadingChats ? null : (
                <span className="ml-auto text-xs text-slate-500 dark:text-slate-400">{formatNumber(totalChats)} {totalChats === 1 ? 'chat' : 'chats'}</span>
              )}
            </div>
          </div>
          {loadingChats ? (
            <div className="space-y-3 p-5">
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
            </div>
          ) : chats.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              {listFiltered ? 'No chats match this filter.' : 'No chats in this archive.'}
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {chats.map((chat) => (
                <button
                  key={chat.jid}
                  type="button"
                  onClick={() => {
                    setSelected(chat);
                    if (contactJid || targetMsgId) {
                      setSearchParams((previous) => {
                        const next = new URLSearchParams(previous);
                        next.delete('contact');
                        next.delete('msg');
                        return next;
                      }, { replace: true });
                    }
                  }}
                  className={cn(
                    'block w-full p-4 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800',
                    selected?.jid === chat.jid && 'bg-brand-50 dark:bg-slate-800',
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-semibold text-slate-950 dark:text-slate-50">{chat.name}</h3>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs capitalize text-slate-600 dark:bg-slate-800 dark:text-slate-300">{chat.kind}</span>
                  </div>
                  <p className="mt-1 truncate text-sm text-slate-500">{chatPreviewLine(chat.lastMessageText, chat.lastMessageMediaType)}</p>
                  <p className="mt-2 text-xs text-slate-400">{formatNumber(chat.messageCount)} messages · {formatDateTime(chat.lastMessageAt)}</p>
                </button>
              ))}
              {loadingMoreChats && (
                <div className="p-4 text-center text-xs text-slate-500 dark:text-slate-400">Loading more chats...</div>
              )}
            </div>
          )}
        </Card>

        <Card
          className="max-h-[calc(100vh-180px)] overflow-y-auto dark:border-slate-800 dark:bg-slate-900"
          onScroll={handleMessagesScroll}
        >
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
                    <article
                      id={`message-${message.id}`}
                      key={message.id}
                      className={cn(
                        'rounded-2xl p-4 transition-all duration-500',
                        message.fromMe ? 'ml-auto max-w-[75%]' : 'mr-auto max-w-[75%]',
                        message.id === highlightedMsgId
                          ? 'ring-2 ring-amber-500/60 bg-amber-50 dark:bg-amber-950/30 scale-[1.02] shadow-md shadow-amber-500/5'
                          : message.fromMe
                          ? 'bg-brand-50 dark:bg-brand-600/20'
                          : 'bg-slate-50 dark:bg-slate-800'
                      )}
                    >
                      <div className="mb-1 flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <span className="min-w-0 truncate">{message.fromMe ? 'Me' : displayNameOrUnknown(message.senderName, message.senderJid)}</span>
                        <span className="flex shrink-0 items-center gap-1">
                          <span>{formatDateTime(message.sentAt)}</span>
                          <CopyButton text={messageClipboardText(message.text, message.mediaType)} />
                        </span>
                      </div>
                      <MessageContent
                        text={message.text}
                        mediaType={message.mediaType}
                        mediaPath={message.mediaPath}
                      />
                    </article>
                  ))}
                  {loadingMoreMessages && (
                    <div className="p-4 text-center text-xs text-slate-500 dark:text-slate-400">Loading older messages...</div>
                  )}
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
