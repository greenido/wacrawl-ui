/**
 * The tables every wacrawl archive has, and all the dashboard requires.
 *
 * Shared by the test fixtures and the demo archive so they cannot drift apart.
 * Newer wacrawl versions add to this (`chats.archived`, `sync_state`,
 * `messages_fts`); the queries probe for those, so they stay out of the baseline.
 */
export const ARCHIVE_SCHEMA_SQL = `
  CREATE TABLE chats (
    jid TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    name TEXT,
    last_message_at INTEGER
  );
  CREATE TABLE contacts (
    jid TEXT PRIMARY KEY,
    phone TEXT,
    full_name TEXT,
    first_name TEXT,
    last_name TEXT,
    business_name TEXT,
    username TEXT,
    lid TEXT
  );
  CREATE TABLE groups (
    jid TEXT PRIMARY KEY,
    name TEXT,
    owner_jid TEXT,
    created_at INTEGER
  );
  CREATE TABLE group_participants (
    group_jid TEXT NOT NULL,
    user_jid TEXT NOT NULL,
    contact_name TEXT,
    first_name TEXT,
    is_admin INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (group_jid, user_jid)
  );
  CREATE TABLE messages (
    rowid INTEGER PRIMARY KEY AUTOINCREMENT,
    source_pk INTEGER NOT NULL UNIQUE,
    chat_jid TEXT NOT NULL,
    chat_name TEXT,
    msg_id TEXT NOT NULL,
    sender_jid TEXT,
    sender_name TEXT,
    ts INTEGER NOT NULL,
    from_me INTEGER NOT NULL,
    text TEXT,
    raw_type INTEGER NOT NULL,
    message_type TEXT,
    media_type TEXT,
    media_path TEXT,
    media_size INTEGER
  );
`;
