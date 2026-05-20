import type Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { createSearchIndexes } from '../lib/searchIndex.js';
import { getChatMessages, getChats, getMediaItems, getPeople, searchMessages } from '../routes/data.js';
import { createTestDb } from './testDb.js';

let db: Database.Database | null = null;

afterEach(() => {
  db?.close();
  db = null;
});

describe('data queries', () => {
  it('lists people with message and media counts', () => {
    db = createTestDb();

    const people = getPeople({ limit: '5' }, db);

    expect(people.data[0]).toMatchObject({
      jid: 'alice@s.whatsapp.net',
      name: 'Alice',
      messageCount: 3,
      mediaCount: 1,
      sentByMe: 2,
      sentByThem: 1,
    });
    expect(people.pagination.total).toBeGreaterThanOrEqual(4);
  });

  it('lists chats and paginates chat messages', () => {
    db = createTestDb();
    db.prepare('INSERT INTO chats (jid, kind, name, last_message_at) VALUES (?, ?, ?, ?)').run('0@status', 'status', 'WhatsApp Status', 1_700_500_000);

    const chats = getChats({ limit: '5' }, db);
    const family = chats.data.find((chat) => chat.jid === 'family@g.us');

    expect(chats.data.map((chat) => chat.kind)).not.toContain('status');
    expect(family).toMatchObject({
      kind: 'group',
      name: 'Family Group',
      messageCount: 3,
      participantCount: 2,
    });

    const messages = getChatMessages('family@g.us', { limit: '2' }, db);
    expect(messages.data).toHaveLength(2);
    expect(messages.data[0]).toMatchObject({ msgId: 'm5', text: 'voice note' });
    expect(messages.pagination.total).toBe(3);
  });

  it('lists media items with file URLs', () => {
    db = createTestDb();

    const media = getMediaItems({ limit: '10' }, db);

    expect(media.data).toHaveLength(2);
    expect(media.data[0]).toMatchObject({
      mediaType: 'audio',
      mediaPath: '/tmp/voice.ogg',
      fileUrl: '/api/media/file?path=%2Ftmp%2Fvoice.ogg',
    });
  });

  it('does not list media rows without file paths', () => {
    db = createTestDb();
    const insertMessage = db.prepare(`
      INSERT INTO messages (
        source_pk, chat_jid, chat_name, msg_id, sender_jid, sender_name, ts,
        from_me, text, raw_type, message_type, media_type, media_path, media_size
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertMessage.run(7, 'family@g.us', 'Family', 'm7', 'bob@s.whatsapp.net', 'Bob', 1_700_432_001, 0, 'missing image', 0, 'image', 'image', '', null);
    insertMessage.run(8, 'family@g.us', 'Family', 'm8', 'bob@s.whatsapp.net', 'Bob', 1_700_432_002, 0, 'missing video', 0, 'video', 'video', null, null);

    const media = getMediaItems({ limit: '10' }, db);

    expect(media.data).toHaveLength(2);
    expect(media.pagination.total).toBe(2);
    expect(media.data.every((item) => item.mediaPath.trim().length > 0)).toBe(true);
  });

  it('searches text and names with snippets', () => {
    db = createTestDb();

    const results = searchMessages({ q: 'family', limit: '10' }, db);

    expect(results.data).toHaveLength(3);
    expect(results.data[0]).toMatchObject({
      chatJid: 'family@g.us',
      chatName: 'Family Group',
    });
    expect(results.data[0].snippet.toLowerCase()).toContain('family');
  });

  it('uses the FTS search index when it is available', () => {
    db = createTestDb();
    createSearchIndexes(db);
    db.prepare('UPDATE contacts SET full_name = ? WHERE jid = ?').run('Renamed Contact', 'alice@s.whatsapp.net');

    const results = searchMessages({ q: 'example', limit: '10' }, db);

    expect(results.data).toHaveLength(3);
    expect(results.data.every((result) => result.chatJid === 'alice@s.whatsapp.net')).toBe(true);
    expect(results.data[0]).toMatchObject({
      msgId: 'm6',
      chatName: 'Alice',
    });
  });

  it('resolves LID chat and sender identifiers to display names', () => {
    db = createTestDb();
    db.prepare('INSERT INTO chats (jid, kind, name, last_message_at) VALUES (?, ?, ?, ?)').run('89760605454342@lid', 'direct', 'Niv', 1_700_604_800);
    db.prepare('INSERT INTO contacts (jid, full_name, first_name, lid) VALUES (?, ?, ?, ?)').run('972533351664@s.whatsapp.net', 'Eynan Tzabar', 'Eynan', '272528660545772@lid');
    const insertMessage = db.prepare(`
      INSERT INTO messages (
        source_pk, chat_jid, chat_name, msg_id, sender_jid, sender_name, ts,
        from_me, text, raw_type, message_type, media_type, media_path, media_size
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertMessage.run(7, '89760605454342@lid', '89760605454342@lid', 'm7', null, null, 1_700_518_400, 1, 'lid direct', 0, 'text', null, null, null);
    insertMessage.run(8, 'family@g.us', 'Family', 'm8', '272528660545772@lid', 'IAA=', 1_700_604_800, 0, 'lid group', 0, 'image', 'image', '/tmp/lid.jpg', 25);

    const chats = getChats({ limit: '10' }, db);
    expect(chats.data.find((chat) => chat.jid === '89760605454342@lid')?.name).toBe('Niv');

    const directMessages = getChatMessages('89760605454342@lid', { limit: '10' }, db);
    expect(directMessages.data[0].chatName).toBe('Niv');

    const groupMessages = getChatMessages('family@g.us', { limit: '10' }, db);
    expect(groupMessages.data.find((message) => message.msgId === 'm8')?.senderName).toBe('Eynan Tzabar');

    const media = getMediaItems({ limit: '10' }, db);
    expect(media.data.find((item) => item.mediaPath === '/tmp/lid.jpg')?.senderName).toBe('Eynan Tzabar');

    const results = searchMessages({ q: 'lid', limit: '10' }, db);
    expect(results.data.find((result) => result.msgId === 'm7')?.chatName).toBe('Niv');
    expect(results.data.find((result) => result.msgId === 'm8')?.senderName).toBe('Eynan Tzabar');
  });

  it('supports JID filtering in getChats', () => {
    db = createTestDb();
    const chats = getChats({ jid: 'alice@s.whatsapp.net' }, db);
    expect(chats.data).toHaveLength(1);
    expect(chats.data[0].jid).toBe('alice@s.whatsapp.net');
    expect(chats.pagination.total).toBe(1);
  });

  it('correctly calculates message offset', () => {
    db = createTestDb();
    const m4Row = db.prepare("SELECT rowid, ts FROM messages WHERE msg_id = 'm4'").get() as { rowid: number; ts: number };
    const countRow = db.prepare(`
      SELECT COUNT(*) AS count
      FROM messages
      WHERE chat_jid = 'family@g.us' AND (ts > ? OR (ts = ? AND rowid > ?))
    `).get(m4Row.ts, m4Row.ts, m4Row.rowid) as { count: number };
    expect(countRow.count).toBe(1);
  });
});
