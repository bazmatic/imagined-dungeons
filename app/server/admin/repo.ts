import 'dotenv/config';
import { BURNING_DISTRICT_CAMPAIGN } from '@campaigns/burning-district';
import { SqliteBuilderRepository } from '@infra/builder-sqlite-repository';
import { type DbHandle, openDb } from '@infra/db';
import { seedIfEmpty } from '@infra/seed/seeder';

const DB_PATH = process.env.DB_PATH ?? './imagined-dungeons.db';
let handle: DbHandle | null = null;
let seeded = false;

/**
 * Composition root for the admin/builder. Opens the same DB file as the
 * player engine (app/server/world.ts) and runs the seeder on first access.
 * Seeding is idempotent — both composition roots can call seedIfEmpty
 * without conflict — but we still gate behind a `seeded` flag so a second
 * admin call doesn't re-run the existence check.
 */
export async function getBuilderRepo(): Promise<SqliteBuilderRepository> {
  if (!handle) handle = openDb(DB_PATH);
  if (!seeded) {
    await seedIfEmpty(handle.db, BURNING_DISTRICT_CAMPAIGN);
    seeded = true;
  }
  return new SqliteBuilderRepository(handle.db);
}
