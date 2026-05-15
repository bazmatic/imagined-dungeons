import type { Action } from '@core/domain/actions';
import type { DomainEvent } from '@core/domain/events';
import { EventKind } from '@core/domain/kinds';
import { Err, Ok, type Result } from '@core/domain/result';
import { SegmentKind } from '@core/domain/segments';
import { nextEventId } from '../ids-gen';
import { perceive } from '../perception';
import type { Repository } from '../repository';
import type { ActionOutcome } from './types';

export async function handleEmote(
  action: Extract<Action, { kind: 'emote' }>,
  repo: Repository,
): Promise<Result<ActionOutcome, string>> {
  const view = await perceive(action.actorId, repo);
  if (action.targetAgentId !== null) {
    const target = await repo.getAgent(action.targetAgentId);
    if (target.locationId !== view.location.id) {
      return Err(`${target.label} isn't here.`);
    }
  }

  const witnesses = (await repo.agentsAt(view.location.id)).map((a) => a.id);
  const event: DomainEvent = {
    id: nextEventId(),
    worldId: await repo.getWorldId(),
    actorId: action.actorId,
    kind: EventKind.Emote,
    witnesses,
    createdAt: new Date(),
    description: action.description,
    targetAgentId: action.targetAgentId,
  };
  // Placeholder render — runTurn replaces this with the actor's narration.
  return Ok({ render: [{ kind: SegmentKind.Narration, text: '…' }], event });
}
