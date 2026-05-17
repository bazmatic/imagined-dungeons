import 'dotenv/config';
import { BURNING_DISTRICT_CAMPAIGN } from '@campaigns/burning-district';
import type { AgentId } from '@core/domain/ids';
import type { LanguageModel } from '@core/engine/language-model';
import { type ParseFn, makeCompositeParser } from '@core/engine/parser/composite';
import { type DB, type DbHandle, openDb } from '@infra/db';
import { makeOpenAILanguageModel } from '@infra/language-model/openai';
import { seedIfEmpty } from '@infra/seed/seeder';
import { SqliteRepository } from '@infra/sqlite-repository';

const DB_PATH = process.env.DB_PATH ?? './imagined-dungeons.db';

/**
 * The active campaign. Swapping campaigns is a single-line change here:
 * import a different campaign module and assign it. Everything else
 * (player id, world id, seed, page heading) is derived from this constant.
 */
const CAMPAIGN = BURNING_DISTRICT_CAMPAIGN;

export const PLAYER_ID: AgentId = CAMPAIGN.playerId;
export const DISPLAY_NAME: string = CAMPAIGN.displayName;

let handle: DbHandle | null = null;
let parseFn: ParseFn | null = null;
let llmInstance: LanguageModel | null = null;
let llmInitialised = false;

function getLlm(): LanguageModel | null {
  if (!llmInitialised) {
    llmInstance = makeOpenAILanguageModel(); // null when OPENAI_API_KEY unset
    llmInitialised = true;
  }
  return llmInstance;
}

export async function getDb(): Promise<DB> {
  if (!handle) {
    handle = openDb(DB_PATH);
    await seedIfEmpty(handle.db, CAMPAIGN);
  }
  return handle.db;
}

export async function getRepo(): Promise<SqliteRepository> {
  if (!handle) {
    handle = openDb(DB_PATH);
    await seedIfEmpty(handle.db, CAMPAIGN);
  }
  return new SqliteRepository(handle.db, CAMPAIGN.worldId);
}

export function getParse(): ParseFn {
  if (!parseFn) {
    parseFn = makeCompositeParser({ llm: getLlm() });
  }
  return parseFn;
}

export function getNarratorLlm(): LanguageModel | null {
  return getLlm();
}
