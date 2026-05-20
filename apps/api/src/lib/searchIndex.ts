import type { Database } from 'better-sqlite3';
import { cleanDisplayNameSql, contactDisplayNameSql, contactLeftJoins } from './displayName.js';

export const MESSAGE_SEARCH_FTS_TABLE = 'messages_fts';

interface CountRow {
  count: number;
}

export function hasMessageSearchIndex(db: Database): boolean {
  const row = db.prepare(`
    SELECT COUNT(*) AS count
    FROM sqlite_master
    WHERE type = 'table' AND name = @tableName
  `).get({ tableName: MESSAGE_SEARCH_FTS_TABLE }) as CountRow;

  return row.count > 0;
}

export function createSearchIndexes(db: Database): void {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_messages_chat_jid ON messages(chat_jid);
    CREATE INDEX IF NOT EXISTS idx_messages_ts ON messages(ts DESC);
    CREATE INDEX IF NOT EXISTS idx_messages_chat_ts ON messages(chat_jid, ts DESC);
    CREATE INDEX IF NOT EXISTS idx_contacts_jid ON contacts(jid);
    CREATE INDEX IF NOT EXISTS idx_contacts_lid ON contacts(lid);

    DROP TABLE IF EXISTS ${MESSAGE_SEARCH_FTS_TABLE};
    CREATE VIRTUAL TABLE ${MESSAGE_SEARCH_FTS_TABLE} USING fts5(
      text,
      chat_name,
      sender_name,
      chat_contact_name,
      sender_contact_name
    );

    INSERT INTO ${MESSAGE_SEARCH_FTS_TABLE} (
      rowid,
      text,
      chat_name,
      sender_name,
      chat_contact_name,
      sender_contact_name
    )
    SELECT
      messages.rowid,
      COALESCE(messages.text, ''),
      COALESCE(
        ${cleanDisplayNameSql('chats.name')},
        ${cleanDisplayNameSql('messages.chat_name')},
        ${cleanDisplayNameSql('messages.chat_jid')},
        ''
      ),
      COALESCE(
        ${cleanDisplayNameSql('messages.sender_name')},
        ${cleanDisplayNameSql('messages.sender_jid')},
        ''
      ),
      COALESCE(${contactDisplayNameSql('chat_contacts')}, ''),
      COALESCE(${contactDisplayNameSql('sender_contacts')}, '')
    FROM messages
    LEFT JOIN chats ON chats.jid = messages.chat_jid
    ${contactLeftJoins('chat_contacts', 'messages.chat_jid')}
    ${contactLeftJoins('sender_contacts', 'messages.sender_jid')};
  `);
}
