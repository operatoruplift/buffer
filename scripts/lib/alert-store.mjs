import { DatabaseSync } from 'node:sqlite';
import { chmodSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { emptyAlertStore, encodeAlertStore, parseAlertStore } from '../../src/lib/alerts.ts';

/** SQLite serializes writers across processes, rolls back crashes, and persists the mock sink atomically. */
export function openAlertStore(filename) {
  const path = resolve(filename);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path);
  chmodSync(path, 0o600);
  db.exec('PRAGMA busy_timeout=10000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
  db.exec('CREATE TABLE IF NOT EXISTS alert_state (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, body TEXT NOT NULL) STRICT;');
  db.prepare('INSERT OR IGNORE INTO alert_state(id,revision,body) VALUES(1,0,?)').run(encodeAlertStore(emptyAlertStore()));
  return {
    path,
    read() { return parseAlertStore(db.prepare('SELECT body FROM alert_state WHERE id=1').get().body); },
    transaction(change) {
      db.exec('BEGIN IMMEDIATE');
      try {
        const { body, revision } = db.prepare('SELECT body,revision FROM alert_state WHERE id=1').get();
        const next = change(parseAlertStore(body));
        const updated = db.prepare('UPDATE alert_state SET body=?,revision=? WHERE id=1 AND revision=?').run(encodeAlertStore(next), revision + 1, revision);
        if (updated.changes !== 1) throw new Error('Alert store revision changed while locked.');
        db.exec('COMMIT');
        return next;
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    },
    close() { db.close(); },
  };
}
