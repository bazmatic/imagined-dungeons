import { type AgentId, asAgentId } from '@core/domain/ids';
import { type DbHandle, openDb } from '@infra/db';
import { BURNING_DISTRICT_WORLD_ID, seedIfEmpty } from '@infra/seed/seeder';
import { SqliteRepository } from '@infra/sqlite-repository';

const DB_PATH = process.env['DB_PATH'] ?? './imagined-dungeons.db';
export const PLAYER_ID: AgentId = asAgentId('char_39322'); // Paff Pinkerton

let handle: DbHandle | null = null;

export async function getRepo(): Promise<SqliteRepository> {
  if (!handle) {
    handle = openDb(DB_PATH);
    await seedIfEmpty(handle.db);
  }
  return new SqliteRepository(handle.db, BURNING_DISTRICT_WORLD_ID);
}
