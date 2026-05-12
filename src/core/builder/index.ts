import { BuilderErrorKind, WorldKind } from '@core/domain/builder-kinds';
import type {
  BuilderError,
  CreateDraftInput,
  LocationSpawnTrigger,
  MonsterTemplate,
  UpsertAgentInput,
  UpsertExitInput,
  UpsertItemInput,
  UpsertLocationInput,
  UpsertLocationSpawnTriggerInput,
  UpsertMonsterTemplateInput,
  UpsertTagLoreInput,
  WorldLore,
  WorldTree,
} from '@core/domain/builder-types';
import type { Agent, Exit, Item, Location } from '@core/domain/entities';
import {
  type AgentId,
  type ExitId,
  type ItemId,
  type LocationId,
  type MonsterTemplateId,
  type SpawnTriggerId,
  type TagLoreId,
  type WorldId,
  asWorldId,
} from '@core/domain/ids';
import { Err, Ok, type Result } from '@core/domain/result';
import type { BuilderRepository } from './repository';

/**
 * Builder facade — Load/Save/Reset/Edit-Live model.
 *
 * The old draft/publish flow with three-way merge is gone. Every world has
 * two pieces of state:
 *   1. A "starting state" snapshot blob (in `world_snapshots`) — the authored
 *      as-shipped version of the world.
 *   2. Live entity tables — the running game state.
 *
 * Per "thing" there are two world rows: a scratch (`kind=draft`) where the
 * admin edits the starting state, and a live (`kind=live`) running game.
 * The scratch's `parentDraftId`? No — the live row's `parentDraftId` points
 * at the scratch. (Vestigial column name.)
 *
 * The old `requireDraft` gate is gone — every authored op now runs on
 * whatever world id is passed. Callers that want to mutate live pass the
 * live id explicitly ("Edit Live" mode in the admin).
 */

const newDraftId = (): WorldId => asWorldId(`w_draft_${Math.random().toString(36).slice(2, 10)}`);
const newLiveId = (): WorldId => asWorldId(`w_${Math.random().toString(36).slice(2, 10)}`);

const err = (kind: BuilderErrorKind, message: string): BuilderError => ({ kind, message });

async function requireWorld(repo: BuilderRepository, id: WorldId) {
  const s = await repo.getWorldSummary(id);
  if (!s) return Err(err(BuilderErrorKind.WorldNotFound, `world not found: ${id}`));
  return Ok(s);
}

/**
 * Create a scratch-only world. Used by internal tooling and tests; the
 * admin uses `createWorld` instead (which also mints a paired live and
 * an empty starting-state snapshot).
 */
export async function createDraft(
  repo: BuilderRepository,
  input: CreateDraftInput,
): Promise<Result<WorldId, BuilderError>> {
  const id = newDraftId();
  await repo.createWorld({
    id,
    kind: WorldKind.Draft,
    label: input.label,
    displayName: input.displayName,
    parentDraftId: null,
    playerAgentId: null,
    coverImageUrl: null,
  });
  return Ok(id);
}

/**
 * Create a new world for the admin. Mirrors the campaign seeder:
 * produces a paired scratch (Draft kind) + live world, links them via
 * `parentDraftId` on the live row, and captures an empty starting-state
 * snapshot on the scratch so Load/Reset work immediately. Returns the
 * **scratch** id — that's what the admin opens for editing.
 */
export async function createWorld(
  repo: BuilderRepository,
  input: CreateDraftInput,
): Promise<Result<WorldId, BuilderError>> {
  const scratchId = newDraftId();
  const liveId = newLiveId();
  await repo.createWorld({
    id: scratchId,
    kind: WorldKind.Draft,
    label: input.label,
    displayName: input.displayName,
    parentDraftId: null,
    playerAgentId: null,
    coverImageUrl: null,
  });
  await repo.createWorld({
    id: liveId,
    kind: WorldKind.Live,
    label: input.label,
    displayName: input.displayName,
    parentDraftId: scratchId,
    playerAgentId: null,
    coverImageUrl: null,
  });
  // Empty starting-state snapshot, shaped the same way snapshotJson emits.
  const emptyBlob = JSON.stringify({
    locations: [],
    exits: [],
    items: [],
    agents: [],
    templates: [],
    triggers: [],
    worldLore: { worldOverview: '', storySoFar: '' },
    tagLore: [],
  });
  await repo.writeSnapshot(scratchId, emptyBlob, Date.now());
  return Ok(scratchId);
}

export async function getWorldTree(
  repo: BuilderRepository,
  id: WorldId,
): Promise<Result<WorldTree, BuilderError>> {
  const s = await requireWorld(repo, id);
  if (!s.ok) return s;
  const [locations, exits, items, agents, templates, triggers, worldLore, tagLore] =
    await Promise.all([
      repo.listLocations(id),
      repo.listExits(id),
      repo.listItems(id),
      repo.listAgents(id),
      repo.listMonsterTemplates(id),
      repo.listLocationSpawnTriggers(id),
      repo.readWorldLore(id),
      repo.listTagLore(id),
    ]);
  return Ok({
    summary: s.value,
    locations,
    exits,
    items,
    agents,
    templates,
    triggers,
    worldLore,
    tagLore,
  });
}

export async function upsertLocation(
  repo: BuilderRepository,
  worldId: WorldId,
  input: UpsertLocationInput,
): Promise<Result<LocationId, BuilderError>> {
  const s = await requireWorld(repo, worldId);
  if (!s.ok) return s;
  await repo.upsertLocation(worldId, input);
  return Ok(input.id);
}

export async function upsertExit(
  repo: BuilderRepository,
  worldId: WorldId,
  input: UpsertExitInput,
): Promise<Result<ExitId, BuilderError>> {
  const s = await requireWorld(repo, worldId);
  if (!s.ok) return s;
  await repo.upsertExit(worldId, input);
  return Ok(input.id);
}

export async function upsertItem(
  repo: BuilderRepository,
  worldId: WorldId,
  input: UpsertItemInput,
): Promise<Result<ItemId, BuilderError>> {
  const s = await requireWorld(repo, worldId);
  if (!s.ok) return s;
  await repo.upsertItem(worldId, input);
  return Ok(input.id);
}

export async function upsertAgent(
  repo: BuilderRepository,
  worldId: WorldId,
  input: UpsertAgentInput,
): Promise<Result<AgentId, BuilderError>> {
  const s = await requireWorld(repo, worldId);
  if (!s.ok) return s;
  await repo.upsertAgent(worldId, input);
  return Ok(input.id);
}

export async function deleteLocation(
  repo: BuilderRepository,
  worldId: WorldId,
  id: LocationId,
): Promise<Result<void, BuilderError>> {
  const s = await requireWorld(repo, worldId);
  if (!s.ok) return s;
  await repo.deleteLocation(worldId, id);
  return Ok(undefined);
}

export async function deleteExit(
  repo: BuilderRepository,
  worldId: WorldId,
  id: ExitId,
): Promise<Result<void, BuilderError>> {
  const s = await requireWorld(repo, worldId);
  if (!s.ok) return s;
  await repo.deleteExit(worldId, id);
  return Ok(undefined);
}

export async function deleteItem(
  repo: BuilderRepository,
  worldId: WorldId,
  id: ItemId,
): Promise<Result<void, BuilderError>> {
  const s = await requireWorld(repo, worldId);
  if (!s.ok) return s;
  await repo.deleteItem(worldId, id);
  return Ok(undefined);
}

export async function deleteAgent(
  repo: BuilderRepository,
  worldId: WorldId,
  id: AgentId,
): Promise<Result<void, BuilderError>> {
  const s = await requireWorld(repo, worldId);
  if (!s.ok) return s;
  await repo.deleteAgent(worldId, id);
  return Ok(undefined);
}

export async function upsertMonsterTemplate(
  repo: BuilderRepository,
  worldId: WorldId,
  input: UpsertMonsterTemplateInput,
): Promise<Result<MonsterTemplateId, BuilderError>> {
  const s = await requireWorld(repo, worldId);
  if (!s.ok) return s;
  await repo.upsertMonsterTemplate(worldId, input);
  return Ok(input.id);
}

export async function deleteMonsterTemplate(
  repo: BuilderRepository,
  worldId: WorldId,
  id: MonsterTemplateId,
): Promise<Result<void, BuilderError>> {
  const s = await requireWorld(repo, worldId);
  if (!s.ok) return s;
  await repo.deleteMonsterTemplate(worldId, id);
  return Ok(undefined);
}

export async function upsertLocationSpawnTrigger(
  repo: BuilderRepository,
  worldId: WorldId,
  input: UpsertLocationSpawnTriggerInput,
): Promise<Result<SpawnTriggerId, BuilderError>> {
  const s = await requireWorld(repo, worldId);
  if (!s.ok) return s;
  await repo.upsertLocationSpawnTrigger(worldId, input);
  return Ok(input.id);
}

export async function deleteLocationSpawnTrigger(
  repo: BuilderRepository,
  worldId: WorldId,
  id: SpawnTriggerId,
): Promise<Result<void, BuilderError>> {
  const s = await requireWorld(repo, worldId);
  if (!s.ok) return s;
  await repo.deleteLocationSpawnTrigger(worldId, id);
  return Ok(undefined);
}

export async function getWorldLore(
  repo: BuilderRepository,
  worldId: WorldId,
): Promise<Result<WorldLore, BuilderError>> {
  const s = await requireWorld(repo, worldId);
  if (!s.ok) return s;
  return Ok(await repo.readWorldLore(worldId));
}

export async function updateWorldLore(
  repo: BuilderRepository,
  worldId: WorldId,
  patch: { worldOverview?: string; storySoFar?: string },
): Promise<Result<void, BuilderError>> {
  const gate = await requireWorld(repo, worldId);
  if (!gate.ok) return gate;
  const current = await repo.readWorldLore(worldId);
  await repo.writeWorldLore(worldId, {
    worldOverview: patch.worldOverview ?? current.worldOverview,
    storySoFar: patch.storySoFar ?? current.storySoFar,
  });
  return Ok(undefined);
}

export async function upsertTagLore(
  repo: BuilderRepository,
  worldId: WorldId,
  input: UpsertTagLoreInput,
): Promise<Result<TagLoreId, BuilderError>> {
  const gate = await requireWorld(repo, worldId);
  if (!gate.ok) return gate;
  await repo.upsertTagLore(worldId, input);
  return Ok(input.id);
}

export async function deleteTagLore(
  repo: BuilderRepository,
  worldId: WorldId,
  id: TagLoreId,
): Promise<Result<void, BuilderError>> {
  const gate = await requireWorld(repo, worldId);
  if (!gate.ok) return gate;
  await repo.deleteTagLore(worldId, id);
  return Ok(undefined);
}

export async function listWorlds(repo: BuilderRepository) {
  return repo.listWorlds();
}

export async function updateWorldCover(
  repo: BuilderRepository,
  id: WorldId,
  coverImageUrl: string | null,
): Promise<void> {
  return repo.updateWorldCover(id, coverImageUrl);
}

// ---------------------------------------------------------------------------
// Snapshot (starting-state) serialisation + facade ops.
// ---------------------------------------------------------------------------

const asLocInput = (l: Location): UpsertLocationInput => ({
  id: l.id,
  label: l.label,
  shortDescription: l.shortDescription,
  longDescription: l.longDescription,
  tags: l.tags,
  // Defensive default for snapshots predating the secret-description field.
  secretDescription: l.secretDescription ?? '',
});
const asExitInput = (e: Exit): UpsertExitInput => ({
  id: e.id,
  from: e.from,
  to: e.to,
  direction: e.direction,
  label: e.label,
  locked: e.locked,
  lockedByItem: e.lockedByItem,
});
const asItemInput = (i: Item): UpsertItemInput => ({
  id: i.id,
  label: i.label,
  shortDescription: i.shortDescription,
  longDescription: i.longDescription,
  ownerKind: i.owner.kind,
  ownerId: i.owner.id as string,
  weight: i.weight,
  hidden: i.hidden,
  tags: i.tags,
});
const asAgentInput = (a: Agent): UpsertAgentInput => ({
  id: a.id,
  label: a.label,
  shortDescription: a.shortDescription,
  longDescription: a.longDescription,
  locationId: a.locationId,
  hp: a.hp,
  damage: a.damage,
  defense: a.defense,
  capacity: a.capacity,
  mood: a.mood,
  goal: a.goal,
  autonomous: a.autonomous,
  tags: a.tags,
});
const asTemplateInput = (t: MonsterTemplate): UpsertMonsterTemplateInput => ({
  id: t.id,
  templateKey: t.templateKey,
  label: t.label,
  shortDescription: t.shortDescription,
  longDescription: t.longDescription,
  hp: t.hp,
  mood: t.mood,
  startingItems: t.startingItems,
  tags: t.tags,
});
const asTriggerInput = (t: LocationSpawnTrigger): UpsertLocationSpawnTriggerInput => ({
  id: t.id,
  locationId: t.locationId,
  templateId: t.templateId,
  params: t.params,
  count: t.count,
  oneShot: t.oneShot,
  fireOnInitialPublish: t.fireOnInitialPublish,
});

interface SnapshotBlob {
  readonly locations: readonly Location[];
  readonly exits: readonly Exit[];
  readonly items: readonly Item[];
  readonly agents: readonly Agent[];
  readonly templates: readonly MonsterTemplate[];
  readonly triggers: readonly LocationSpawnTrigger[];
  readonly worldLore: { readonly worldOverview: string; readonly storySoFar: string };
  readonly tagLore: ReadonlyArray<{
    readonly id: TagLoreId;
    readonly tag: string;
    readonly title: string;
    readonly description: string;
  }>;
}

function snapshotJson(tree: WorldTree): string {
  const blob: SnapshotBlob = {
    locations: tree.locations,
    exits: tree.exits,
    items: tree.items,
    agents: tree.agents,
    templates: tree.templates,
    triggers: tree.triggers,
    worldLore: {
      worldOverview: tree.worldLore.worldOverview,
      storySoFar: tree.worldLore.storySoFar,
    },
    tagLore: tree.tagLore.map((r) => ({
      id: r.id,
      tag: r.tag,
      title: r.title,
      description: r.description,
    })),
  };
  return JSON.stringify(blob);
}

function parseSnapshot(json: string): SnapshotBlob {
  const raw = JSON.parse(json) as Partial<SnapshotBlob>;
  return {
    locations: raw.locations ?? [],
    exits: raw.exits ?? [],
    items: raw.items ?? [],
    agents: raw.agents ?? [],
    templates: raw.templates ?? [],
    triggers: raw.triggers ?? [],
    worldLore: raw.worldLore ?? { worldOverview: '', storySoFar: '' },
    tagLore: raw.tagLore ?? [],
  };
}

async function wipeWorldEntities(repo: BuilderRepository, worldId: WorldId): Promise<void> {
  const [exits, items, agents, locations, triggers, templates, tagLore] = await Promise.all([
    repo.listExits(worldId),
    repo.listItems(worldId),
    repo.listAgents(worldId),
    repo.listLocations(worldId),
    repo.listLocationSpawnTriggers(worldId),
    repo.listMonsterTemplates(worldId),
    repo.listTagLore(worldId),
  ]);
  for (const e of exits) await repo.deleteExit(worldId, e.id);
  for (const it of items) await repo.deleteItem(worldId, it.id);
  for (const a of agents) await repo.deleteAgent(worldId, a.id);
  for (const l of locations) await repo.deleteLocation(worldId, l.id);
  for (const trg of triggers) await repo.deleteLocationSpawnTrigger(worldId, trg.id);
  for (const tpl of templates) await repo.deleteMonsterTemplate(worldId, tpl.id);
  for (const row of tagLore) await repo.deleteTagLore(worldId, row.id);
}

async function copyBlobIntoWorld(
  repo: BuilderRepository,
  blob: SnapshotBlob,
  destWorldId: WorldId,
): Promise<void> {
  for (const l of blob.locations) await repo.upsertLocation(destWorldId, asLocInput(l));
  for (const a of blob.agents) await repo.upsertAgent(destWorldId, asAgentInput(a));
  for (const it of blob.items) await repo.upsertItem(destWorldId, asItemInput(it));
  for (const e of blob.exits) await repo.upsertExit(destWorldId, asExitInput(e));
  for (const t of blob.templates) await repo.upsertMonsterTemplate(destWorldId, asTemplateInput(t));
  for (const trg of blob.triggers)
    await repo.upsertLocationSpawnTrigger(destWorldId, asTriggerInput(trg));
  await repo.writeWorldLore(destWorldId, {
    worldOverview: blob.worldLore.worldOverview,
    storySoFar: blob.worldLore.storySoFar,
  });
  for (const row of blob.tagLore) {
    await repo.upsertTagLore(destWorldId, {
      id: row.id,
      tag: row.tag,
      title: row.title,
      description: row.description,
    });
  }
}

/**
 * Re-export of the in-memory helper so tests and the seeder can build a
 * snapshot blob from a fully-populated WorldTree. Equivalent to:
 *   `saveStartingState` minus the repo round-trip.
 */
export { copyBlobIntoWorld };

/**
 * Save the scratch world's current entity tables (plus lore + tag_lore) as
 * its starting-state blob. Wholesale replaces any prior blob.
 */
export async function saveStartingState(
  repo: BuilderRepository,
  scratchId: WorldId,
): Promise<Result<void, BuilderError>> {
  const tree = await getWorldTree(repo, scratchId);
  if (!tree.ok) return tree;
  await repo.writeSnapshot(scratchId, snapshotJson(tree.value), Date.now());
  return Ok(undefined);
}

/**
 * Replace the scratch world's entity tables with its starting-state blob.
 * Discards any unsaved scratch edits. Errors if no snapshot exists.
 */
export async function loadStartingState(
  repo: BuilderRepository,
  scratchId: WorldId,
): Promise<Result<void, BuilderError>> {
  const summary = await requireWorld(repo, scratchId);
  if (!summary.ok) return summary;
  const snap = await repo.readSnapshot(scratchId);
  if (!snap) {
    return Err(
      err(
        BuilderErrorKind.SnapshotConflict,
        `no starting-state snapshot for ${scratchId}; save one first`,
      ),
    );
  }
  const blob = parseSnapshot(snap.json);
  return repo.transaction<Result<void, BuilderError>>(async (tx) => {
    await wipeWorldEntities(tx, scratchId);
    await copyBlobIntoWorld(tx, blob, scratchId);
    return Ok(undefined);
  });
}

async function findLiveForScratch(
  repo: BuilderRepository,
  scratchId: WorldId,
): Promise<WorldId | null> {
  const all = await repo.listWorlds();
  const hit = all.find((w) => w.kind === WorldKind.Live && w.parentDraftId === scratchId);
  return hit?.id ?? null;
}

/**
 * Reset the live world (counterpart of the scratch passed in) to the
 * starting-state blob stored on the scratch. Wipes live entity tables and
 * lore + tag_lore, then re-inserts from the blob.
 */
export async function resetLiveFromStartingState(
  repo: BuilderRepository,
  scratchId: WorldId,
): Promise<Result<void, BuilderError>> {
  const scratch = await requireWorld(repo, scratchId);
  if (!scratch.ok) return scratch;
  if (scratch.value.kind !== WorldKind.Draft) {
    return Err(
      err(BuilderErrorKind.WorldKindMismatch, `world ${scratchId} is not a scratch (draft) world`),
    );
  }
  const liveId = await findLiveForScratch(repo, scratchId);
  if (!liveId) {
    return Err(
      err(BuilderErrorKind.NoLiveWorldForDraft, `no live world linked to scratch ${scratchId}`),
    );
  }
  const snap = await repo.readSnapshot(scratchId);
  if (!snap) {
    return Err(
      err(
        BuilderErrorKind.SnapshotConflict,
        `no starting-state snapshot for ${scratchId}; save one first`,
      ),
    );
  }
  const blob = parseSnapshot(snap.json);
  return repo.transaction<Result<void, BuilderError>>(async (tx) => {
    await wipeWorldEntities(tx, liveId);
    await copyBlobIntoWorld(tx, blob, liveId);
    await tx.writeTriggerFireState(liveId, { byTriggerId: {} });
    return Ok(undefined);
  });
}

// Internal helper exposed so the seeder can create the paired live world for
// a freshly-seeded scratch.
export async function createLiveForScratch(
  repo: BuilderRepository,
  scratchId: WorldId,
  liveId: WorldId,
): Promise<Result<void, BuilderError>> {
  const scratch = await requireWorld(repo, scratchId);
  if (!scratch.ok) return scratch;
  const tree = await getWorldTree(repo, scratchId);
  if (!tree.ok) return tree;
  await repo.createWorld({
    id: liveId,
    kind: WorldKind.Live,
    label: scratch.value.label,
    displayName: scratch.value.displayName,
    parentDraftId: scratchId,
    playerAgentId: scratch.value.playerAgentId,
    coverImageUrl: scratch.value.coverImageUrl,
  });
  await copyBlobIntoWorld(
    repo,
    {
      locations: tree.value.locations,
      exits: tree.value.exits,
      items: tree.value.items,
      agents: tree.value.agents,
      templates: tree.value.templates,
      triggers: tree.value.triggers,
      worldLore: {
        worldOverview: tree.value.worldLore.worldOverview,
        storySoFar: tree.value.worldLore.storySoFar,
      },
      tagLore: tree.value.tagLore.map((r) => ({
        id: r.id,
        tag: r.tag,
        title: r.title,
        description: r.description,
      })),
    },
    liveId,
  );
  return Ok(undefined);
}
