import type Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { getWordCloud } from '../routes/stats.js';
import { createEmptyDb } from './testDb.js';

let db: Database.Database | null = null;

afterEach(() => {
  db?.close();
  db = null;
});

function seed(database: Database.Database, texts: string[]): void {
  database
    .prepare('INSERT OR IGNORE INTO chats (jid, kind, name, last_message_at) VALUES (?, ?, ?, ?)')
    .run('chat@s.whatsapp.net', 'direct', 'Chat', null);
  const insert = database.prepare(`
    INSERT INTO messages (
      source_pk, chat_jid, chat_name, msg_id, sender_jid, sender_name, ts,
      from_me, text, raw_type, message_type, media_type, media_path, media_size
    )
    VALUES (?, 'chat@s.whatsapp.net', 'Chat', ?, NULL, NULL, ?, 1, ?, 0, 'text', NULL, NULL, NULL)
  `);
  texts.forEach((text, index) => insert.run(index + 1, `m${index}`, 1_700_000_000 + index, text));
}

function terms(database: Database.Database, filter: 'all' | 'useful' = 'all'): Map<string, number> {
  const { terms: list } = getWordCloud({ period: 'all', limit: '200', filter }, database);
  return new Map(list.map((t) => [t.text, t.value]));
}

describe('word cloud tokenizer', () => {
  it('counts Hebrew words that the ASCII tokenizer threw away', () => {
    db = createEmptyDb();
    seed(db, ['הפגישה מחר בבוקר', 'מחר יהיה גשם', 'deploy the הפגישה notes']);

    const counts = terms(db);

    expect(counts.get('הפגישה')).toBe(2);
    expect(counts.get('מחר')).toBe(2);
    expect(counts.get('deploy')).toBe(1);
  });

  it('keeps a bilingual message from collapsing to its English half', () => {
    db = createEmptyDb();
    seed(db, ['שלח לי את הקובץ please']);

    // The three-character floor is inherited from the English tokenizer, so the
    // two-letter particles לי and את drop out the same way "to" and "of" do.
    expect([...terms(db).keys()].sort()).toEqual(['please', 'הקובץ', 'שלח'].sort());
  });

  it('drops Hebrew filler in useful mode', () => {
    db = createEmptyDb();
    // תודה / בסדר / אני are filler; פרויקט is not.
    seed(db, ['תודה בסדר אני פרויקט', 'תודה פרויקט']);

    const useful = terms(db, 'useful');

    expect(useful.get('פרויקט')).toBe(2);
    expect(useful.has('תודה')).toBe(false);
    expect(useful.has('בסדר')).toBe(false);
    expect(useful.has('אני')).toBe(false);
  });

  it('handles Cyrillic and Greek for free', () => {
    db = createEmptyDb();
    seed(db, ['привет мир', 'καλημέρα κόσμε']);

    expect([...terms(db).keys()].sort()).toEqual(['καλημέρα', 'κόσμε', 'мир', 'привет'].sort());
  });

  it('still excludes emoji and punctuation', () => {
    db = createEmptyDb();
    seed(db, ['great 🎉🎉 work!!! -- yes']);

    expect([...terms(db).keys()].sort()).toEqual(['great', 'work', 'yes']);
  });

  it('drops digit-only tokens in useful mode, in any numbering system', () => {
    db = createEmptyDb();
    seed(db, ['2024 budget ٢٠٢٤']);

    expect([...terms(db, 'useful').keys()]).toEqual(['budget']);
    expect([...terms(db).keys()].sort()).toEqual(['2024', 'budget', '٢٠٢٤'].sort());
  });

  it('drops media keys and URL slugs in useful mode', () => {
    db = createEmptyDb();
    // Real archives leak attachment identifiers into message text; these were
    // ranking above genuine vocabulary on a profile page.
    seed(db, [
      'enk6krxnr4il6ime k939zqn6rzkxqawinplk1ciqry renovation',
      'renovation covid19 mp3 abcdefghijkl',
    ]);

    const useful = [...terms(db, 'useful').keys()];

    expect(useful).toContain('renovation');
    // Ordinary short alphanumerics survive; so does a long all-letter word.
    expect(useful).toContain('covid19');
    expect(useful).toContain('abcdefghijkl');
    expect(useful).not.toContain('enk6krxnr4il6ime');
    expect(useful).not.toContain('k939zqn6rzkxqawinplk1ciqry');
  });

  it('reports how much of the archive it read', () => {
    db = createEmptyDb();
    seed(db, ['one two three', 'four five six']);

    expect(getWordCloud({ period: 'all' }, db).scan).toMatchObject({
      scanned: 2,
      limit: 30_000,
      truncated: false,
    });
  });
});
