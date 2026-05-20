import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, type ChatSummary, type MessageSummary } from '../api/client';
import { MessageContent } from '../components/MessageContent';
import { Card, Skeleton } from '../components/ui/Card';
import { CopyButton } from '../components/ui/CopyButton';
import { chatPreviewLine, messageClipboardText } from '../lib/messageMedia';
import { cn } from '../lib/utils';
import { displayNameOrUnknown, formatDateTime, formatNumber, isLidIdentifier } from '../lib/utils';

export function Chats() {
  const [searchParams, setSearchParams] = useSearchParams();
  const contactJid = searchParams.get('contact');
  const targetMsgId = searchParams.get('msg') ? Number(searchParams.get('msg')) : null;

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

  useEffect(() => {
    let active = true;
    setLoadingChats(true);

    const loadChats = async () => {
      try {
        let targetChat: ChatSummary | null = null;
        if (contactJid) {
          const targetRes = await api.chats(1, 0, undefined, contactJid);
          if (targetRes.data.length > 0) {
            targetChat = targetRes.data[0];
          }
        }

        const listRes = await api.chats(50, 0);
        if (!active) return;

        let mergedChats = [...listRes.data];
        if (targetChat) {
          const exists = listRes.data.some((c) => c.jid === targetChat!.jid);
          if (!exists) {
            mergedChats = [targetChat, ...mergedChats];
          }
          setSelected(targetChat);
        } else {
          setSelected(listRes.data[0] ?? null);
        }

        setChats(mergedChats);
        setTotalChats(listRes.pagination.total + (targetChat && !listRes.data.some((c) => c.jid === targetChat!.jid) ? 1 : 0));
      } catch (err: any) {
        if (active) setError(err.message);
      } finally {
        if (active) setLoadingChats(false);
      }
    };

    loadChats();

    return () => {
      active = false;
    };
  }, [contactJid]);

  useEffect(() => {
    if (!selected) {
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
            if (offsetRes.chatJid === selected.jid) {
              queryOffset = Math.max(0, offsetRes.offset - 20);
            }
          } catch (e) {
            console.error('Failed to resolve message offset', e);
          }
        }

        const result = await api.chatMessages(selected.jid, 50, queryOffset);
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
      } catch (err: any) {
        if (active) setError(err.message);
      } finally {
        if (active) setLoadingMessages(false);
      }
    };

    loadMessages();

    return () => {
      active = false;
    };
  }, [selected, targetMsgId]);

  const loadMoreChats = () => {
    if (loadingMoreChats || chats.length >= totalChats) return;
    setLoadingMoreChats(true);
    api.chats(50, chats.length)
      .then((result) => {
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
                  onClick={() => {
                    setSelected(chat);
                    if (contactJid || targetMsgId) setSearchParams({}, { replace: true });
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
