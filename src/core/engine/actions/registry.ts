import type { Action } from '@core/domain/actions';
import type { Result } from '@core/domain/result';
import type { Repository } from '../repository';
import { handleDrop } from './drop';
import { handleInventory } from './inventory';
import { handleLook } from './look';
import { handleMove } from './move';
import { handleTake } from './take';
import type { ActionOutcome } from './types';

export async function dispatch(
  action: Action,
  repo: Repository,
): Promise<Result<ActionOutcome, string>> {
  switch (action.kind) {
    case 'move':
      return handleMove(action, repo);
    case 'look':
      return handleLook(action, repo);
    case 'take':
      return handleTake(action, repo);
    case 'drop':
      return handleDrop(action, repo);
    case 'inventory':
      return handleInventory(action, repo);
  }
}
