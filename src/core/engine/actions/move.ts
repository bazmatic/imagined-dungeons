import type { BuilderRepository } from '@core/builder/repository';
import type { Action } from '@core/domain/actions';
import type { DomainEvent } from '@core/domain/events';
import { asExitId, asLocationId, type AgentId, type WorldId } from '@core/domain/ids';
import { EventKind, OwnerKind } from '@core/domain/kinds';
import { Err, Ok, type Result } from '@core/domain/result';
import { isPlayerInCombat } from '../combat';
import { nextEventId } from '../ids-gen';
import { perceive, type PerceptionView } from '../perception';
import type { HandlerRepo } from '../repository';
import { renderMoveSelf } from '../templates';
import type { ActionOutcome } from './types';

export interface MoveHandlerDeps {
  readonly builderRepo?: BuilderRepository;
  readonly worldId?: WorldId;
  readonly playerId?: AgentId;
  readonly view?: PerceptionView;
}

const REVERSE_DIRECTION: Readonly<Record<string, string>> = {
  north: 'south',
  south: 'north',
  east: 'west',
  west: 'east',
  up: 'down',
  down: 'up',
  northeast: 'southwest',
  southwest: 'northeast',
  northwest: 'southeast',
  southeast: 'northwest',
};

export async function handleMove(
  action: Extract<Action, { kind: 'move' }>,
  repo: HandlerRepo,
  deps: MoveHandlerDeps = {},
): Promise<Result<ActionOutcome, string>> {
  const view = deps.view ?? await perceive(action.actorId, repo);
  const exit = view.exits.find((e) => e.direction === action.direction);
  if (!exit) return Err("You can't go that way.");

  if (deps.playerId && action.actorId === deps.playerId) {
    if (await isPlayerInCombat(deps.playerId, view.location.id, repo)) {
      return Err("You can't leave while in combat.");
    }
  }

  if (exit.to === null) {
    if (!deps.builderRepo) return Err("You can't go that way.");
    const worldId = deps.worldId ?? (await repo.getWorldId());
    const summary = await deps.builderRepo.getWorldSummary(worldId);
    if (!summary || summary.playerAgentId !== action.actorId) {
      return Err("You can't go that way.");
    }

    const stubId = asLocationId(`loc_stub_${Math.random().toString(36).slice(2, 10)}`);
    const stubLabel = exit.label ? `Beyond the ${exit.label}` : `The ${exit.direction} passage`;
    await deps.builderRepo.upsertLocation(worldId, {
      id: stubId,
      label: stubLabel,
      shortDescription: 'You stand in the threshold, on the edge of somewhere not yet formed.',
      longDescription: '',
      secretDescription: '',
      tags: [],
    });

    await deps.builderRepo.upsertExit(worldId, {
      id: exit.id,
      from: exit.from,
      to: stubId,
      direction: exit.direction,
      label: exit.label,
      locked: false,
      lockedByItem: null,
    });

    const reverseDir = REVERSE_DIRECTION[exit.direction] ?? exit.direction;
    const reciprocalId = asExitId(`exit_stub_${Math.random().toString(36).slice(2, 10)}`);
    await deps.builderRepo.upsertExit(worldId, {
      id: reciprocalId,
      from: stubId,
      to: exit.from,
      direction: reverseDir,
      label: exit.label,
      locked: false,
      lockedByItem: null,
    });

    await repo.moveAgent(action.actorId, stubId);
    const atSource = (await repo.agentsAt(view.location.id)).map((a) => a.id);
    const atDest = (await repo.agentsAt(stubId)).map((a) => a.id);
    const witnesses = [...new Set([...atSource, ...atDest])];
    const event: DomainEvent = {
      id: nextEventId(),
      worldId: await repo.getWorldId(),
      actorId: action.actorId,
      kind: EventKind.Move,
      witnesses,
      createdAt: new Date(),
      from: view.location.id,
      to: stubId,
      direction: action.direction,
    };
    await repo.appendEvent(event);
    return Ok({ render: renderMoveSelf(action.direction), event });
  }

  if (exit.locked) {
    const keyId = exit.lockedByItem;
    if (keyId === null) return Err(`The ${exit.label} is locked.`);
    const inventory = await repo.itemsOwnedBy({ kind: OwnerKind.Agent, id: action.actorId });
    const holdsKey = inventory.some((i) => i.id === keyId);
    if (!holdsKey) return Err(`The ${exit.label} is locked.`);
    await repo.setExitLocked(exit.id, false);
  }

  await repo.moveAgent(action.actorId, exit.to);
  const atSource = (await repo.agentsAt(view.location.id)).map((a) => a.id);
  const atDest = (await repo.agentsAt(exit.to)).map((a) => a.id);
  const witnesses = [...new Set([...atSource, ...atDest])];
  const event: DomainEvent = {
    id: nextEventId(),
    worldId: await repo.getWorldId(),
    actorId: action.actorId,
    kind: EventKind.Move,
    witnesses,
    createdAt: new Date(),
    from: view.location.id,
    to: exit.to,
    direction: action.direction,
  };
  await repo.appendEvent(event);
  return Ok({ render: renderMoveSelf(action.direction), event });
}
