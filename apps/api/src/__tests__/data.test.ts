import type Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
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

    const chats = getChats({ limit: '5' }, db);
    const family = chats.data.find((chat) => chat.jid === 'family@g.us');

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
});
