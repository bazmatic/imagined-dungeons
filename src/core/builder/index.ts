import { BuilderErrorKind, WorldKind } from '@core/domain/builder-kinds';
import type {
  BuilderError,
  CreateDraftInput,
  UpsertAgentInput,
  UpsertExitInput,
  UpsertItemInput,
  UpsertLocationInput,
  WorldTree,
} from '@core/domain/builder-types';
import {
  type AgentId,
  type ExitId,
  type ItemId,
  type LocationId,
  type WorldId,
  asWorldId,
} from '@core/domain/ids';
import { Err, Ok, type Result } from '@core/domain/result';
import type { BuilderRepository } from './repository';

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
  const [locations, exits, items, agents] = await Promise.all([
    repo.listLocations(id),
    repo.listExits(id),
    repo.listItems(id),
    repo.listAgents(id),
  ]);
  return Ok({ summary: s.value, locations, exits, items, agents });
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

export async function listWorlds(repo: BuilderRepository) {
  return repo.listWorlds();
}
