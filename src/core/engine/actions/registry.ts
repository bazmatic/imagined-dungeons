import type { BuilderRepository } from '@core/builder/repository';
import type { Action } from '@core/domain/actions';
import type { AgentId, WorldId } from '@core/domain/ids';
import { ActionKind } from '@core/domain/kinds';
import { Err, type Result } from '@core/domain/result';
import type { GameAI } from '../game-ai';
import type { PerceptionView } from '../perception';
import type { HandlerRepo } from '../repository';
import { handleAttack } from './attack';
import { handleBuy } from './buy';
import { handleClose } from './close';
import { handleDrop } from './drop';
import { handleEmote } from './emote';
import { handleEquip, handleUnequip } from './equip';
import { handleGive } from './give';
import { handleInventory } from './inventory';
import { handleLook } from './look';
import { handleMove } from './move';
import { handleOffer } from './offer';
import { handleOpen } from './open';
import { handleRevealItem } from './reveal-item';
import { handleSearch } from './search';
import { handleSell } from './sell';
import { handleSpeak } from './speak';
import { handleTake } from './take';
import type { ActionOutcome } from './types';
import { handleUpdateDescription } from './update-description';

/**
 * Optional dependencies passed to handlers that need them. Handlers that don't
 * need a given dep may ignore it. Missing deps for a handler that requires them
 * cause that handler to return an `Err` rather than crash the turn.
 *
 * - `ai`, `builderRepo`, `worldId`: required by `handleSearch` for generative discovery;
 *   `ai` also powers the buy/sell trade-consent calls.
 * - `playerId`: required by `handleMove` to enforce the combat-locked movement rule.
 */
export interface DispatchDeps {
  readonly ai?: GameAI | null;
  readonly builderRepo?: BuilderRepository;
  readonly worldId?: WorldId;
  readonly playerId?: AgentId;
  readonly view?: PerceptionView;
}

export async function dispatch(
  action: Action,
  repo: HandlerRepo,
  deps: DispatchDeps = {},
): Promise<Result<ActionOutcome, string>> {
  switch (action.kind) {
    case ActionKind.Move:
      return handleMove(action, repo, deps);
    case ActionKind.Look:
      return handleLook(action, repo, deps);
    case ActionKind.Take:
      return handleTake(action, repo, deps);
    case ActionKind.Drop:
      return handleDrop(action, repo);
    case ActionKind.Give:
      return handleGive(action, repo);
    case ActionKind.Inventory:
      return handleInventory(action, repo);
    case ActionKind.Speak:
      return handleSpeak(action, repo, deps);
    case ActionKind.Emote:
      return handleEmote(action, repo, deps);
    case ActionKind.Attack:
      return handleAttack(action, repo, deps);
    case ActionKind.UpdateDescription:
      return handleUpdateDescription(action, repo);
    case ActionKind.Search: {
      if (!deps.ai || !deps.builderRepo || !deps.worldId) {
        return Err('search requires ai and builderRepo');
      }
      return handleSearch(action, repo, {
        ai: deps.ai,
        builderRepo: deps.builderRepo,
        worldId: deps.worldId,
        ...(deps.view !== undefined ? { view: deps.view } : {}),
      });
    }
    case ActionKind.Equip:
      return handleEquip(action, repo, deps);
    case ActionKind.Unequip:
      return handleUnequip(action, repo, deps);
    case ActionKind.Open:
      return handleOpen(action, repo, deps);
    case ActionKind.Close:
      return handleClose(action, repo, deps);
    case ActionKind.Buy: {
      if (!deps.ai) return Err('buy requires ai');
      return handleBuy(action, repo, {
        ai: deps.ai,
        ...(deps.view !== undefined ? { view: deps.view } : {}),
      });
    }
    case ActionKind.Sell: {
      if (!deps.ai) return Err('sell requires ai');
      return handleSell(action, repo, {
        ai: deps.ai,
        ...(deps.view !== undefined ? { view: deps.view } : {}),
      });
    }
    case ActionKind.Offer:
      return handleOffer(action, repo, deps);
    case ActionKind.RevealItem:
      return handleRevealItem(action, repo);
  }
}
