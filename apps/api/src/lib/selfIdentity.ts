import type { Database } from 'better-sqlite3';

/**
 * Which roster entries are the archive's owner.
 *
 * Messages I send carry `from_me = 1` and, in a group, the *group's* JID as the
 * sender — my own JID is never written down. So every group roster lists me as
 * a member who has never spoken, and a lurker report proudly named the person
 * reading it as the quietest member of all 100 of their groups.
 *
 * There is no self column to read, but there is a structural giveaway: I am a
 * member of every group I post in, and nobody else is. Taking the participants
 * present in *all* of them is decisive in practice — on a real archive the two
 * hits (a phone JID and its `@lid` twin, both mine) covered 100 of 100 groups
 * while the next-most-common member reached 33.
 *
 * Below MIN_GROUPS the intersection means little: in two shared groups a spouse
 * is indistinguishable from the account owner, so the answer is "unknown" and
 * callers fall back to counting me as an ordinary member.
 */
const MIN_GROUPS = 3;

interface SelfRow {
  jid: string;
}

interface CountRow {
  count: number;
}

export function resolveSelfJids(db: Database): Set<string> {
  const total = (db.prepare(`
    SELECT COUNT(DISTINCT messages.chat_jid) AS count
    FROM messages
    JOIN chats ON chats.jid = messages.chat_jid
    WHERE messages.from_me = 1 AND chats.kind = 'group'
  `).get() as CountRow).count;

  if (total < MIN_GROUPS) return new Set();

  const rows = db.prepare(`
    SELECT group_participants.user_jid AS jid
    FROM group_participants
    WHERE group_participants.group_jid IN (
      SELECT DISTINCT messages.chat_jid
      FROM messages
      JOIN chats ON chats.jid = messages.chat_jid
      WHERE messages.from_me = 1 AND chats.kind = 'group'
    )
    GROUP BY group_participants.user_jid
    HAVING COUNT(DISTINCT group_participants.group_jid) = @total
  `).all({ total }) as SelfRow[];

  return new Set(rows.map((row) => row.jid));
}
