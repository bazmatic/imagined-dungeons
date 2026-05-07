import type { Action } from '@core/domain/actions';
import { ActionKind } from '@core/domain/kinds';
import type { Result } from '@core/domain/result';
import type { Repository } from '../repository';
import { handleAttack } from './attack';
import { handleDrop } from './drop';
import { handleInventory } from './inventory';
import { handleLook } from './look';
import { handleMove } from './move';
import { handleSpeak } from './speak';
import { handleTake } from './take';
import type { ActionOutcome } from './types';
import { handleUpdateDescription } from './update-description';

export async function dispatch(
  action: Action,
  repo: Repository,
): Promise<Result<ActionOutcome, string>> {
  switch (action.kind) {
    case ActionKind.Move:
      return handleMove(action, repo);
    case ActionKind.Look:
      return handleLook(action, repo);
    case ActionKind.Take:
      return handleTake(action, repo);
    case ActionKind.Drop:
      return handleDrop(action, repo);
    case ActionKind.Inventory:
      return handleInventory(action, repo);
    case ActionKind.Speak:
      return handleSpeak(action, repo);
    case ActionKind.Attack:
      return handleAttack(action, repo);
    case ActionKind.UpdateDescription:
      return handleUpdateDescription(action, repo);
  }
}
