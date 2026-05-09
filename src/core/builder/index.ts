import {
  BuilderErrorKind,
  EntityKind,
  PublishOutcomeKind,
  WorldKind,
} from '@core/domain/builder-kinds';
import type {
  BuilderError,
  CreateDraftInput,
  LocationSpawnTrigger,
  MonsterTemplate,
  PublishResult,
  TriggerFireState,
  UpsertAgentInput,
  UpsertExitInput,
  UpsertItemInput,
  UpsertLocationInput,
  UpsertLocationSpawnTriggerInput,
  UpsertMonsterTemplateInput,
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
  type WorldId,
  asWorldId,
} from '@core/domain/ids';
import { Err, Ok, type Result } from '@core/domain/result';
import { computeMergePlan } from './diff';
import type { BuilderRepository } from './repository';
import { validateWorld } from './validate';

const newDraftId = (): WorldId => asWorldId(`w_draft_${Math.random().toString(36).slice(2, 10)}`);

const err = (kind: BuilderErrorKind, message: string): BuilderError => ({ kind, message });

async function requireWorld(repo: BuilderRepository, id: WorldId) {
  const s = await repo.getWorldSummary(id);
  if (!s) return Err(err(BuilderErrorKind.WorldNotFound, `world not found: ${id}`));
  return Ok(s);
}

/**
 * Integrity gate for direct structural writes (upsert*\/delete*). Live worlds
 * are read-only from outside the publish flow; the only mutators are
 * `publish` and `resetLiveToDraft`. This prevents an MCP/HTTP client from
 * bypassing validation by writing straight at a live world id.
 */
async function requireDraft(repo: BuilderRepository, id: WorldId) {
  const s = await requireWorld(repo, id);
  if (!s.ok) return s;
  if (s.value.kind !== WorldKind.Draft) {
    return Err(
      err(
        BuilderErrorKind.WorldKindMismatch,
        `world ${id} is live; direct writes go through publish`,
      ),
    );
  }
  return s;
}

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
  });
  return Ok(id);
}

export async function getWorldTree(
  repo: BuilderRepository,
  id: WorldId,
): Promise<Result<WorldTree, BuilderError>> {
  const s = await requireWorld(repo, id);
  if (!s.ok) return s;
  const [locations, exits, items, agents, templates, triggers] = await Promise.all([
    repo.listLocations(id),
    repo.listExits(id),
    repo.listItems(id),
    repo.listAgents(id),
    repo.listMonsterTemplates(id),
    repo.listLocationSpawnTriggers(id),
  ]);
  return Ok({
    summary: s.value,
    locations,
    exits,
    items,
    agents,
    templates,
    triggers,
  });
}

export async function upsertLocation(
  repo: BuilderRepository,
  worldId: WorldId,
  input: UpsertLocationInput,
): Promise<Result<LocationId, BuilderError>> {
  const s = await requireDraft(repo, worldId);
  if (!s.ok) return s;
  await repo.upsertLocation(worldId, input);
  return Ok(input.id);
}

export async function upsertExit(
  repo: BuilderRepository,
  worldId: WorldId,
  input: UpsertExitInput,
): Promise<Result<ExitId, BuilderError>> {
  const s = await requireDraft(repo, worldId);
  if (!s.ok) return s;
  await repo.upsertExit(worldId, input);
  return Ok(input.id);
}

export async function upsertItem(
  repo: BuilderRepository,
  worldId: WorldId,
  input: UpsertItemInput,
): Promise<Result<ItemId, BuilderError>> {
  const s = await requireDraft(repo, worldId);
  if (!s.ok) return s;
  await repo.upsertItem(worldId, input);
  return Ok(input.id);
}

export async function upsertAgent(
  repo: BuilderRepository,
  worldId: WorldId,
  input: UpsertAgentInput,
): Promise<Result<AgentId, BuilderError>> {
  const s = await requireDraft(repo, worldId);
  if (!s.ok) return s;
  await repo.upsertAgent(worldId, input);
  return Ok(input.id);
}

export async function deleteLocation(
  repo: BuilderRepository,
  worldId: WorldId,
  id: LocationId,
): Promise<Result<void, BuilderError>> {
  const s = await requireDraft(repo, worldId);
  if (!s.ok) return s;
  await repo.deleteLocation(worldId, id);
  return Ok(undefined);
}

export async function deleteExit(
  repo: BuilderRepository,
  worldId: WorldId,
  id: ExitId,
): Promise<Result<void, BuilderError>> {
  const s = await requireDraft(repo, worldId);
  if (!s.ok) return s;
  await repo.deleteExit(worldId, id);
  return Ok(undefined);
}

export async function deleteItem(
  repo: BuilderRepository,
  worldId: WorldId,
  id: ItemId,
): Promise<Result<void, BuilderError>> {
  const s = await requireDraft(repo, worldId);
  if (!s.ok) return s;
  await repo.deleteItem(worldId, id);
  return Ok(undefined);
}

export async function deleteAgent(
  repo: BuilderRepository,
  worldId: WorldId,
  id: AgentId,
): Promise<Result<void, BuilderError>> {
  const s = await requireDraft(repo, worldId);
  if (!s.ok) return s;
  await repo.deleteAgent(worldId, id);
  return Ok(undefined);
}

export async function upsertMonsterTemplate(
  repo: BuilderRepository,
  worldId: WorldId,
  input: UpsertMonsterTemplateInput,
): Promise<Result<MonsterTemplateId, BuilderError>> {
  const s = await requireDraft(repo, worldId);
  if (!s.ok) return s;
  await repo.upsertMonsterTemplate(worldId, input);
  return Ok(input.id);
}

export async function deleteMonsterTemplate(
  repo: BuilderRepository,
  worldId: WorldId,
  id: MonsterTemplateId,
): Promise<Result<void, BuilderError>> {
  const s = await requireDraft(repo, worldId);
  if (!s.ok) return s;
  await repo.deleteMonsterTemplate(worldId, id);
  return Ok(undefined);
}

export async function upsertLocationSpawnTrigger(
  repo: BuilderRepository,
  worldId: WorldId,
  input: UpsertLocationSpawnTriggerInput,
): Promise<Result<SpawnTriggerId, BuilderError>> {
  const s = await requireDraft(repo, worldId);
  if (!s.ok) return s;
  await repo.upsertLocationSpawnTrigger(worldId, input);
  return Ok(input.id);
}

export async function deleteLocationSpawnTrigger(
  repo: BuilderRepository,
  worldId: WorldId,
  id: SpawnTriggerId,
): Promise<Result<void, BuilderError>> {
  const s = await requireDraft(repo, worldId);
  if (!s.ok) return s;
  await repo.deleteLocationSpawnTrigger(worldId, id);
  return Ok(undefined);
}

export async function listWorlds(repo: BuilderRepository) {
  return repo.listWorlds();
}

const newLiveId = (): WorldId => asWorldId(`w_live_${Math.random().toString(36).slice(2, 10)}`);

async function findLiveForDraft(
  repo: BuilderRepository,
  draftId: WorldId,
): Promise<WorldId | null> {
  const all = await repo.listWorlds();
  const hit = all.find((w) => w.kind === WorldKind.Live && w.parentDraftId === draftId);
  return hit?.id ?? null;
}

const asLocInput = (l: Location): UpsertLocationInput => ({
  id: l.id,
  label: l.label,
  shortDescription: l.shortDescription,
  longDescription: l.longDescription,
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

async function copyTreeIntoWorld(
  repo: BuilderRepository,
  source: WorldTree,
  destWorldId: WorldId,
): Promise<void> {
  for (const l of source.locations) await repo.upsertLocation(destWorldId, asLocInput(l));
  for (const a of source.agents) await repo.upsertAgent(destWorldId, asAgentInput(a));
  for (const it of source.items) await repo.upsertItem(destWorldId, asItemInput(it));
  for (const e of source.exits) await repo.upsertExit(destWorldId, asExitInput(e));
  for (const t of source.templates)
    await repo.upsertMonsterTemplate(destWorldId, asTemplateInput(t));
  for (const trg of source.triggers)
    await repo.upsertLocationSpawnTrigger(destWorldId, asTriggerInput(trg));
}

function snapshotJson(tree: WorldTree, fireState: TriggerFireState = { byTriggerId: {} }): string {
  return JSON.stringify({
    locations: tree.locations,
    exits: tree.exits,
    items: tree.items,
    agents: tree.agents,
    templates: tree.templates,
    triggers: tree.triggers,
    triggerFireState: fireState,
  });
}

export async function publish(
  repo: BuilderRepository,
  draftId: WorldId,
): Promise<Result<PublishResult, BuilderError>> {
  const draftSummary = await requireWorld(repo, draftId);
  if (!draftSummary.ok) return draftSummary;
  if (draftSummary.value.kind !== WorldKind.Draft) {
    return Err(err(BuilderErrorKind.WorldKindMismatch, `world ${draftId} is not a draft`));
  }
  const draftTree = await getWorldTree(repo, draftId);
  if (!draftTree.ok) return draftTree;

  const problems = validateWorld(draftTree.value);
  if (problems.length > 0) {
    return Err({
      kind: BuilderErrorKind.ValidationFailed,
      message: 'draft has validation problems',
      problems,
    });
  }

  const liveId = await findLiveForDraft(repo, draftId);
  return repo.transaction<Result<PublishResult, BuilderError>>(async (tx) => {
    if (!liveId) {
      const newId = newLiveId();
      await tx.createWorld({
        id: newId,
        kind: WorldKind.Live,
        label: draftSummary.value.label,
        displayName: draftSummary.value.displayName,
        parentDraftId: draftId,
        playerAgentId: draftSummary.value.playerAgentId,
      });
      await copyTreeIntoWorld(tx, draftTree.value, newId);
      await tx.writeSnapshot(newId, snapshotJson(draftTree.value), Date.now());
      return Ok({
        outcome: PublishOutcomeKind.Created,
        liveWorldId: newId,
        applied: {
          inserts:
            draftTree.value.locations.length +
            draftTree.value.exits.length +
            draftTree.value.items.length +
            draftTree.value.agents.length,
          updates: 0,
          deletes: 0,
        },
        skipped: [],
        initialSpawns: 0,
      });
    }

    const snap = await tx.readSnapshot(liveId);
    const liveTree = await getWorldTree(tx, liveId);
    if (!liveTree.ok) return liveTree;
    const snapTree: WorldTree = snap
      ? {
          summary: liveTree.value.summary,
          ...(JSON.parse(snap.json) as Pick<
            WorldTree,
            'locations' | 'exits' | 'items' | 'agents' | 'templates' | 'triggers'
          >),
        }
      : { ...liveTree.value };
    const plan = computeMergePlan(snapTree, draftTree.value, liveTree.value);

    for (const l of plan.inserts.locations) await tx.upsertLocation(liveId, asLocInput(l));
    for (const a of plan.inserts.agents) await tx.upsertAgent(liveId, asAgentInput(a));
    for (const it of plan.inserts.items) await tx.upsertItem(liveId, asItemInput(it));
    for (const e of plan.inserts.exits) await tx.upsertExit(liveId, asExitInput(e));
    for (const l of plan.updates.locations) await tx.upsertLocation(liveId, asLocInput(l));
    for (const a of plan.updates.agents) await tx.upsertAgent(liveId, asAgentInput(a));
    for (const it of plan.updates.items) await tx.upsertItem(liveId, asItemInput(it));
    for (const e of plan.updates.exits) await tx.upsertExit(liveId, asExitInput(e));
    for (const ref of plan.deletes) {
      if (ref.kind === EntityKind.Location) await tx.deleteLocation(liveId, ref.id);
      else if (ref.kind === EntityKind.Exit) await tx.deleteExit(liveId, ref.id);
      else if (ref.kind === EntityKind.Item) await tx.deleteItem(liveId, ref.id);
      else if (ref.kind === EntityKind.Agent) await tx.deleteAgent(liveId, ref.id);
      else {
        // MonsterTemplate / LocationSpawnTrigger never appear in structural merges —
        // they're authored rules, not entities. Reaching this branch is a logic error.
        throw new Error(`unexpected entity kind in publish deletes: ${ref.kind}`);
      }
    }
    await tx.writeSnapshot(liveId, snapshotJson(draftTree.value), Date.now());

    return Ok({
      outcome: PublishOutcomeKind.Merged,
      liveWorldId: liveId,
      applied: {
        inserts:
          plan.inserts.locations.length +
          plan.inserts.exits.length +
          plan.inserts.items.length +
          plan.inserts.agents.length,
        updates:
          plan.updates.locations.length +
          plan.updates.exits.length +
          plan.updates.items.length +
          plan.updates.agents.length,
        deletes: plan.deletes.length,
      },
      skipped: plan.skipped,
      initialSpawns: 0,
    });
  });
}

export async function cloneLiveAsDraft(
  repo: BuilderRepository,
  liveWorldId: WorldId,
): Promise<Result<WorldId, BuilderError>> {
  const live = await requireWorld(repo, liveWorldId);
  if (!live.ok) return live;
  if (live.value.kind !== WorldKind.Live) {
    return Err(err(BuilderErrorKind.WorldKindMismatch, `world ${liveWorldId} is not live`));
  }
  const liveTree = await getWorldTree(repo, liveWorldId);
  if (!liveTree.ok) return liveTree;

  const draftId = newDraftId();
  await repo.createWorld({
    id: draftId,
    kind: WorldKind.Draft,
    label: live.value.label,
    displayName: live.value.displayName,
    parentDraftId: null,
    playerAgentId: live.value.playerAgentId,
  });
  await copyTreeIntoWorld(repo, liveTree.value, draftId);
  await repo.updateWorldSummary(liveWorldId, { parentDraftId: draftId });
  return Ok(draftId);
}

export async function resetLiveToDraft(
  repo: BuilderRepository,
  draftId: WorldId,
): Promise<Result<void, BuilderError>> {
  const draft = await requireWorld(repo, draftId);
  if (!draft.ok) return draft;
  if (draft.value.kind !== WorldKind.Draft) {
    return Err(err(BuilderErrorKind.WorldKindMismatch, `world ${draftId} is not a draft`));
  }
  const liveId = await findLiveForDraft(repo, draftId);
  if (!liveId) {
    return Err(
      err(BuilderErrorKind.NoLiveWorldForDraft, `no live world published from ${draftId}`),
    );
  }
  const draftTree = await getWorldTree(repo, draftId);
  if (!draftTree.ok) return draftTree;
  const problems = validateWorld(draftTree.value);
  if (problems.length > 0) {
    return Err({
      kind: BuilderErrorKind.ValidationFailed,
      message: 'draft has validation problems',
      problems,
    });
  }

  return repo.transaction<Result<void, BuilderError>>(async (tx) => {
    const live = await getWorldTree(tx, liveId);
    if (!live.ok) return live;
    for (const e of live.value.exits) await tx.deleteExit(liveId, e.id);
    for (const it of live.value.items) await tx.deleteItem(liveId, it.id);
    for (const a of live.value.agents) await tx.deleteAgent(liveId, a.id);
    for (const l of live.value.locations) await tx.deleteLocation(liveId, l.id);
    await copyTreeIntoWorld(tx, draftTree.value, liveId);
    await tx.writeSnapshot(liveId, snapshotJson(draftTree.value), Date.now());
    return Ok(undefined);
  });
}
