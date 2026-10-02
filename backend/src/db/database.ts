import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

export type Db = Database.Database;

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

export function defaultDatabasePath(): string {
  return path.resolve(moduleDir, '../../data/events.db');
}

export function openDatabase(filePath?: string): Db {
  const resolved = filePath ?? process.env.DATABASE_PATH ?? defaultDatabasePath();
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const db = new Database(resolved);
  db.pragma('journal_mode = WAL');
  return db;
}

export function migrate(db: Db): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      anonymous_id TEXT NOT NULL,
      event_type TEXT NOT NULL CHECK (event_type IN ('page_view', 'product_view', 'add_to_cart', 'checkout_started', 'purchase')),
      occurred_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_events_occurred_at ON events (occurred_at);
  `);
}
