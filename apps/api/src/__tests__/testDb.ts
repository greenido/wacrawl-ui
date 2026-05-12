import Database from 'better-sqlite3';

export function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`
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
  `);

  const insertChat = db.prepare('INSERT INTO chats (jid, kind, name, last_message_at) VALUES (?, ?, ?, ?)');
  insertChat.run('alice@s.whatsapp.net', 'direct', 'Alice', 1_700_432_000);
  insertChat.run('family@g.us', 'group', 'Family Group', 1_700_345_600);
  insertChat.run('quiet@s.whatsapp.net', 'direct', 'Quiet Contact', null);

  const insertContact = db.prepare('INSERT INTO contacts (jid, full_name, first_name, lid) VALUES (?, ?, ?, ?)');
  insertContact.run('alice@s.whatsapp.net', 'Alice Example', 'Alice', null);
  insertContact.run('bob@s.whatsapp.net', 'Bob Builder', 'Bob', null);
  insertContact.run('carol@s.whatsapp.net', 'Carol Contact', 'Carol', null);
  insertContact.run('dave@s.whatsapp.net', 'Dave Contact', 'Dave', null);

  const insertMessage = db.prepare(`
    INSERT INTO messages (
      source_pk, chat_jid, chat_name, msg_id, sender_jid, sender_name, ts,
      from_me, text, raw_type, message_type, media_type, media_path, media_size
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertMessage.run(1, 'alice@s.whatsapp.net', 'Alice', 'm1', null, null, 1_700_000_000, 1, 'hello project update', 0, 'text', null, null, null);
  insertMessage.run(2, 'alice@s.whatsapp.net', 'Alice', 'm2', 'alice@s.whatsapp.net', 'Alice', 1_700_086_400, 0, 'photo from the trip', 0, 'image', 'image', '/tmp/photo.jpg', 100);
  insertMessage.run(3, 'family@g.us', 'Family', 'm3', 'bob@s.whatsapp.net', 'Bob', 1_700_172_800, 0, 'hey family dinner', 0, 'text', null, null, null);
  insertMessage.run(4, 'family@g.us', 'Family', 'm4', null, null, 1_700_259_200, 1, 'sounds good family', 0, 'text', null, null, null);
  insertMessage.run(5, 'family@g.us', 'Family', 'm5', 'carol@s.whatsapp.net', 'Carol', 1_700_345_600, 0, 'voice note', 0, 'audio', 'audio', '/tmp/voice.ogg', 50);
  insertMessage.run(6, 'alice@s.whatsapp.net', 'Alice', 'm6', null, null, 1_700_432_000, 1, 'reply after photo', 0, 'text', null, null, null);

  return db;
}
