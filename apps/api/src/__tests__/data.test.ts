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

    expect(results.data).toHaveLength(2);
    expect(results.data[0]).toMatchObject({
      chatJid: 'family@g.us',
      chatName: 'Family',
    });
    expect(results.data[0].snippet.toLowerCase()).toContain('family');
  });
});
