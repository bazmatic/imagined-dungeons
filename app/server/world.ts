import 'dotenv/config';
import { eq } from 'drizzle-orm';
import type { AgentId, WorldId } from '@core/domain/ids';
import { asAgentId } from '@core/domain/ids';
import { type LanguageModel } from '@core/engine/language-model';
import { type ParseFn, makeCompositeParser } from '@core/engine/parser/composite';
import { type DB, type DbHandle, openDb } from '@infra/db';
import { makeOpenAILanguageModel } from '@infra/language-model/openai';
import * as schema from '@infra/schema';
import { seedIfEmpty } from '@infra/seed/seeder';
import { BURNING_DISTRICT_CAMPAIGN } from '@campaigns/burning-district';
import { SqliteRepository } from '@infra/sqlite-repository';

const DB_PATH = process.env.DB_PATH ?? './imagined-dungeons.db';

let handle: DbHandle | null = null;
let parseFn: ParseFn | null = null;
let llmInstance: LanguageModel | null = null;
let llmInitialised = false;

function getLlm(): LanguageModel | null {
  if (!llmInitialised) {
    llmInstance = makeOpenAILanguageModel();
    llmInitialised = true;
  }
  return llmInstance;
}

export async function getDb(): Promise<DB> {
  if (!handle) {
    handle = openDb(DB_PATH);
    await seedIfEmpty(handle.db, BURNING_DISTRICT_CAMPAIGN);
  }
  return handle.db;
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

export async function getWorldContext(
  db: DB,
  worldId: WorldId,
): Promise<{ repo: SqliteRepository; playerId: AgentId; displayName: string }> {
  const rows = await db
    .select()
    .from(schema.worlds)
    .where(eq(schema.worlds.id, worldId));
  const world = rows[0];
  if (!world) throw new Error(`World not found: ${worldId}`);
  if (!world.playerAgentId) throw new Error(`World has no playerAgentId: ${worldId}`);
  return {
    repo: new SqliteRepository(db, worldId),
    playerId: asAgentId(world.playerAgentId),
    displayName: world.displayName,
  };
}
