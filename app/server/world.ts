import { type AgentId, asAgentId } from '@core/domain/ids';
import { type ParseFn, makeCompositeParser } from '@core/engine/parser/composite';
import { type DbHandle, openDb } from '@infra/db';
import { makeOpenAILanguageModel } from '@infra/language-model/openai';
import { BURNING_DISTRICT_WORLD_ID, seedIfEmpty } from '@infra/seed/seeder';
import { SqliteRepository } from '@infra/sqlite-repository';

const DB_PATH = process.env.DB_PATH ?? './imagined-dungeons.db';
export const PLAYER_ID: AgentId = asAgentId('char_39322'); // Paff Pinkerton

let handle: DbHandle | null = null;
let parseFn: ParseFn | null = null;

export async function getRepo(): Promise<SqliteRepository> {
  if (!handle) {
    handle = openDb(DB_PATH);
    await seedIfEmpty(handle.db);
  }
  return new SqliteRepository(handle.db, BURNING_DISTRICT_WORLD_ID);
}

export function getParse(): ParseFn {
  if (!parseFn) {
    const llm = makeOpenAILanguageModel(); // null when OPENAI_API_KEY unset
    parseFn = makeCompositeParser({ llm });
  }
  return parseFn;
}
