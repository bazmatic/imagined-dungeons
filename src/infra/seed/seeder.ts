import type { Campaign } from '@core/domain/campaign';
import { SYSTEM_AGENT_ID, type WorldId } from '@core/domain/ids';
import { eq, inArray } from 'drizzle-orm';
import type { DB } from '../db';
import * as schema from '../schema';

/**
 * Slice 4 introduced autonomous NPCs but the seed module is regenerated only
 * via `pnpm seed:gen`, and existing dev DBs were seeded before any NPC was
 * flagged autonomous. This migration brings any already-seeded world up to
 * the current `autonomous` roster without forcing a manual delete of
 * `imagined-dungeons.db`.
 *
 * Idempotent: re-running it on an already-correct DB is a no-op.
 */
async function ensureAutonomousFlags(db: DB, campaign: Campaign): Promise<void> {
  const targetIds = campaign.seed.agents.filter((a) => a.autonomous).map((a) => a.id);
  if (targetIds.length === 0) return;
  await db
    .update(schema.agents)
    .set({ autonomous: true })
    .where(inArray(schema.agents.id, targetIds));
}

/**
 * Refresh agent short/long descriptions from the campaign seed when the stored
 * value is empty. Existing dev DBs were seeded before the markdown parser
 * picked up the Backstories section, so locked rows have empty descriptions
 * even though the seed module now has good ones. Only fills empties — never
 * overwrites a description an agent already has, so live `update_description`
 * mutations from the consequence engine are preserved.
 */
async function ensureAgentDescriptions(db: DB, campaign: Campaign): Promise<void> {
  for (const a of campaign.seed.agents) {
    const want = a.longDescription;
    if (!want || want.length === 0) continue;
    const rows = await db
      .select({
        id: schema.agents.id,
        shortDescription: schema.agents.shortDescription,
        longDescription: schema.agents.longDescription,
      })
      .from(schema.agents)
      .where(eq(schema.agents.id, a.id));
    const row = rows[0];
    if (!row) continue;
    const patch: { shortDescription?: string; longDescription?: string } = {};
    if (!row.shortDescription || row.shortDescription.length === 0) {
      patch.shortDescription = a.shortDescription;
    }
    if (!row.longDescription || row.longDescription.length === 0) {
      patch.longDescription = a.longDescription;
    }
    if (Object.keys(patch).length > 0) {
      await db.update(schema.agents).set(patch).where(eq(schema.agents.id, a.id));
    }
  }
}

/**
 * Slice 5 introduces the synthetic `system` agent (abstract-design §4, §10) —
 * the actor for actions issued by "the world" (the consequence engine).
 * Inserted at the player's starting location so it has a valid foreign key;
 * `autonomous=false` keeps the NPC scheduler from picking it up.
 */
async function ensureSystemAgent(db: DB, worldId: WorldId): Promise<void> {
  const existing = await db
    .select({ id: schema.agents.id })
    .from(schema.agents)
    .where(eq(schema.agents.id, SYSTEM_AGENT_ID));
  if (existing.length > 0) return;

  // Pick any extant location for the world — we just need a valid FK target.
  const locs = await db
    .select({ id: schema.locations.id })
    .from(schema.locations)
    .where(eq(schema.locations.worldId, worldId))
    .limit(1);
  const homeLoc = locs[0]?.id;
  if (!homeLoc) return;

  await db.insert(schema.agents).values({
    id: SYSTEM_AGENT_ID,
    worldId,
    label: 'System',
    shortDescription: '',
    longDescription: '',
    locationId: homeLoc,
    hp: 0,
    damage: 0,
    defense: 0,
    capacity: 0,
    mood: null,
    shortTermIntent: null,
    goal: 'Referee for the game',
    autonomous: false,
  });
}

export async function seedIfEmpty(db: DB, campaign: Campaign): Promise<void> {
  const existing = await db.select().from(schema.worlds);
  if (existing.length > 0) {
    await ensureAutonomousFlags(db, campaign);
    await ensureAgentDescriptions(db, campaign);
    await ensureSystemAgent(db, campaign.worldId);
    return;
  }

  const W = campaign.worldId;
  await db.insert(schema.worlds).values({ id: W, label: campaign.worldLabel, rngSeed: 1 });

  await db
    .insert(schema.locations)
    .values(campaign.seed.locations.map((l) => ({ ...l, worldId: W })));

  await db.insert(schema.agents).values(campaign.seed.agents.map((a) => ({ ...a, worldId: W })));

  // Insert items in two passes: those owned by location/agent first, then those owned by other items.
  const flatItems = campaign.seed.items.filter((i) => i.ownerKind !== 'item');
  const containerItems = campaign.seed.items.filter((i) => i.ownerKind === 'item');
  if (flatItems.length > 0) {
    await db.insert(schema.items).values(flatItems.map((i) => ({ ...i, worldId: W })));
  }
  if (containerItems.length > 0) {
    await db.insert(schema.items).values(containerItems.map((i) => ({ ...i, worldId: W })));
  }

  await db.insert(schema.exits).values(
    campaign.seed.exits.map((e) => ({
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

  await ensureSystemAgent(db, W);
}
