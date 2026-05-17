import type { Action } from '@core/domain/actions';
import type { DomainEvent } from '@core/domain/events';
import { EventKind, ExaminableKind } from '@core/domain/kinds';
import { Err, Ok, type Result } from '@core/domain/result';
import type { Exit, Location } from '@core/domain/entities';
import type { Segment } from '@core/domain/segments';
import { SegmentKind } from '@core/domain/segments';
import type { WorldId } from '@core/domain/ids';
import type { LoreContext } from '@core/domain/builder-types';
import type { BuilderRepository } from '@core/builder/repository';
import { loadLoreContext } from '@core/lore/context';
import { nextEventId } from '../ids-gen';
import { perceive, type PerceptionView } from '../perception';
import type { HandlerRepo } from '../repository';
import { renderLook, renderLookAgent, renderLookExit, renderLookTarget } from '../templates';
import type { GameAI } from '../game-ai';
import type { ActionOutcome } from './types';

export interface LookDeps {
  readonly view?: PerceptionView;
  readonly ai?: GameAI | null;
  readonly builderRepo?: BuilderRepository;
  readonly worldId?: WorldId;
}

async function buildExitRender(
  exit: Exit,
  repo: HandlerRepo,
  deps: LookDeps,
): Promise<readonly Segment[]> {
  if (exit.locked || exit.to === null) return renderLookExit(exit);

  let destination: Location;
  try {
    destination = await repo.getLocation(exit.to);
  } catch {
    return renderLookExit(exit);
  }

  let lore: LoreContext | null = null;
  if (deps.builderRepo && deps.worldId) {
    try {
      lore = await loadLoreContext(
        deps.builderRepo,
        repo,
        deps.worldId,
        { tags: destination.tags, locationId: null },
      );
    } catch {
      // lore remains null — proceed without tag context
    }
  }

  const prose = deps.ai ? await deps.ai.peekExit(exit, destination, lore) : null;
  if (prose) return [{ kind: SegmentKind.Narration, text: prose }];
  return renderLookExit(exit, destination.label);
}

export async function handleLook(
  action: Extract<Action, { kind: 'look' }>,
  repo: HandlerRepo,
  deps?: LookDeps,
): Promise<Result<ActionOutcome, string>> {
  const view = deps?.view ?? await perceive(action.actorId, repo);
  const witnesses = (await repo.agentsAt(view.location.id)).map((a) => a.id);
  const baseEvent = {
    id: nextEventId(),
    worldId: await repo.getWorldId(),
    actorId: action.actorId,
    witnesses,
    createdAt: new Date(),
  };

  const target = action.target;
  switch (target.kind) {
    case ExaminableKind.Room: {
      const event: DomainEvent = {
        ...baseEvent,
        kind: EventKind.Look,
        locationId: view.location.id,
        target: { kind: ExaminableKind.Room },
      };
      await repo.appendEvent(event);
      return Ok({ render: renderLook(view), event });
    }
    case ExaminableKind.Item: {
      const item = await repo.getItem(target.id);
      const event: DomainEvent = {
        ...baseEvent,
        kind: EventKind.Look,
        locationId: view.location.id,
        target: { kind: ExaminableKind.Item, id: item.id },
      };
      await repo.appendEvent(event);
      return Ok({ render: renderLookTarget(item), event });
    }
    case ExaminableKind.Agent: {
      const agent = await repo.getAgent(target.id);
      const event: DomainEvent = {
        ...baseEvent,
        kind: EventKind.Look,
        locationId: view.location.id,
        target: { kind: ExaminableKind.Agent, id: agent.id },
      };
      await repo.appendEvent(event);
      return Ok({ render: renderLookAgent(agent), event });
    }
    case ExaminableKind.Exit: {
      const exit = await repo.getExit(target.id);
      const event: DomainEvent = {
        ...baseEvent,
        kind: EventKind.Look,
        locationId: view.location.id,
        target: { kind: ExaminableKind.Exit, id: exit.id },
      };
      await repo.appendEvent(event);
      return Ok({ render: await buildExitRender(exit, repo, deps ?? {}), event });
    }
    case ExaminableKind.Location:
      // Reserved discriminator: the parser does not currently produce a
      // non-current-location target. Surface a friendly error if some future
      // path emits one before slice 6 wires it up.
      return Err('You can only examine your current surroundings.');
  }
}
