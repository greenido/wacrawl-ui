import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { ARCHIVE_SCHEMA_SQL } from '../lib/archiveSchema.js';
import { createSearchIndexes } from '../lib/searchIndex.js';
import {
  CAPTIONS,
  DIRECT_PERSONAS,
  EMOJIS_MINE,
  EMOJIS_THEIRS,
  EXTRA_CONTACTS,
  GROUP_PERSONAS,
  LINK_INTROS,
  LINK_TEMPLATES,
  MY_TEMPLATES,
  SILENT_GROUP,
  THEIR_TEMPLATES,
  TOPICS,
  type Shape,
  type TopicName,
} from './demoCast.js';
import { demoMediaPath, writeDemoMedia, type DemoMediaType, type Rng } from './demoMedia.js';

/**
 * A synthetic WaCrawl archive for `--demo`, the smoke tests and the screenshots.
 *
 * Same seed and same `now` give the same archive, row for row. `now` is an input
 * rather than a read of the clock because the dashboard's windows ("this year",
 * "last 90 days") are relative to today, so a demo has to end today to fill them.
 */
export interface DemoArchiveOptions {
  /** Created if missing. Receives `wacrawl-demo.db` and a `media/` folder. */
  dir: string;
  seed?: number;
  now?: Date;
}

export interface DemoArchive {
  dbPath: string;
  mediaRoot: string;
  messages: number;
  chats: number;
  contacts: number;
}

export const DEFAULT_DEMO_SEED = 1815;

const DAY_SECONDS = 86_400;
const MONTH_SECONDS = 30 * DAY_SECONDS;
const SELF_JID = '15550000000@s.whatsapp.net';

/** Messaging by hour of day: quiet nights, a lunch bump, a long evening. */
const HOUR_WEIGHTS = [2, 1, 1, 0, 0, 0, 1, 3, 6, 7, 7, 7, 9, 8, 6, 6, 6, 7, 9, 12, 14, 14, 10, 5];
const NIGHT_OWL_WEIGHTS = HOUR_WEIGHTS.map((weight, hour) => (hour < 5 ? weight + 8 : weight));
const WEEKDAY_FACTOR = [1.15, 0.85, 0.9, 0.95, 1, 1.1, 1.35];

const MEDIA_MIX: Array<[DemoMediaType, number, number, number]> = [
  // type, weight, smallest bytes, largest bytes
  ['image', 55, 80_000, 2_400_000],
  ['audio', 20, 40_000, 900_000],
  ['video', 10, 2_000_000, 40_000_000],
  ['sticker', 10, 12_000, 60_000],
  ['document', 5, 50_000, 6_000_000],
];
const RAW_TYPES: Record<DemoMediaType, number> = { image: 1, video: 2, audio: 3, document: 8, sticker: 15 };

/** Small, seedable and the same on every platform, unlike Math.random. */
function mulberry32(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)];
}

function weightedIndex(rng: Rng, weights: readonly number[]): number {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let roll = rng() * total;
  for (let i = 0; i < weights.length; i += 1) {
    roll -= weights[i];
    if (roll < 0) return i;
  }
  return weights.length - 1;
}

/** Knuth's method; the rates here are all small. */
function poisson(rng: Rng, rate: number): number {
  const limit = Math.exp(-rate);
  let count = 0;
  let product = rng();
  while (product > limit) {
    count += 1;
    product *= rng();
  }
  return count;
}

/** Reply gaps are long-tailed: mostly near the median, occasionally hours later. */
function replyGapSeconds(rng: Rng, medianMinutes: number): number {
  const gaussian = Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
  const lateFactor = rng() < 0.06 ? 12 : 1;
  return Math.max(5, Math.round(medianMinutes * 60 * Math.exp(0.9 * gaussian) * lateFactor));
}

function activityFactor(shape: Shape, monthsAgo: number, startMonthsAgo: number, stoppedMonthsAgo = 0): number {
  const age = 1 - monthsAgo / startMonthsAgo;
  switch (shape) {
    case 'steady': return 1;
    case 'growing': return 0.25 + 1.25 * age;
    case 'fading': return Math.max(0.08, 1.4 - 1.35 * age);
    case 'arc': return 0.15 + Math.sin(Math.PI * age);
    case 'stopped': return monthsAgo < stoppedMonthsAgo ? 0 : 1;
  }
}

interface Person {
  name: string;
  jid: string;
  lid: string | null;
}

interface PlannedMessage {
  chatJid: string;
  chatName: string;
  senderJid: string | null;
  senderName: string | null;
  ts: number;
  fromMe: boolean;
  text: string | null;
  mediaType: DemoMediaType | null;
  mediaPath: string | null;
  mediaSize: number | null;
}

interface ChatPlan {
  jid: string;
  kind: 'dm' | 'group';
  name: string;
  archived: boolean;
  sessions: number;
  shape: Shape;
  startMonthsAgo: number;
  stoppedMonthsAgo?: number;
  turns: number;
  topics: readonly TopicName[];
  hourWeights: readonly number[];
  /** Chance that a new conversation, or the next turn in a group, is mine. */
  mine: number;
  /** Who else speaks, with how much. Empty only for `SILENT_GROUP`. */
  others: Person[];
  otherWeights: number[];
  theirReply: number;
  myReply: number;
  ghost: number;
}

function phoneJid(index: number): string {
  return `1555000${String(1000 + index)}@s.whatsapp.net`;
}

function buildPeople(): Map<string, Person> {
  const people = new Map<string, Person>();
  let index = 1;
  for (const persona of DIRECT_PERSONAS) {
    people.set(persona.name, {
      name: persona.name,
      jid: phoneJid(index),
      lid: persona.hasLid ? `9000000000${String(index).padStart(3, '0')}@lid` : null,
    });
    index += 1;
  }
  for (const name of EXTRA_CONTACTS) {
    people.set(name, { name, jid: phoneJid(index), lid: null });
    index += 1;
  }
  return people;
}

function composeText(rng: Rng, plan: ChatPlan, fromMe: boolean): string {
  const words = TOPICS[pick(rng, plan.topics)];
  const template = pick(rng, fromMe ? MY_TEMPLATES : THEIR_TEMPLATES);
  const text = template.replaceAll('{a}', pick(rng, words)).replaceAll('{b}', pick(rng, words));
  if (rng() < 0.16) return `${text} ${pick(rng, fromMe ? EMOJIS_MINE : EMOJIS_THEIRS)}`;
  return text;
}

function composeLink(rng: Rng): string {
  const id = Math.floor(rng() * 1_000_000_000).toString(36);
  return `${pick(rng, LINK_INTROS)} ${pick(rng, LINK_TEMPLATES).replace('{id}', id)}`;
}

function planChats(people: Map<string, Person>): ChatPlan[] {
  const person = (name: string) => people.get(name)!;
  const direct: ChatPlan[] = DIRECT_PERSONAS.map((persona) => ({
    jid: person(persona.name).jid,
    kind: 'dm',
    name: persona.name,
    archived: Boolean(persona.archived),
    sessions: persona.sessions,
    shape: persona.shape,
    startMonthsAgo: persona.startMonthsAgo,
    stoppedMonthsAgo: persona.stoppedMonthsAgo,
    turns: persona.turns,
    topics: persona.topics,
    hourWeights: persona.nightOwl ? NIGHT_OWL_WEIGHTS : HOUR_WEIGHTS,
    mine: persona.initiates,
    others: [person(persona.name)],
    otherWeights: [1],
    theirReply: persona.reply,
    myReply: persona.myReply,
    ghost: persona.ghost ?? 0,
  }));

  // Everybody draws from one fixed ordering, shifted per group, so that the same
  // few people turn up across groups the way friends do.
  const everyone = [...people.values()];
  const groups: ChatPlan[] = GROUP_PERSONAS.map((persona, index) => {
    const offset = (index * 7) % everyone.length;
    const roster = Array.from({ length: persona.members }, (_, i) => everyone[(offset + i) % everyone.length]);
    return {
      jid: groupJid(index),
      kind: 'group',
      name: persona.name,
      archived: Boolean(persona.archived),
      sessions: persona.sessions,
      shape: persona.shape,
      startMonthsAgo: persona.startMonthsAgo,
      stoppedMonthsAgo: persona.stoppedMonthsAgo,
      turns: persona.turns,
      topics: persona.topics,
      hourWeights: HOUR_WEIGHTS,
      mine: persona.myShare,
      others: roster.slice(0, persona.speakers),
      // Roughly Zipfian: in most groups a handful of people do the talking.
      otherWeights: roster.slice(0, persona.speakers).map((_, i) => 1 / (i + 1)),
      theirReply: 8,
      myReply: 12,
      ghost: 0,
    };
  });

  return [...direct, ...groups];
}

function groupJid(index: number): string {
  return `120363000000${String(100 + index)}@g.us`;
}

/** Pick the sender. In a direct chat turns alternate; a group just has a next speaker. */
function nextMine(rng: Rng, plan: ChatPlan, previousMine: boolean): boolean {
  if (plan.kind === 'dm') return rng() < 0.28 ? previousMine : !previousMine;
  return rng() < plan.mine;
}

function planMessage(rng: Rng, plan: ChatPlan, ts: number, fromMe: boolean, text?: string): PlannedMessage {
  const speaker = fromMe ? null : plan.others[weightedIndex(rng, plan.otherWeights)];

  // Real archives record a person by `@lid` in some group messages and leave the
  // name for the contacts join to fill in; both spellings have to merge.
  const useLid = plan.kind === 'group' && speaker?.lid != null && rng() < 0.35;
  const message: PlannedMessage = {
    chatJid: plan.jid,
    chatName: plan.name,
    // My own JID is never written down: a group records the group, a direct chat nothing.
    senderJid: speaker ? (useLid ? speaker.lid : speaker.jid) : plan.kind === 'group' ? plan.jid : null,
    senderName: speaker && !useLid ? speaker.name : null,
    ts,
    fromMe,
    text: text ?? null,
    mediaType: null,
    mediaPath: null,
    mediaSize: null,
  };
  if (text !== undefined) return message;

  const roll = rng();
  if (roll < 0.08) {
    const [type, , smallest, largest] = MEDIA_MIX[weightedIndex(rng, MEDIA_MIX.map((entry) => entry[1]))];
    message.mediaType = type;
    message.mediaPath = demoMediaPath(type, rng);
    message.mediaSize = Math.round(smallest + rng() * (largest - smallest));
    if (type === 'image' && rng() < 0.3) message.text = pick(rng, CAPTIONS);
  } else if (roll < 0.11) {
    message.text = composeLink(rng);
  } else {
    message.text = composeText(rng, plan, fromMe);
  }
  return message;
}

function planSession(rng: Rng, plan: ChatPlan, startTs: number, nowTs: number, out: PlannedMessage[]): void {
  let fromMe = rng() < plan.mine;
  if (fromMe && rng() < plan.ghost) {
    out.push(planMessage(rng, plan, startTs, true));
    return;
  }

  const turns = 1 + Math.floor(-Math.log(1 - rng()) * (plan.turns - 1));
  let ts = startTs;
  for (let turn = 0; turn < turns && ts <= nowTs; turn += 1) {
    out.push(planMessage(rng, plan, ts, fromMe));
    const nextIsMine = nextMine(rng, plan, fromMe);
    ts += nextIsMine === fromMe
      ? Math.round(8 + rng() * 150)
      : replyGapSeconds(rng, nextIsMine ? plan.myReply : plan.theirReply);
    fromMe = nextIsMine;
  }
}

function planHistory(rng: Rng, plans: ChatPlan[], nowTs: number): PlannedMessage[] {
  const out: PlannedMessage[] = [];
  const today = Math.floor(nowTs / DAY_SECONDS) * DAY_SECONDS;
  const longestHistory = Math.max(...plans.map((plan) => plan.startMonthsAgo));

  for (const plan of plans) {
    const startDay = today - Math.round(plan.startMonthsAgo * 30) * DAY_SECONDS;
    for (let day = startDay; day <= today; day += DAY_SECONDS) {
      const monthsAgo = (today - day) / MONTH_SECONDS;
      const date = new Date(day * 1000);
      // Everyone gets busier year on year, and December is December.
      const trend = 0.7 + 0.5 * (1 - monthsAgo / longestHistory);
      const season = date.getUTCMonth() === 11 ? 1.5 : date.getUTCMonth() === 7 ? 0.75 : 1;
      const rate = (plan.sessions / 30)
        * activityFactor(plan.shape, monthsAgo, plan.startMonthsAgo, plan.stoppedMonthsAgo)
        * WEEKDAY_FACTOR[date.getUTCDay()]
        * trend
        * season;

      for (let session = poisson(rng, rate); session > 0; session -= 1) {
        const hour = weightedIndex(rng, plan.hourWeights);
        const startTs = day + hour * 3600 + Math.floor(rng() * 3600);
        if (startTs <= nowTs) planSession(rng, plan, startTs, nowTs, out);
      }
    }
  }
  return out;
}

/**
 * The fixed points the smoke tests and the current-streak card rely on. Random
 * history cannot promise that a term exists, or that today has any messages.
 */
function planMilestones(rng: Rng, plans: ChatPlan[], nowTs: number): PlannedMessage[] {
  const planFor = (name: string) => plans.find((plan) => plan.name === name)!;
  const ada = planFor('Ada Lovelace');
  const family = planFor('Family Dinner Planning');
  const bookClub = planFor('Book Club');
  const grace = planFor('Grace Hopper');
  const daysAgo = (days: number, hour = 19) => Math.floor(nowTs / DAY_SECONDS) * DAY_SECONDS - days * DAY_SECONDS + hour * 3600;

  const out: PlannedMessage[] = [
    planMessage(rng, ada, daysAgo(12), true, 'The lighthouse trip is booked for the long weekend'),
    planMessage(rng, ada, daysAgo(12) + 240, false, 'Perfect, I will bring the old lighthouse logbook'),
    planMessage(rng, bookClub, daysAgo(30), false, 'Next month we read To the Lighthouse, paperback copies at the library'),
    // A message in the last few hours keeps Day and the current streak populated.
    planMessage(rng, ada, nowTs - 2 * 3600, false, 'Are we still on for tonight?'),
    planMessage(rng, ada, nowTs - 2 * 3600 + 120, true, 'Definitely, see you at seven'),
    planMessage(rng, family, nowTs - 5 * 3600, false, 'Who is bringing dessert on Sunday?'),
    planMessage(rng, grace, nowTs - 9 * 3600, false, 'The deploy went out, thanks for the review'),
  ];

  for (let day = 1; day <= 60; day += 1) {
    const hour = 8 + Math.floor(rng() * 14);
    out.push(planMessage(rng, ada, daysAgo(day, hour), rng() < 0.5, 'Morning! How did it go?'));
  }
  return out;
}

function insertPeople(db: Database.Database, people: Map<string, Person>): void {
  const insertContact = db.prepare(`
    INSERT INTO contacts (jid, phone, full_name, first_name, last_name, business_name, lid)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  for (const { jid, lid, name } of people.values()) {
    const [first, ...rest] = name.split(' ');
    insertContact.run(jid, jid.split('@')[0], name, first, rest.join(' ') || null, null, lid);
  }
  // The other shapes an address book holds: a business, and a bare number.
  insertContact.run('15550001900@s.whatsapp.net', '15550001900', null, null, null, 'Analytical Engine Repairs', null);
  insertContact.run('15550001901@s.whatsapp.net', '15550001901', null, null, null, null, null);
}

function insertGroups(db: Database.Database, people: Map<string, Person>, nowTs: number): void {
  const insertGroup = db.prepare('INSERT INTO groups (jid, name, owner_jid, created_at) VALUES (?, ?, ?, ?)');
  const insertMember = db.prepare(`
    INSERT INTO group_participants (group_jid, user_jid, contact_name, first_name, is_admin, is_active)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const everyone = [...people.values()];
  const seedRoster = (jid: string, members: Person[]) => {
    // I am on every roster, and on no other record: see lib/selfIdentity.ts.
    insertMember.run(jid, SELF_JID, null, null, 0, 1);
    members.forEach((member, i) => {
      const user = member.lid && i % 2 === 1 ? member.lid : member.jid;
      insertMember.run(jid, user, member.name, member.name.split(' ')[0], i === 0 ? 1 : 0, 1);
    });
  };

  GROUP_PERSONAS.forEach((persona, index) => {
    const offset = (index * 7) % everyone.length;
    const roster = Array.from({ length: persona.members }, (_, i) => everyone[(offset + i) % everyone.length]);
    const founded = nowTs - Math.round(persona.foundedYearsAgo * 365.25) * DAY_SECONDS;
    insertGroup.run(groupJid(index), persona.name, roster[0].jid, founded);
    seedRoster(groupJid(index), roster);
  });

  const silentJid = groupJid(GROUP_PERSONAS.length);
  const silentRoster = everyone.slice(0, SILENT_GROUP.members);
  insertGroup.run(silentJid, SILENT_GROUP.name, silentRoster[0].jid, nowTs - SILENT_GROUP.foundedYearsAgo * 365 * DAY_SECONDS);
  seedRoster(silentJid, silentRoster);
}

export function generateDemoArchive(options: DemoArchiveOptions): DemoArchive {
  const nowTs = Math.floor((options.now ?? new Date()).getTime() / 1000);
  const rng = mulberry32(options.seed ?? DEFAULT_DEMO_SEED);
  const dbPath = path.join(options.dir, 'wacrawl-demo.db');
  const mediaRoot = path.join(options.dir, 'media');

  fs.mkdirSync(options.dir, { recursive: true });
  writeDemoMedia(mediaRoot, rng);

  const people = buildPeople();
  const plans = planChats(people);
  const messages = [...planHistory(rng, plans, nowTs), ...planMilestones(rng, plans, nowTs)]
    .filter((message) => message.ts <= nowTs)
    .sort((a, b) => a.ts - b.ts);

  const db = new Database(dbPath);
  try {
    db.pragma('synchronous = OFF');
    db.exec(ARCHIVE_SCHEMA_SQL);
    db.exec(`
      ALTER TABLE chats ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;
      CREATE TABLE sync_state (key TEXT PRIMARY KEY, value TEXT);
    `);

    db.transaction(() => {
      insertPeople(db, people);
      insertGroups(db, people, nowTs);

      const insertMessage = db.prepare(`
        INSERT INTO messages (
          source_pk, chat_jid, chat_name, msg_id, sender_jid, sender_name, ts,
          from_me, text, raw_type, message_type, media_type, media_path, media_size
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const lastByChat = new Map<string, number>();
      messages.forEach((message, index) => {
        insertMessage.run(
          index + 1,
          message.chatJid,
          message.chatName,
          `DEMO${(index + 1).toString(16).padStart(12, '0').toUpperCase()}`,
          message.senderJid,
          message.senderName,
          message.ts,
          message.fromMe ? 1 : 0,
          message.text,
          message.mediaType ? RAW_TYPES[message.mediaType] : 0,
          message.mediaType ?? 'text',
          message.mediaType,
          message.mediaPath,
          message.mediaSize,
        );
        lastByChat.set(message.chatJid, message.ts);
      });

      const insertChat = db.prepare('INSERT INTO chats (jid, kind, name, last_message_at, archived) VALUES (?, ?, ?, ?, ?)');
      for (const plan of plans) {
        insertChat.run(plan.jid, plan.kind, plan.name, lastByChat.get(plan.jid) ?? null, plan.archived ? 1 : 0);
      }
      insertChat.run(groupJid(GROUP_PERSONAS.length), 'group', SILENT_GROUP.name, null, 0);

      const insertState = db.prepare('INSERT INTO sync_state (key, value) VALUES (?, ?)');
      insertState.run('last_import_at', new Date((nowTs - 3 * 3600) * 1000).toISOString());
      insertState.run('source_path', 'demo');
    })();

    createSearchIndexes(db);

    return {
      dbPath,
      mediaRoot,
      messages: messages.length,
      chats: plans.length + 1,
      contacts: (db.prepare('SELECT COUNT(*) AS count FROM contacts').get() as { count: number }).count,
    };
  } finally {
    db.close();
  }
}
