import type { Action } from '@core/domain/actions';
import type { DomainEvent } from '@core/domain/events';
import { EventKind, ExaminableKind } from '@core/domain/kinds';
import { Err, Ok, type Result } from '@core/domain/result';
import { nextEventId } from '../ids-gen';
import { perceive } from '../perception';
import type { Repository } from '../repository';
import { renderLook, renderLookAgent, renderLookExit, renderLookTarget } from '../templates';
import type { ActionOutcome } from './types';

export async function handleLook(
  action: Extract<Action, { kind: 'look' }>,
  repo: Repository,
): Promise<Result<ActionOutcome, string>> {
  const view = await perceive(action.actorId, repo);
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
      return Ok({ render: renderLookExit(exit), event });
    }
    case ExaminableKind.Location:
      // Reserved discriminator: the parser does not currently produce a
      // non-current-location target. Surface a friendly error if some future
      // path emits one before slice 6 wires it up.
      return Err('You can only examine your current surroundings.');
  }
}
