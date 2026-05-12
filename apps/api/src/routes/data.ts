import { Router } from 'express';
import type { Database } from 'better-sqlite3';
import { getDb } from '../db.js';
import { cleanDisplayNameSql, contactDisplayNameSql, contactMatchSql } from '../lib/displayName.js';
import { parseLimit, parseOffset, unixSecondsToIso } from '../lib/query.js';
import type { ChatSummary, ListResponse, MediaItem, MessageSummary, PersonSummary, SearchResult } from '../types.js';

interface CountRow {
  count: number;
}

interface PersonRow {
  jid: string;
  name: string | null;
  messageCount: number;
  mediaCount: number;
  sentByMe: number;
  sentByThem: number;
  lastMessageTs: number | null;
}

interface ChatRow {
  jid: string;
  kind: string;
  name: string | null;
  messageCount: number;
  mediaCount: number;
  participantCount: number;
  lastMessageTs: number | null;
  lastMessageText: string | null;
}

interface MessageRow {
  id: number;
  msgId: string;
  chatJid: string;
  chatName: string | null;
  senderJid: string | null;
  senderName: string | null;
  ts: number;
  fromMe: number;
  text: string | null;
  messageType: string | null;
  mediaType: string | null;
  mediaPath: string | null;
  mediaSize?: number | null;
}

function asPagination<T>(data: T[], limit: number, offset: number, total: number): ListResponse<T> {
  return { data, pagination: { limit, offset, total } };
}

function mapMessage(row: MessageRow): MessageSummary {
  return {
    id: row.id,
    msgId: row.msgId,
    chatJid: row.chatJid,
    chatName: row.chatName ?? row.chatJid,
    senderJid: row.senderJid,
    senderName: row.senderName,
    sentAt: unixSecondsToIso(row.ts) ?? new Date(0).toISOString(),
    fromMe: row.fromMe === 1,
    text: row.text,
    messageType: row.messageType,
    mediaType: row.mediaType,
    mediaPath: row.mediaPath,
  };
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

export function getPeople(params: { limit?: unknown; offset?: unknown }, db: Database = getDb()): ListResponse<PersonSummary> {
  const limit = parseLimit(params.limit, 50, 200);
  const offset = parseOffset(params.offset);
  const total = (db.prepare(`
    SELECT COUNT(*) AS count
    FROM (
      SELECT CASE WHEN from_me = 1 THEN chat_jid ELSE COALESCE(sender_jid, chat_jid) END AS jid
      FROM messages
      UNION
      SELECT jid FROM contacts
    )
    WHERE jid IS NOT NULL AND jid <> ''
  `).get() as CountRow).count;

  const rows = db.prepare(`
    WITH normalized_messages AS (
      SELECT
        CASE WHEN from_me = 1 THEN chat_jid ELSE COALESCE(sender_jid, chat_jid) END AS jid,
        ${contactDisplayNameSql('contacts')} AS contact_name,
        ${cleanDisplayNameSql('CASE WHEN from_me = 1 THEN messages.chat_name ELSE messages.sender_name END')} AS message_name,
        ${cleanDisplayNameSql(`
          COALESCE(
            chats.name,
            CASE
              WHEN messages.chat_jid = CASE WHEN messages.from_me = 1 THEN messages.chat_jid ELSE COALESCE(messages.sender_jid, messages.chat_jid) END
              THEN messages.chat_name
              ELSE NULL
            END
          )
        `)} AS direct_chat_name,
        from_me,
        ts,
        media_type
      FROM messages
      LEFT JOIN chats ON chats.jid = CASE WHEN messages.from_me = 1 THEN messages.chat_jid ELSE COALESCE(messages.sender_jid, messages.chat_jid) END
      LEFT JOIN contacts ON ${contactMatchSql('contacts', 'CASE WHEN messages.from_me = 1 THEN messages.chat_jid ELSE COALESCE(messages.sender_jid, messages.chat_jid) END')}
    ),
    all_people AS (
      SELECT jid, ${contactDisplayNameSql('contacts')} AS contact_name, NULL AS message_name, NULL AS direct_chat_name, NULL AS from_me, NULL AS ts, NULL AS media_type
      FROM contacts
      UNION ALL
      SELECT jid, contact_name, message_name, direct_chat_name, from_me, ts, media_type FROM normalized_messages
    )
    SELECT
      jid,
      COALESCE(MAX(message_name), MAX(direct_chat_name), MAX(contact_name), ${cleanDisplayNameSql('jid')}, 'Unknown') AS name,
      SUM(CASE WHEN ts IS NOT NULL THEN 1 ELSE 0 END) AS messageCount,
      SUM(CASE WHEN media_type IS NOT NULL AND media_type <> '' THEN 1 ELSE 0 END) AS mediaCount,
      SUM(CASE WHEN from_me = 1 THEN 1 ELSE 0 END) AS sentByMe,
      SUM(CASE WHEN from_me = 0 THEN 1 ELSE 0 END) AS sentByThem,
      MAX(ts) AS lastMessageTs
    FROM all_people
    WHERE jid IS NOT NULL AND jid <> ''
    GROUP BY jid
    ORDER BY messageCount DESC, name COLLATE NOCASE ASC
    LIMIT @limit OFFSET @offset
  `).all({ limit, offset }) as PersonRow[];

  return asPagination(rows.map((row) => ({
    jid: row.jid,
    name: row.name ?? row.jid,
    messageCount: row.messageCount ?? 0,
    mediaCount: row.mediaCount ?? 0,
    sentByMe: row.sentByMe ?? 0,
    sentByThem: row.sentByThem ?? 0,
    lastMessageAt: unixSecondsToIso(row.lastMessageTs),
  })), limit, offset, total);
}

export function getChats(params: { limit?: unknown; offset?: unknown; kind?: unknown }, db: Database = getDb()): ListResponse<ChatSummary> {
  const limit = parseLimit(params.limit, 50, 200);
  const offset = parseOffset(params.offset);
  const kind = params.kind === 'direct' || params.kind === 'group' ? params.kind : undefined;
  const where = kind ? 'WHERE chats.kind = @kind' : '';
  const total = (db.prepare(`SELECT COUNT(*) AS count FROM chats ${where}`).get({ kind }) as CountRow).count;

  const rows = db.prepare(`
    WITH latest AS (
      SELECT chat_jid, text
      FROM messages
      WHERE rowid IN (SELECT MAX(rowid) FROM messages GROUP BY chat_jid)
    )
    SELECT
      chats.jid,
      chats.kind,
      COALESCE(${cleanDisplayNameSql('chats.name')}, ${cleanDisplayNameSql('MAX(messages.chat_name)')}, ${contactDisplayNameSql('chat_contacts')}, ${cleanDisplayNameSql('chats.jid')}, 'Unknown') AS name,
      COUNT(messages.rowid) AS messageCount,
      SUM(CASE WHEN messages.media_type IS NOT NULL AND messages.media_type <> '' THEN 1 ELSE 0 END) AS mediaCount,
      COUNT(DISTINCT CASE WHEN messages.from_me = 0 THEN messages.sender_jid END) AS participantCount,
      MAX(messages.ts) AS lastMessageTs,
      latest.text AS lastMessageText
    FROM chats
    LEFT JOIN messages ON messages.chat_jid = chats.jid
    LEFT JOIN latest ON latest.chat_jid = chats.jid
    LEFT JOIN contacts AS chat_contacts ON ${contactMatchSql('chat_contacts', 'chats.jid')}
    ${where}
    GROUP BY chats.jid
    ORDER BY COALESCE(lastMessageTs, chats.last_message_at, 0) DESC, name COLLATE NOCASE ASC
    LIMIT @limit OFFSET @offset
  `).all({ kind, limit, offset }) as ChatRow[];

  return asPagination(rows.map((row) => ({
    jid: row.jid,
    kind: row.kind,
    name: row.name ?? row.jid,
    messageCount: row.messageCount ?? 0,
    mediaCount: row.mediaCount ?? 0,
    participantCount: row.participantCount ?? 0,
    lastMessageAt: unixSecondsToIso(row.lastMessageTs),
    lastMessageText: row.lastMessageText,
  })), limit, offset, total);
}

export function getChatMessages(chatJid: string, params: { limit?: unknown; offset?: unknown }, db: Database = getDb()): ListResponse<MessageSummary> {
  const limit = parseLimit(params.limit, 50, 200);
  const offset = parseOffset(params.offset);
  const total = (db.prepare('SELECT COUNT(*) AS count FROM messages WHERE chat_jid = @chatJid').get({ chatJid }) as CountRow).count;
  const rows = db.prepare(`
    SELECT
      messages.rowid AS id,
      msg_id AS msgId,
      chat_jid AS chatJid,
      COALESCE(${cleanDisplayNameSql('chats.name')}, ${cleanDisplayNameSql('messages.chat_name')}, ${contactDisplayNameSql('chat_contacts')}, ${cleanDisplayNameSql('messages.chat_jid')}, 'Unknown') AS chatName,
      sender_jid AS senderJid,
      COALESCE(${cleanDisplayNameSql('messages.sender_name')}, ${contactDisplayNameSql('sender_contacts')}) AS senderName,
      ts,
      from_me AS fromMe,
      text,
      message_type AS messageType,
      media_type AS mediaType,
      media_path AS mediaPath
    FROM messages
    LEFT JOIN chats ON chats.jid = messages.chat_jid
    LEFT JOIN contacts AS chat_contacts ON ${contactMatchSql('chat_contacts', 'messages.chat_jid')}
    LEFT JOIN contacts AS sender_contacts ON ${contactMatchSql('sender_contacts', 'messages.sender_jid')}
    WHERE chat_jid = @chatJid
    ORDER BY ts DESC, messages.rowid DESC
    LIMIT @limit OFFSET @offset
  `).all({ chatJid, limit, offset }) as MessageRow[];

  return asPagination(rows.map(mapMessage), limit, offset, total);
}

export function getMediaItems(params: { limit?: unknown; offset?: unknown; type?: unknown }, db: Database = getDb()): ListResponse<MediaItem> {
  const limit = parseLimit(params.limit, 60, 200);
  const offset = parseOffset(params.offset);
  const type = typeof params.type === 'string' && params.type.trim() ? params.type.trim() : undefined;
  const where = type ? 'media_type = @type' : 'media_type IS NOT NULL AND media_type <> \'\'';
  const total = (db.prepare(`SELECT COUNT(*) AS count FROM messages WHERE ${where}`).get({ type }) as CountRow).count;
  const rows = db.prepare(`
    SELECT
      messages.rowid AS id,
      chat_jid AS chatJid,
      COALESCE(${cleanDisplayNameSql('chats.name')}, ${cleanDisplayNameSql('messages.chat_name')}, ${contactDisplayNameSql('chat_contacts')}, ${cleanDisplayNameSql('messages.chat_jid')}, 'Unknown') AS chatName,
      sender_jid AS senderJid,
      COALESCE(${cleanDisplayNameSql('messages.sender_name')}, ${contactDisplayNameSql('sender_contacts')}) AS senderName,
      ts,
      from_me AS fromMe,
      text,
      message_type AS messageType,
      media_type AS mediaType,
      media_path AS mediaPath,
      media_size AS mediaSize
    FROM messages
    LEFT JOIN chats ON chats.jid = messages.chat_jid
    LEFT JOIN contacts AS chat_contacts ON ${contactMatchSql('chat_contacts', 'messages.chat_jid')}
    LEFT JOIN contacts AS sender_contacts ON ${contactMatchSql('sender_contacts', 'messages.sender_jid')}
    WHERE ${where}
    ORDER BY ts DESC, messages.rowid DESC
    LIMIT @limit OFFSET @offset
  `).all({ type, limit, offset }) as Array<MessageRow & { mediaType: string; mediaPath: string; mediaSize: number | null }>;

  return asPagination(rows.map((row) => ({
    id: row.id,
    chatJid: row.chatJid,
    chatName: row.chatName ?? row.chatJid,
    senderJid: row.senderJid,
    senderName: row.senderName,
    sentAt: unixSecondsToIso(row.ts) ?? new Date(0).toISOString(),
    fromMe: row.fromMe === 1,
    text: row.text,
    mediaType: row.mediaType,
    mediaPath: row.mediaPath,
    mediaSize: row.mediaSize,
    fileUrl: `/api/media/file?path=${encodeURIComponent(row.mediaPath)}`,
  })), limit, offset, total);
}

export function searchMessages(params: { q?: unknown; limit?: unknown; offset?: unknown }, db: Database = getDb()): ListResponse<SearchResult> {
  const query = typeof params.q === 'string' ? params.q.trim() : '';
  const limit = parseLimit(params.limit, 50, 100);
  const offset = parseOffset(params.offset);
  if (query.length < 2) {
    return asPagination([], limit, offset, 0);
  }

  const like = `%${escapeLike(query)}%`;
  const where = `
    (messages.text LIKE @like ESCAPE '\\'
      OR messages.chat_name LIKE @like ESCAPE '\\'
      OR messages.sender_name LIKE @like ESCAPE '\\'
      OR chats.name LIKE @like ESCAPE '\\'
      OR ${contactDisplayNameSql('chat_contacts')} LIKE @like ESCAPE '\\'
      OR ${contactDisplayNameSql('sender_contacts')} LIKE @like ESCAPE '\\')
  `;
  const total = (db.prepare(`
    SELECT COUNT(*) AS count
    FROM messages
    LEFT JOIN chats ON chats.jid = messages.chat_jid
    LEFT JOIN contacts AS chat_contacts ON ${contactMatchSql('chat_contacts', 'messages.chat_jid')}
    LEFT JOIN contacts AS sender_contacts ON ${contactMatchSql('sender_contacts', 'messages.sender_jid')}
    WHERE ${where}
  `).get({ like }) as CountRow).count;
  const rows = db.prepare(`
    SELECT
      messages.rowid AS id,
      msg_id AS msgId,
      chat_jid AS chatJid,
      COALESCE(${cleanDisplayNameSql('chats.name')}, ${cleanDisplayNameSql('messages.chat_name')}, ${contactDisplayNameSql('chat_contacts')}, ${cleanDisplayNameSql('messages.chat_jid')}, 'Unknown') AS chatName,
      sender_jid AS senderJid,
      COALESCE(${cleanDisplayNameSql('messages.sender_name')}, ${contactDisplayNameSql('sender_contacts')}) AS senderName,
      ts,
      from_me AS fromMe,
      text,
      message_type AS messageType,
      media_type AS mediaType,
      media_path AS mediaPath
    FROM messages
    LEFT JOIN chats ON chats.jid = messages.chat_jid
    LEFT JOIN contacts AS chat_contacts ON ${contactMatchSql('chat_contacts', 'messages.chat_jid')}
    LEFT JOIN contacts AS sender_contacts ON ${contactMatchSql('sender_contacts', 'messages.sender_jid')}
    WHERE ${where}
    ORDER BY ts DESC, messages.rowid DESC
    LIMIT @limit OFFSET @offset
  `).all({ like, limit, offset }) as MessageRow[];

  return asPagination(rows.map((row) => {
    const message = mapMessage(row);
    const text = row.text ?? row.chatName ?? '';
    const snippetSource = text.toLowerCase().includes(query.toLowerCase())
      ? text
      : [row.chatName, row.senderName, text].filter(Boolean).join(' - ');
    return {
      ...message,
      snippet: snippetSource.length > 180 ? `${snippetSource.slice(0, 177)}...` : snippetSource,
    };
  }), limit, offset, total);
}

export const dataRouter = Router();

dataRouter.get('/people', (req, res) => {
  res.json(getPeople(req.query));
});

dataRouter.get('/chats', (req, res) => {
  res.json(getChats(req.query));
});

dataRouter.get('/chats/:jid/messages', (req, res) => {
  res.json(getChatMessages(req.params.jid, req.query));
});

dataRouter.get('/media', (req, res) => {
  res.json(getMediaItems(req.query));
});

dataRouter.get('/media/file', (req, res) => {
  const mediaPath = typeof req.query.path === 'string' ? req.query.path : '';
  if (!mediaPath) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'path is required.' } });
    return;
  }

  const row = getDb().prepare(`
    SELECT media_path AS mediaPath
    FROM messages
    WHERE media_path = @mediaPath AND media_type IS NOT NULL AND media_type <> ''
    LIMIT 1
  `).get({ mediaPath }) as { mediaPath: string } | undefined;

  if (!row) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Media file is not indexed in this archive.' } });
    return;
  }

  res.sendFile(row.mediaPath);
});

dataRouter.get('/search', (req, res) => {
  res.json(searchMessages(req.query));
});
