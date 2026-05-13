import type { BuilderRepository } from '@core/builder/repository';
import type { Action } from '@core/domain/actions';
import type { WorldId } from '@core/domain/ids';
import { ActionKind } from '@core/domain/kinds';
import { Err, type Result } from '@core/domain/result';
import type { LanguageModel } from '../language-model';
import type { Repository } from '../repository';
import { handleAttack } from './attack';
import { handleClose } from './close';
import { handleDrop } from './drop';
import { handleEmote } from './emote';
import { handleEquip, handleUnequip } from './equip';
import { handleGive } from './give';
import { handleInventory } from './inventory';
import { handleLook } from './look';
import { handleMove } from './move';
import { handleOpen } from './open';
import { handleRevealItem } from './reveal-item';
import { handleSearch } from './search';
import { handleSpeak } from './speak';
import { handleTake } from './take';
import type { ActionOutcome } from './types';
import { handleUpdateDescription } from './update-description';

/**
 * Optional dependencies passed to handlers that need them (currently only
 * `handleSearch`, which calls the generative-discovery LLM and persists
 * spawned entities through the builder port). Handlers that don't need
 * these may ignore them. Missing deps for a handler that requires them
 * cause that handler to return an `Err` rather than crash the turn.
 */
export interface DispatchDeps {
  readonly llm?: LanguageModel | null;
  readonly builderRepo?: BuilderRepository;
  readonly worldId?: WorldId;
}

export async function dispatch(
  action: Action,
  repo: Repository,
  deps: DispatchDeps = {},
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
    case ActionKind.Give:
      return handleGive(action, repo);
    case ActionKind.Inventory:
      return handleInventory(action, repo);
    case ActionKind.Speak:
      return handleSpeak(action, repo);
    case ActionKind.Emote:
      return handleEmote(action, repo);
    case ActionKind.Attack:
      return handleAttack(action, repo);
    case ActionKind.UpdateDescription:
      return handleUpdateDescription(action, repo);
    case ActionKind.Search: {
      if (!deps.llm || !deps.builderRepo || !deps.worldId) {
        return Err('search requires llm and builderRepo');
      }
      return handleSearch(action, repo, {
        llm: deps.llm,
        builderRepo: deps.builderRepo,
        worldId: deps.worldId,
      });
    }
    case ActionKind.Equip:
      return handleEquip(action, repo);
    case ActionKind.Unequip:
      return handleUnequip(action, repo);
    case ActionKind.Open:
      return handleOpen(action, repo);
    case ActionKind.Close:
      return handleClose(action, repo);
    case ActionKind.RevealItem:
      return handleRevealItem(action, repo);
  }
}
