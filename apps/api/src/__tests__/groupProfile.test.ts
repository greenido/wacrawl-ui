import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getGroupDirectory, getGroupProfile, NotAGroupError } from '../routes/stats.js';
import { ChatNotFoundError } from '../routes/stats.js';
import { createEmptyDb } from './testDb.js';

let db: Database.Database | null = null;
let nextPk = 1;

const GROUP = 'team@g.us';
const DAY = 86_400;
const BASE_TS = 1_700_000_000;

afterEach(() => {
  db?.close();
  db = null;
});

beforeEach(() => {
  nextPk = 1;
});

function addChat(database: Database.Database, jid: string, kind: string, name: string): void {
  database
    .prepare('INSERT OR IGNORE INTO chats (jid, kind, name, last_message_at) VALUES (?, ?, ?, ?)')
    .run(jid, kind, name, null);
}

function addGroup(database: Database.Database, jid: string, name: string, ownerJid: string | null): void {
  addChat(database, jid, 'group', name);
  database
    .prepare('INSERT OR IGNORE INTO groups (jid, name, owner_jid, created_at) VALUES (?, ?, ?, ?)')
    .run(jid, name, ownerJid, BASE_TS - 30 * DAY);
}

function addMember(
  database: Database.Database,
  jid: string,
  name: string,
  { admin = false, active = true, group = GROUP } = {},
): void {
  database
    .prepare(`
      INSERT OR REPLACE INTO group_participants (group_jid, user_jid, contact_name, first_name, is_admin, is_active)
      VALUES (?, ?, ?, NULL, ?, ?)
    `)
    .run(group, jid, name, admin ? 1 : 0, active ? 1 : 0);
}

function say(
  database: Database.Database,
  senderJid: string | null,
  count: number,
  { group = GROUP, text = 'hello everyone', dayOffset = 0 } = {},
): void {
  const insert = database.prepare(`
    INSERT INTO messages (
      source_pk, chat_jid, chat_name, msg_id, sender_jid, sender_name, ts,
      from_me, text, raw_type, message_type, media_type, media_path, media_size
    )
    VALUES (?, ?, 'Team', ?, ?, ?, ?, ?, ?, 0, 'text', NULL, NULL, NULL)
  `);
  for (let i = 0; i < count; i += 1) {
    const pk = nextPk++;
    insert.run(
      pk,
      group,
      `m${pk}`,
      senderJid,
      senderJid ? senderJid.split('@')[0] : null,
      BASE_TS + dayOffset * DAY + i * 60,
      senderJid === null ? 1 : 0,
      text,
    );
  }
}

/** A group where two people carry the conversation and three watch. */
function seedLopsidedGroup(database: Database.Database): void {
  addGroup(database, GROUP, 'Team', 'ana@s.whatsapp.net');
  addMember(database, 'ana@s.whatsapp.net', 'Ana', { admin: true });
  addMember(database, 'ben@s.whatsapp.net', 'Ben');
  addMember(database, 'cleo@s.whatsapp.net', 'Cleo');
  addMember(database, 'dan@s.whatsapp.net', 'Dan');
  addMember(database, 'eve@s.whatsapp.net', 'Eve', { admin: true });
  addMember(database, 'gone@s.whatsapp.net', 'Departed Member', { active: false });

  say(database, 'ana@s.whatsapp.net', 60);
  say(database, 'ben@s.whatsapp.net', 30);
  say(database, 'cleo@s.whatsapp.net', 10);
  say(database, null, 5);
}

describe('group profile', () => {
  it('counts the members who never speak', () => {
    db = createEmptyDb();
    seedLopsidedGroup(db);

    const profile = getGroupProfile({ jid: GROUP }, db);

    expect(profile.roster).toEqual({
      total: 6,
      active: 5,
      others: 5,
      departed: 1,
      admins: 2,
      speakers: 3,
      lurkers: 2,
    });
    // Admins first, so a moderator who never posts is the first thing you see.
    expect(profile.quietMembers).toEqual([
      { jid: 'eve@s.whatsapp.net', name: 'Eve', isAdmin: true },
      { jid: 'dan@s.whatsapp.net', name: 'Dan', isAdmin: false },
    ]);
  });

  it('measures how lopsided the conversation is', () => {
    db = createEmptyDb();
    seedLopsidedGroup(db);

    const profile = getGroupProfile({ jid: GROUP }, db);

    // 100 received messages; my own 5 are excluded from talk share.
    // Names come from the group's own roster, not the push name each sender
    // chose for themselves.
    expect(profile.topParticipants.map((p) => [p.name, p.messageCount, p.share])).toEqual([
      ['Ana', 60, 0.6],
      ['Ben', 30, 0.3],
      ['Cleo', 10, 0.1],
    ]);
    expect(profile.concentration).toEqual({ topOneShare: 0.6, topFiveShare: 1 });
  });

  it('marks a talker who has left the group', () => {
    db = createEmptyDb();
    seedLopsidedGroup(db);
    say(db, 'gone@s.whatsapp.net', 200);

    const top = getGroupProfile({ jid: GROUP }, db).topParticipants[0];

    expect(top).toMatchObject({ name: 'Departed Member', isActive: false, messageCount: 200 });
    // Departed members are not lurkers — they are not current members at all.
    expect(getGroupProfile({ jid: GROUP }, db).roster.lurkers).toBe(2);
  });

  it('reports totals and identity from the groups table', () => {
    db = createEmptyDb();
    seedLopsidedGroup(db);

    const profile = getGroupProfile({ jid: GROUP }, db);

    expect(profile.name).toBe('Team');
    expect(profile.ownerJid).toBe('ana@s.whatsapp.net');
    expect(profile.ownerName).toBe('Ana');
    expect(profile.createdAt).toBe(new Date((BASE_TS - 30 * DAY) * 1000).toISOString());
    expect(profile.totals).toMatchObject({ messages: 105, sentByMe: 5, media: 0 });
    expect(profile.hasRoster).toBe(true);
  });

  it('still works on an archive with no group tables', () => {
    db = createEmptyDb();
    db.exec('DROP TABLE group_participants; DROP TABLE groups;');
    addChat(db, GROUP, 'group', 'Team');
    say(db, 'ana@s.whatsapp.net', 4);

    const profile = getGroupProfile({ jid: GROUP }, db);

    expect(profile.hasRoster).toBe(false);
    expect(profile.roster).toEqual({ total: 0, active: 0, others: 0, departed: 0, admins: 0, speakers: 0, lurkers: 0 });
    expect(profile.topParticipants).toHaveLength(1);
    expect(profile.totals.messages).toBe(4);
  });

  it('refuses a chat that is not a group, and 404s one that does not exist', () => {
    db = createEmptyDb();
    addChat(db, 'ana@s.whatsapp.net', 'dm', 'Ana');

    expect(() => getGroupProfile({ jid: 'ana@s.whatsapp.net' }, db)).toThrow(NotAGroupError);
    expect(() => getGroupProfile({ jid: 'nobody@g.us' }, db)).toThrow(ChatNotFoundError);
    expect(() => getGroupProfile({}, db)).toThrow(ChatNotFoundError);
  });

  it('divides by zero safely in a group where only I have spoken', () => {
    db = createEmptyDb();
    addGroup(db, GROUP, 'Team', null);
    addMember(db, 'ana@s.whatsapp.net', 'Ana');
    say(db, null, 3);

    const profile = getGroupProfile({ jid: GROUP }, db);

    expect(profile.concentration).toEqual({ topOneShare: 0, topFiveShare: 0 });
    expect(profile.topParticipants).toEqual([]);
    expect(profile.roster.lurkers).toBe(1);
  });
});

describe('group profile identity handling', () => {
  it('merges a member who appears as both a phone JID and a LID', () => {
    db = createEmptyDb();
    addGroup(db, GROUP, 'Team', null);
    db.prepare('INSERT INTO contacts (jid, full_name, lid) VALUES (?, ?, ?)')
      .run('15550105678@s.whatsapp.net', 'Katherine Johnson', '200000000000002@lid');
    addMember(db, '200000000000002@lid', 'Katherine Johnson');
    addMember(db, 'ben@s.whatsapp.net', 'Ben');

    // The same person, sending under both of their identifiers.
    say(db, '200000000000002@lid', 8);
    say(db, '15550105678@s.whatsapp.net', 2);
    say(db, 'ben@s.whatsapp.net', 5);

    const top = getGroupProfile({ jid: GROUP }, db).topParticipants;

    expect(top.map((p) => [p.name, p.messageCount])).toEqual([
      ['Katherine Johnson', 10],
      ['Ben', 5],
    ]);
  });

  it('counts a member recorded twice as one person', () => {
    db = createEmptyDb();
    addGroup(db, GROUP, 'Team', null);
    db.prepare('INSERT INTO contacts (jid, full_name, lid) VALUES (?, ?, ?)')
      .run('15550109876@s.whatsapp.net', 'Mary Jackson', '200000000000003@lid');
    // How a real archive stores one member: a current LID row, plus a stale
    // phone row from an earlier sync that still says they have left.
    addMember(db, '200000000000003@lid', 'Mary Jackson', { admin: true, active: true });
    addMember(db, '15550109876@s.whatsapp.net', null as unknown as string, { admin: false, active: false });
    addMember(db, 'ben@s.whatsapp.net', 'Ben');
    say(db, '200000000000003@lid', 5);

    const profile = getGroupProfile({ jid: GROUP }, db);

    expect(profile.roster).toMatchObject({ total: 2, active: 2, departed: 0, admins: 1 });
    // The stale row must not turn a current member into a departed one.
    expect(profile.topParticipants[0]).toMatchObject({ name: 'Mary Jackson', isActive: true, isAdmin: true });
    expect(getGroupDirectory({}, db)[0].memberCount).toBe(2);
  });

  it('does not call the account owner a lurker', () => {
    db = createEmptyDb();
    // I am a member of every group I post in; that is what identifies me.
    for (const suffix of ['a', 'b', 'c']) {
      const jid = `${suffix}@g.us`;
      addGroup(db, jid, `Group ${suffix}`, null);
      addMember(db, 'me@s.whatsapp.net', 'Archive Owner', { group: jid });
      addMember(db, `talker-${suffix}@s.whatsapp.net`, `Talker ${suffix}`, { group: jid });
      say(db, `talker-${suffix}@s.whatsapp.net`, 3, { group: jid });
      say(db, null, 2, { group: jid });
    }

    const profile = getGroupProfile({ jid: 'a@g.us' }, db);

    expect(profile.quietMembers).toEqual([]);
    expect(profile.roster).toMatchObject({ active: 2, others: 1, speakers: 1, lurkers: 0 });
  });

  it('counts me as an ordinary member when there are too few groups to be sure', () => {
    db = createEmptyDb();
    // With two shared groups a spouse looks exactly like the account owner, so
    // the heuristic declines to guess rather than hiding a real lurker.
    for (const suffix of ['a', 'b']) {
      const jid = `${suffix}@g.us`;
      addGroup(db, jid, `Group ${suffix}`, null);
      addMember(db, 'me@s.whatsapp.net', 'Archive Owner', { group: jid });
      say(db, null, 2, { group: jid });
    }

    expect(getGroupProfile({ jid: 'a@g.us' }, db).roster.lurkers).toBe(1);
  });

  it('ignores announcements sent under the group\'s own JID', () => {
    db = createEmptyDb();
    addGroup(db, GROUP, 'Team', null);
    addMember(db, 'ana@s.whatsapp.net', 'Ana');
    say(db, GROUP, 40, { text: 'group was created' });
    say(db, 'ana@s.whatsapp.net', 4);

    const profile = getGroupProfile({ jid: GROUP }, db);

    expect(profile.topParticipants.map((p) => p.jid)).toEqual(['ana@s.whatsapp.net']);
    expect(profile.concentration.topOneShare).toBe(1);
  });
});

describe('group directory', () => {
  it('reports member count, which the chat list cannot', () => {
    db = createEmptyDb();
    seedLopsidedGroup(db);
    addGroup(db, 'big@g.us', 'Big Broadcast', null);
    for (let i = 0; i < 20; i += 1) {
      addMember(db, `p${i}@s.whatsapp.net`, `Person ${i}`, { group: 'big@g.us' });
    }
    say(db, 'p0@s.whatsapp.net', 2, { group: 'big@g.us' });

    const byMembers = getGroupDirectory({ sort: 'members' }, db);

    expect(byMembers.map((g) => [g.name, g.memberCount, g.messageCount])).toEqual([
      ['Big Broadcast', 20, 2],
      ['Team', 5, 105],
    ]);
    expect(getGroupDirectory({ sort: 'messages' }, db)[0].name).toBe('Team');
  });

  it('surfaces the groups I only lurk in', () => {
    db = createEmptyDb();
    seedLopsidedGroup(db);

    const [team] = getGroupDirectory({ sort: 'messages' }, db);

    expect(team.sentByMe).toBe(5);
    expect(team.messageCount).toBe(105);
  });

  it('leaves member count null when the archive has no roster', () => {
    db = createEmptyDb();
    db.exec('DROP TABLE group_participants; DROP TABLE groups;');
    addChat(db, GROUP, 'group', 'Team');
    say(db, 'ana@s.whatsapp.net', 1);

    expect(getGroupDirectory({}, db)).toEqual([
      expect.objectContaining({ name: 'Team', memberCount: null, messageCount: 1, createdAt: null }),
    ]);
  });

  it('lists only groups', () => {
    db = createEmptyDb();
    seedLopsidedGroup(db);
    addChat(db, 'ana@s.whatsapp.net', 'dm', 'Ana');
    addChat(db, '0@status', 'status', 'Status');

    expect(getGroupDirectory({}, db).map((g) => g.jid)).toEqual([GROUP]);
  });
});
