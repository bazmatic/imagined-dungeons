import type { Campaign } from '@core/domain/campaign';
import { SYSTEM_AGENT_ID, type WorldId, asWorldId } from '@core/domain/ids';
import { eq } from 'drizzle-orm';
import type { DB } from '../db';
import * as schema from '../schema';

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
    sideQuest: null,
    goal: 'Referee for the game',
    autonomous: false,
    awake: false,
    gold: 0,
  });
}

function deterministicScratchId(liveId: WorldId): WorldId {
  // Convention: a live world's paired scratch shares the suffix after the
  // first underscore (`w_burning_district` ↔ `w_draft_burning_district`).
  const raw = liveId as string;
  const tail = raw.startsWith('w_') ? raw.slice(2) : raw;
  return asWorldId(`w_draft_${tail}`);
}

async function insertSeedRows(db: DB, campaign: Campaign, worldId: WorldId): Promise<void> {
  await db.insert(schema.locations).values(campaign.seed.locations.map((l) => ({ ...l, worldId })));

  await db
    .insert(schema.agents)
    .values(campaign.seed.agents.map((a) => ({ ...a, worldId, awake: false })));

  const flatItems = campaign.seed.items.filter((i) => i.ownerKind !== 'item');
  const containerItems = campaign.seed.items.filter((i) => i.ownerKind === 'item');
  if (flatItems.length > 0) {
    await db.insert(schema.items).values(flatItems.map((i) => ({ ...i, worldId })));
  }
  if (containerItems.length > 0) {
    await db.insert(schema.items).values(containerItems.map((i) => ({ ...i, worldId })));
  }

  await db.insert(schema.exits).values(
    campaign.seed.exits.map((e) => ({
      id: e.id,
      worldId,
      fromLocationId: e.from,
      toLocationId: e.to,
      direction: e.direction,
      label: e.label,
      locked: e.locked,
      lockedByItemId: e.lockedByItem,
    })),
  );
}

async function writeStartingStateSnapshot(
  db: DB,
  campaign: Campaign,
  scratchId: WorldId,
): Promise<void> {
  // Build a snapshot blob shaped the same way builder/index.ts emits it.
  const locations = campaign.seed.locations.map((l) => ({ ...l, worldId: scratchId }));
  const exits = campaign.seed.exits.map((e) => ({ ...e, worldId: scratchId }));
  const items = campaign.seed.items.map((i) => ({
    id: i.id,
    worldId: scratchId,
    label: i.label,
    shortDescription: i.shortDescription,
    longDescription: i.longDescription,
    weight: i.weight,
    hidden: i.hidden,
    tags: [],
    owner: { kind: i.ownerKind, id: i.ownerId },
    equipped: false,
  }));
  const agents = campaign.seed.agents.map((a) => ({
    id: a.id,
    worldId: scratchId,
    label: a.label,
    shortDescription: a.shortDescription,
    longDescription: a.longDescription,
    locationId: a.locationId,
    hp: a.hp,
    damage: a.damage,
    defense: a.defense,
    capacity: a.capacity,
    mood: a.mood ?? null,
    goal: a.goal ?? null,
    autonomous: a.autonomous,
    awake: false,
    gold: 0,
    tags: [],
  }));
  const blob = {
    locations,
    exits,
    items,
    agents,
    templates: [],
    triggers: [],
    worldLore: { worldOverview: '', storySoFar: '' },
    tagLore: [],
  };
  await db.insert(schema.worldSnapshots).values({
    worldId: scratchId,
    snapshotJson: JSON.stringify(blob),
    takenAt: new Date(),
  });
}

export async function seedIfEmpty(db: DB, campaign: Campaign): Promise<void> {
  const existing = await db.select().from(schema.worlds);
  if (existing.length > 0) {
    await ensureAgentDescriptions(db, campaign);
    await ensureSystemAgent(db, campaign.worldId);
    return;
  }

  const W = campaign.worldId;
  const scratchId = deterministicScratchId(W);

  // 1. Scratch (Draft) world — used by the admin to author the starting state.
  await db.insert(schema.worlds).values({
    id: scratchId,
    label: campaign.worldLabel,
    rngSeed: 1,
    kind: 'draft',
    displayName: campaign.displayName,
    playerAgentId: campaign.playerId as string,
  });
  await insertSeedRows(db, campaign, scratchId);

  // 2. Capture starting-state snapshot from the seed (so Load/Reset work
  //    without an explicit save).
  await writeStartingStateSnapshot(db, campaign, scratchId);

  // 3. Live world — the running game. parentDraftId pairs it with the scratch.
  await db.insert(schema.worlds).values({
    id: W,
    label: campaign.worldLabel,
    rngSeed: 1,
    kind: 'live',
    parentDraftId: scratchId as string,
    displayName: campaign.displayName,
    playerAgentId: campaign.playerId as string,
  });

  await insertSeedRows(db, campaign, W);

  await ensureSystemAgent(db, W);
}
