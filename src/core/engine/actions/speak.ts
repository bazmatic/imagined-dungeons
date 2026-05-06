import type { Action } from '@core/domain/actions';
import type { DomainEvent } from '@core/domain/events';
import { EventKind } from '@core/domain/kinds';
import { Err, Ok, type Result } from '@core/domain/result';
import { nextEventId } from '../ids-gen';
import { perceive } from '../perception';
import type { Repository } from '../repository';
import type { ActionOutcome } from './types';

export async function handleSpeak(
  action: Extract<Action, { kind: 'speak' }>,
  repo: Repository,
): Promise<Result<ActionOutcome, string>> {
  const view = await perceive(action.actorId, repo);
  const target = await repo.getAgent(action.targetAgentId);
  if (target.locationId !== view.location.id) {
    return Err(`${target.label} isn't here.`);
  }

  const witnesses = (await repo.agentsAt(view.location.id)).map((a) => a.id);
  const event: DomainEvent = {
    id: nextEventId(),
    worldId: await repo.getWorldId(),
    actorId: action.actorId,
    kind: EventKind.Speak,
    witnesses,
    createdAt: new Date(),
    targetAgentId: action.targetAgentId,
    utterance: action.utterance,
  };
  // Placeholder render — runTurn replaces this with the actor's narration.
  return Ok({ render: '…', event });
}
