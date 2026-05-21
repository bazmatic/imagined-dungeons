import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { asWorldId } from '@core/domain/ids';
import { WorldKind } from '@core/domain/builder-kinds';
import * as schema from './schema';
import { SqliteRepository } from './sqlite-repository';

function openTestDb() {
  const sqlite = new Database(':memory:');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: './drizzle' });
  sqlite.pragma('foreign_keys = OFF');
  return { db, close: () => sqlite.close() };
}

const W = asWorldId('world_a');
const W2 = asWorldId('world_b');

async function seedWorld(db: ReturnType<typeof openTestDb>['db'], worldId: string) {
  await db.insert(schema.worlds).values({
    id: worldId,
    label: 'Test World',
    rngSeed: 1,
    kind: WorldKind.Live,
    displayName: 'Test',
  });
}

describe('entity traces', () => {
  let handle: ReturnType<typeof openTestDb>;
  let repo: SqliteRepository;
  let repo2: SqliteRepository;

  beforeEach(async () => {
    handle = openTestDb();
    repo = new SqliteRepository(handle.db, W);
    repo2 = new SqliteRepository(handle.db, W2);
    await seedWorld(handle.db, W);
    await seedWorld(handle.db, W2);
  });

  afterEach(() => handle.close());

  it('records a trace and retrieves it', async () => {
    const trace = 'a crude carving reading "Paff woz ere" scratched into the cobblestones';
    await repo.recordEntityTrace('location', 'loc_burning_street', trace);
    const traces = await repo.getEntityTraces('location', 'loc_burning_street', 10);
    expect(traces).toHaveLength(1);
    expect(traces[0]).toBe(trace);
  });

  it('returns traces oldest-first', async () => {
    await repo.recordEntityTrace('location', 'loc_test', 'first');
    await repo.recordEntityTrace('location', 'loc_test', 'second');
    const traces = await repo.getEntityTraces('location', 'loc_test', 10);
    expect(traces[0]).toBe('first');
    expect(traces[1]).toBe('second');
  });

  it('respects the limit (window) and returns only the most recent N', async () => {
    for (let i = 0; i < 5; i++) {
      await repo.recordEntityTrace('location', 'loc_win', `effect-${i}`);
    }
    const traces = await repo.getEntityTraces('location', 'loc_win', 3);
    expect(traces).toHaveLength(3);
    expect(traces[0]).toBe('effect-2');
    expect(traces[1]).toBe('effect-3');
    expect(traces[2]).toBe('effect-4');
  });

  it('scopes traces by world', async () => {
    await repo.recordEntityTrace('location', 'loc_shared', 'world-a effect');
    const traces2 = await repo2.getEntityTraces('location', 'loc_shared', 10);
    expect(traces2).toHaveLength(0);
  });
});
