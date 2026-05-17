import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DecisionSnapshot, RawPrompt } from '@core/domain/npc-decision';
import { DECISION_HISTORY_LIMIT } from '@core/domain/npc-decision';
import * as schema from './schema';
import { SqliteNpcDecisionRepository } from './sqlite-npc-decision-repository';

const WORLD = 'w1';
const AGENT = 'a1';

const snapshot = (label: string): DecisionSnapshot => ({
  agentState: { mood: null, goal: null, sideQuest: null },
  perception: {
    locationLabel: label,
    locationDescription: '',
    visibleItems: [],
    visibleAgents: [],
    exits: [],
    inventory: [],
    unansweredAddresses: [],
  },
  memory: [],
  response: {
    rawText: 'wait',
    thought: null,
    sideQuestBefore: null,
    sideQuestAfter: null,
    actions: [],
  },
  fallback: false,
});

const prompt = (): RawPrompt => ({ system: 'sys', user: 'usr' });

function openTestDb() {
  const sqlite = new Database(':memory:');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: './drizzle' });
  // Migrations may enable FKs (0006, 0016 set PRAGMA foreign_keys=ON).
  // The test world rows don't exist, so disable FKs for the test DB.
  sqlite.pragma('foreign_keys = OFF');
  return { db, close: () => sqlite.close() };
}

describe('SqliteNpcDecisionRepository', () => {
  let handle: ReturnType<typeof openTestDb>;
  let repo: SqliteNpcDecisionRepository;

  beforeEach(() => {
    handle = openTestDb();
    repo = new SqliteNpcDecisionRepository(handle.db);
  });

  afterEach(() => {
    handle.close();
  });

  it('saves a decision and retrieves it', async () => {
    await repo.save(WORLD, AGENT, snapshot('Town Square'), prompt());
    const results = await repo.list(WORLD, AGENT);
    expect(results).toHaveLength(1);
    expect(results[0]?.snapshot.perception.locationLabel).toBe('Town Square');
  });

  it('returns decisions newest-first', async () => {
    await repo.save(WORLD, AGENT, snapshot('First'), prompt());
    await repo.save(WORLD, AGENT, snapshot('Second'), prompt());
    const results = await repo.list(WORLD, AGENT);
    expect(results[0]?.snapshot.perception.locationLabel).toBe('Second');
    expect(results[1]?.snapshot.perception.locationLabel).toBe('First');
  });

  it('prunes to DECISION_HISTORY_LIMIT after save', async () => {
    for (let i = 0; i < DECISION_HISTORY_LIMIT + 5; i++) {
      await repo.save(WORLD, AGENT, snapshot(`loc-${i}`), prompt());
    }
    const results = await repo.list(WORLD, AGENT);
    expect(results).toHaveLength(DECISION_HISTORY_LIMIT);
    // Verify the newest rows survived (not the oldest)
    expect(results[0]?.snapshot.perception.locationLabel).toBe(`loc-${DECISION_HISTORY_LIMIT + 4}`);
    expect(results[DECISION_HISTORY_LIMIT - 1]?.snapshot.perception.locationLabel).toBe('loc-5');
  });

  it('only returns decisions for the given agent', async () => {
    await repo.save(WORLD, 'a1', snapshot('A1'), prompt());
    await repo.save(WORLD, 'a2', snapshot('A2'), prompt());
    const results = await repo.list(WORLD, 'a1');
    expect(results).toHaveLength(1);
    expect(results[0]?.snapshot.perception.locationLabel).toBe('A1');
  });

  it('only returns decisions for the given world', async () => {
    await repo.save('world-a', AGENT, snapshot('WA'), prompt());
    await repo.save('world-b', AGENT, snapshot('WB'), prompt());
    const results = await repo.list('world-a', AGENT);
    expect(results).toHaveLength(1);
    expect(results[0]?.snapshot.perception.locationLabel).toBe('WA');
  });
});
