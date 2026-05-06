import { type WorldId, asWorldId } from '@core/domain/ids';
import { inArray } from 'drizzle-orm';
import type { DB } from '../db';
import * as schema from '../schema';
import { BURNING_DISTRICT } from './burning-district';

export const BURNING_DISTRICT_WORLD_ID: WorldId = asWorldId('w_burning_district');

/**
 * Slice 4 introduced autonomous NPCs but the seed module is regenerated only
 * via `pnpm seed:gen`, and existing dev DBs were seeded before any NPC was
 * flagged autonomous. This migration brings any already-seeded world up to
 * the current `autonomous` roster without forcing a manual delete of
 * `imagined-dungeons.db`.
 *
 * Idempotent: re-running it on an already-correct DB is a no-op.
 */
async function ensureAutonomousFlags(db: DB): Promise<void> {
  const targetIds = BURNING_DISTRICT.agents.filter((a) => a.autonomous).map((a) => a.id);
  if (targetIds.length === 0) return;
  await db
    .update(schema.agents)
    .set({ autonomous: true })
    .where(inArray(schema.agents.id, targetIds));
}

export async function seedIfEmpty(db: DB): Promise<void> {
  const existing = await db.select().from(schema.worlds);
  if (existing.length > 0) {
    await ensureAutonomousFlags(db);
    return;
  }

  const W = BURNING_DISTRICT_WORLD_ID;
  await db.insert(schema.worlds).values({ id: W, label: 'The Burning District', rngSeed: 1 });

  await db
    .insert(schema.locations)
    .values(BURNING_DISTRICT.locations.map((l) => ({ ...l, worldId: W })));

  await db.insert(schema.agents).values(BURNING_DISTRICT.agents.map((a) => ({ ...a, worldId: W })));

  // Insert items in two passes: those owned by location/agent first, then those owned by other items.
  const flatItems = BURNING_DISTRICT.items.filter((i) => i.ownerKind !== 'item');
  const containerItems = BURNING_DISTRICT.items.filter((i) => i.ownerKind === 'item');
  if (flatItems.length > 0) {
    await db.insert(schema.items).values(flatItems.map((i) => ({ ...i, worldId: W })));
  }
  if (containerItems.length > 0) {
    await db.insert(schema.items).values(containerItems.map((i) => ({ ...i, worldId: W })));
  }

  await db.insert(schema.exits).values(
    BURNING_DISTRICT.exits.map((e) => ({
      id: e.id,
      worldId: W,
      fromLocationId: e.from,
      toLocationId: e.to,
      direction: e.direction,
      label: e.label,
      locked: e.locked,
      lockedByItemId: e.lockedByItem,
    })),
  );
}
