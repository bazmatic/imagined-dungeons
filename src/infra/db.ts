import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema';

export type DB = ReturnType<typeof drizzle<typeof schema>>;

export interface DbHandle {
  readonly db: DB;
  close(): void;
}

export function openDb(filename: string): DbHandle {
  const sqlite = new Database(filename);
  sqlite.pragma('journal_mode = WAL');
  // Disable FKs across the migration window. SQLite's "create-new + copy + drop +
  // rename" pattern (used for ALTER TABLE-equivalent migrations) trips FK checks
  // mid-flight; the PRAGMA foreign_keys=OFF lines emitted inside the migration
  // SQL itself are silently ignored because the migrator wraps statements in a
  // transaction. Toggling here is the canonical workaround.
  sqlite.pragma('foreign_keys = OFF');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: './drizzle' });
  sqlite.pragma('foreign_keys = ON');
  return { db, close: () => sqlite.close() };
}
