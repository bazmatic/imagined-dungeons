import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { asAgentId, asEventId, asWorldId } from '@core/domain/ids';
import { EventKind } from '@core/domain/kinds';
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

const W = asWorldId('world_test');
const LOC_ID = 'loc_tavern';
const AGENT_ID = asAgentId('char_spark');

async function seedWorld(db: ReturnType<typeof openTestDb>['db']) {
  await db.insert(schema.worlds).values({
    id: W,
    label: 'Test World',
    rngSeed: 1,
    kind: WorldKind.Live,
    displayName: 'Test',
  });
  await db.insert(schema.locations).values({
    id: LOC_ID,
    worldId: W,
    label: 'The Tavern',
    shortDescription: 'A cosy inn.',
    longDescription: 'A cosy inn with a roaring fire.',
    secretDescription: '',
  });
  await db.insert(schema.agents).values({
    id: AGENT_ID,
    worldId: W,
    label: 'Spark',
    shortDescription: 'a halfling',
    longDescription: '',
    locationId: LOC_ID,
    hp: 10,
    damage: 1,
    defense: 10,
    capacity: 10,
    autonomous: true,
    awake: true,
    gold: 0,
    secretDescription: '',
  });
}

describe('SqliteRepository — tick counter', () => {
  let handle: ReturnType<typeof openTestDb>;
  let repo: SqliteRepository;

  beforeEach(async () => {
    handle = openTestDb();
    repo = new SqliteRepository(handle.db, W);
    await seedWorld(handle.db);
  });

  afterEach(() => handle.close());

  it('returns 1 on first call', async () => {
    expect(await repo.incrementTickCount()).toBe(1);
  });

  it('increments monotonically across calls', async () => {
    expect(await repo.incrementTickCount()).toBe(1);
    expect(await repo.incrementTickCount()).toBe(2);
    expect(await repo.incrementTickCount()).toBe(3);
  });

  it('stamps tickId and locationLabel on events after incrementTickCount', async () => {
    await repo.incrementTickCount(); // tick 1
    await repo.appendEvent({
      id: asEventId('evt_001'),
      worldId: W,
      actorId: AGENT_ID,
      kind: EventKind.Inventory,
      witnesses: [],
      createdAt: new Date(),
    });

    // Query all events — only one row exists in this test
    const rows = await handle.db.select().from(schema.events);
    const row = rows[0];
    expect(row?.tickId).toBe(1);
    expect(row?.locationLabel).toBe('The Tavern');
  });

  it('stamps null tickId and null locationLabel before incrementTickCount is called', async () => {
    await repo.appendEvent({
      id: asEventId('evt_002'),
      worldId: W,
      actorId: AGENT_ID,
      kind: EventKind.Inventory,
      witnesses: [],
      createdAt: new Date(),
    });

    const rows = await handle.db.select().from(schema.events);
    const row = rows[0];
    expect(row?.tickId).toBeNull();
    expect(row?.locationLabel).toBeNull();
  });

  it('recentEvents maps tickId and locationLabel', async () => {
    await repo.incrementTickCount(); // tick 1
    await repo.appendEvent({
      id: asEventId('evt_003'),
      worldId: W,
      actorId: AGENT_ID,
      kind: EventKind.Inventory,
      witnesses: [],
      createdAt: new Date(),
    });
    const events = await repo.recentEvents(10);
    expect(events[0]?.tickId).toBe(1);
    expect(events[0]?.locationLabel).toBe('The Tavern');
  });
});
