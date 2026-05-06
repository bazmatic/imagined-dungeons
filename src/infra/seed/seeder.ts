import { type WorldId, asWorldId } from '@core/domain/ids';
import type { DB } from '../db';
import * as schema from '../schema';
import { BURNING_DISTRICT } from './burning-district';

export const BURNING_DISTRICT_WORLD_ID: WorldId = asWorldId('w_burning_district');

export async function seedIfEmpty(db: DB): Promise<void> {
  const existing = await db.select().from(schema.worlds);
  if (existing.length > 0) return;

  const W = BURNING_DISTRICT_WORLD_ID;
  await db.insert(schema.worlds).values({ id: W, label: 'The Burning District' });

  await db
    .insert(schema.locations)
    .values(BURNING_DISTRICT.locations.map((l) => ({ ...l, worldId: W })));

  await db
    .insert(schema.agents)
    .values(BURNING_DISTRICT.agents.map((a) => ({ ...a, worldId: W })));

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
