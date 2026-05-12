import { Router } from 'express';
import type { Database } from 'better-sqlite3';
import { getDb } from '../db.js';
import { cleanDisplayNameSql, contactDisplayNameSql, contactMatchSql } from '../lib/displayName.js';
import { resolveArchiveMediaPath } from '../lib/mediaFsPath.js';
import { parseLimit, parseOffset, unixSecondsToIso } from '../lib/query.js';
import { hasMessageSearchIndex, MESSAGE_SEARCH_FTS_TABLE } from '../lib/searchIndex.js';
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
  lastMessageMediaType: string | null;
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

interface SearchMessageRow extends MessageRow {
  snippet?: string | null;
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

function buildFtsQuery(query: string): string | null {
  const terms = query
    .toLowerCase()
    .match(/[\p{L}\p{N}]+/gu)
    ?.filter((term) => term.length > 0)
    .slice(0, 8);

  if (!terms?.length) {
    return null;
  }

  return terms.map((term) => `"${term.replace(/"/g, '""')}"*`).join(' AND ');
}

function formatSearchResults(rows: SearchMessageRow[], query: string, limit: number, offset: number, total: number): ListResponse<SearchResult> {
  return asPagination(rows.map((row) => {
    const message = mapMessage(row);
    const text = row.text ?? row.chatName ?? '';
    const ftsSnippet = row.snippet?.trim();
    const snippetSource = ftsSnippet || (text.toLowerCase().includes(query.toLowerCase())
      ? text
      : [row.chatName, row.senderName, text].filter(Boolean).join(' - '));
    return {
      ...message,
      snippet: snippetSource.length > 180 ? `${snippetSource.slice(0, 177)}...` : snippetSource,
    };
  }), limit, offset, total);
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
  const where = kind ? 'WHERE chats.kind = @kind' : 'WHERE chats.kind IN (\'direct\', \'group\')';
  const total = (db.prepare(`SELECT COUNT(*) AS count FROM chats ${where}`).get({ kind }) as CountRow).count;

  const rows = db.prepare(`
    WITH chat_page AS (
      SELECT
        chats.jid,
        chats.kind,
        chats.name,
        chats.last_message_at
      FROM chats
      ${where}
      ORDER BY COALESCE(chats.last_message_at, 0) DESC, chats.name COLLATE NOCASE ASC
      LIMIT @limit OFFSET @offset
    ),
    message_stats AS (
      SELECT
        chat_jid,
        ${cleanDisplayNameSql('MAX(chat_name)')} AS message_name,
        COUNT(rowid) AS messageCount,
        SUM(CASE WHEN media_type IS NOT NULL AND media_type <> '' THEN 1 ELSE 0 END) AS mediaCount,
        COUNT(DISTINCT CASE WHEN from_me = 0 THEN sender_jid END) AS participantCount,
        MAX(ts) AS lastMessageTs
      FROM messages
      WHERE chat_jid IN (SELECT jid FROM chat_page)
      GROUP BY chat_jid
    ),
    latest AS (
      SELECT messages.chat_jid, messages.text, messages.media_type AS lastMessageMediaType
      FROM messages
      JOIN message_stats ON message_stats.chat_jid = messages.chat_jid
      WHERE messages.rowid = (
        SELECT latest_message.rowid
        FROM messages AS latest_message
        WHERE latest_message.chat_jid = messages.chat_jid
        ORDER BY latest_message.ts DESC, latest_message.rowid DESC
        LIMIT 1
      )
    )
    SELECT
      chat_page.jid,
      chat_page.kind,
      COALESCE(${cleanDisplayNameSql('chat_page.name')}, message_stats.message_name, ${contactDisplayNameSql('chat_contacts')}, ${cleanDisplayNameSql('chat_page.jid')}, 'Unknown') AS name,
      message_stats.messageCount,
      message_stats.mediaCount,
      message_stats.participantCount,
      message_stats.lastMessageTs,
      latest.text AS lastMessageText,
      latest.lastMessageMediaType AS lastMessageMediaType
    FROM chat_page
    LEFT JOIN message_stats ON message_stats.chat_jid = chat_page.jid
    LEFT JOIN latest ON latest.chat_jid = chat_page.jid
    LEFT JOIN contacts AS chat_contacts ON ${contactMatchSql('chat_contacts', 'chat_page.jid')}
    ORDER BY COALESCE(message_stats.lastMessageTs, chat_page.last_message_at, 0) DESC, name COLLATE NOCASE ASC
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
    lastMessageMediaType: row.lastMessageMediaType,
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
  const hasMediaPath = 'media_path IS NOT NULL AND TRIM(media_path) <> \'\'';
  const where = type
    ? `media_type = @type AND ${hasMediaPath}`
    : `media_type IS NOT NULL AND media_type <> '' AND ${hasMediaPath}`;
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

  const ftsQuery = buildFtsQuery(query);
  if (ftsQuery && hasMessageSearchIndex(db)) {
    try {
      const total = (db.prepare(`
        SELECT COUNT(*) AS count
        FROM ${MESSAGE_SEARCH_FTS_TABLE}
        WHERE ${MESSAGE_SEARCH_FTS_TABLE} MATCH @ftsQuery
      `).get({ ftsQuery }) as CountRow).count;
      const rows = db.prepare(`
        WITH matched AS (
          SELECT
            rowid,
            snippet(${MESSAGE_SEARCH_FTS_TABLE}, -1, '', '', '...', 20) AS snippet
          FROM ${MESSAGE_SEARCH_FTS_TABLE}
          WHERE ${MESSAGE_SEARCH_FTS_TABLE} MATCH @ftsQuery
        )
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
          media_path AS mediaPath,
          matched.snippet AS snippet
        FROM matched
        JOIN messages ON messages.rowid = matched.rowid
        LEFT JOIN chats ON chats.jid = messages.chat_jid
        LEFT JOIN contacts AS chat_contacts ON ${contactMatchSql('chat_contacts', 'messages.chat_jid')}
        LEFT JOIN contacts AS sender_contacts ON ${contactMatchSql('sender_contacts', 'messages.sender_jid')}
        ORDER BY ts DESC, messages.rowid DESC
        LIMIT @limit OFFSET @offset
      `).all({ ftsQuery, limit, offset }) as SearchMessageRow[];

      return formatSearchResults(rows, query, limit, offset, total);
    } catch {
      // If an older archive has an incompatible FTS table, keep search working.
    }
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
  `).all({ like, limit, offset }) as SearchMessageRow[];

  return formatSearchResults(rows, query, limit, offset, total);
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

dataRouter.get('/media/file', (req, res, next) => {
  const mediaPath = typeof req.query.path === 'string' ? req.query.path.trim() : '';
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

  let absolutePath: string;
  try {
    absolutePath = resolveArchiveMediaPath(row.mediaPath);
  } catch {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid media path.' } });
    return;
  }

  res.sendFile(absolutePath, (err) => {
    if (!err) return;
    const errCode = (err as NodeJS.ErrnoException).code;
    if (errCode === 'ENOENT') {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Media file was not found on disk.' } });
      return;
    }
    if (errCode === 'EACCES' || errCode === 'EPERM') {
      res.status(403).json({
        error: {
          code: 'PERMISSION_DENIED',
          message:
            'Cannot read media file — permission denied. ' +
            'On macOS, the process running the API server (Terminal, iTerm, etc.) needs ' +
            'Full Disk Access: System Settings → Privacy & Security → Full Disk Access.',
        },
      });
      return;
    }
    next(err);
  });
});

dataRouter.get('/search', (req, res) => {
  res.json(searchMessages(req.query));
});
