import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const schemaPath = new URL('./schema.sql', import.meta.url);

export function abrirBanco(databasePath) {
  if (databasePath !== ':memory:') {
    fs.mkdirSync(path.dirname(path.resolve(databasePath)), { recursive: true });
  }
  const db = new Database(databasePath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.exec(fs.readFileSync(schemaPath, 'utf8'));
  return db;
}
