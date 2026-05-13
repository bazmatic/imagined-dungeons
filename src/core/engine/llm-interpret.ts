import type { Action, ParseError } from '@core/domain/actions';
import type { Agent, Item } from '@core/domain/entities';
import { ActionKind, ExaminableKind, ParseErrorKind } from '@core/domain/kinds';
import type { LanguageModel } from './language-model';
import {
  PLAYER_ACTION_SCHEMA,
  PLAYER_ACTION_SCHEMA_NAME,
  validatePlayerAction,
} from './llm-output';
import { buildSystemPrompt, buildUserPrompt } from './llm-prompt';
import { resolveAgent, resolveExit, resolveItem } from './parser';
import type { PerceptionView } from './perception';

/**
 * Result of the LLM intent interpreter:
 *
 * - `Action`         — a valid action the engine can dispatch.
 * - `ParseError`     — the LLM judged the action impossible / inappropriate
 *                      and carries a reason. Surfaced to the player as a
 *                      failed event ('You can't fly without wings.').
 * - `null`           — the LLM could not map the input at all. The caller
 *                      (composite parser) falls back to the rule-parser's
 *                      error.
 */
export async function llmInterpret(
  text: string,
  actor: Agent,
  view: PerceptionView,
  inventory: readonly Item[],
  llm: LanguageModel,
): Promise<Action | ParseError | null> {
  const response = await llm.complete({
    system: buildSystemPrompt(),
    user: buildUserPrompt(text, actor, view, inventory),
    schema: PLAYER_ACTION_SCHEMA,
    schemaName: PLAYER_ACTION_SCHEMA_NAME,
  });
  const validated = validatePlayerAction(response.parsed);
  switch (validated.kind) {
    case ActionKind.Move:
      return { kind: ActionKind.Move, actorId: actor.id, direction: validated.direction };
    case ActionKind.Look: {
      const t = validated.target;
      if (t.kind === ExaminableKind.Room) {
        return {
          kind: ActionKind.Look,
          actorId: actor.id,
          target: { kind: ExaminableKind.Room },
        };
      }
      if (t.kind === ExaminableKind.Item) {
        const r = resolveItem(t.ref, [...view.items, ...inventory]);
        if (!r.ok) return null;
        return {
          kind: ActionKind.Look,
          actorId: actor.id,
          target: { kind: ExaminableKind.Item, id: r.item.id },
        };
      }
      if (t.kind === ExaminableKind.Agent) {
        const r = resolveAgent(t.ref, view.agents);
        if (!r.ok) return null;
        return {
          kind: ActionKind.Look,
          actorId: actor.id,
          target: { kind: ExaminableKind.Agent, id: r.agent.id },
        };
      }
      // Exit
      const r = resolveExit(t.ref, view.exits);
      if (!r.ok) return null;
      return {
        kind: ActionKind.Look,
        actorId: actor.id,
        target: { kind: ExaminableKind.Exit, id: r.exit.id },
      };
    }
    case ActionKind.Take: {
      const r = resolveItem(validated.itemRef, view.items);
      if (!r.ok) return null;
      return { kind: ActionKind.Take, actorId: actor.id, itemId: r.item.id };
    }
    case ActionKind.Drop: {
      const r = resolveItem(validated.itemRef, inventory);
      if (!r.ok) return null;
      return { kind: ActionKind.Drop, actorId: actor.id, itemId: r.item.id };
    }
    case ActionKind.Give: {
      const itemR = resolveItem(validated.itemRef, inventory);
      if (!itemR.ok) return null;
      const agentR = resolveAgent(validated.targetAgentRef, view.agents);
      if (!agentR.ok) return null;
      return {
        kind: ActionKind.Give,
        actorId: actor.id,
        itemId: itemR.item.id,
        targetAgentId: agentR.agent.id,
      };
    }
    case ActionKind.Inventory:
      return { kind: ActionKind.Inventory, actorId: actor.id };
    case ActionKind.Speak: {
      if (validated.targetAgentRef === null) {
        return {
          kind: ActionKind.Speak,
          actorId: actor.id,
          targetAgentId: null,
          utterance: validated.utterance,
        };
      }
      const r = resolveAgent(validated.targetAgentRef, view.agents);
      if (!r.ok) {
        // Couldn't resolve the named addressee — broadcast instead. The
        // listener mind will judge whether the utterance was meant for them.
        return {
          kind: ActionKind.Speak,
          actorId: actor.id,
          targetAgentId: null,
          utterance: validated.utterance,
        };
      }
      return {
        kind: ActionKind.Speak,
        actorId: actor.id,
        targetAgentId: r.agent.id,
        utterance: validated.utterance,
      };
    }
    case ActionKind.Attack: {
      const r = resolveAgent(validated.targetAgentRef, view.agents);
      if (!r.ok) return null;
      return { kind: ActionKind.Attack, actorId: actor.id, targetAgentId: r.agent.id };
    }
    case ActionKind.Emote: {
      if (validated.targetAgentRef === null) {
        return {
          kind: ActionKind.Emote,
          actorId: actor.id,
          description: validated.emoteDescription,
          targetAgentId: null,
        };
      }
      const r = resolveAgent(validated.targetAgentRef, view.agents);
      if (!r.ok) return null;
      return {
        kind: ActionKind.Emote,
        actorId: actor.id,
        description: validated.emoteDescription,
        targetAgentId: r.agent.id,
      };
    }
    case ActionKind.Search:
      return { kind: ActionKind.Search, actorId: actor.id, query: validated.query };
    case ActionKind.Equip: {
      const r = resolveItem(validated.itemRef, inventory);
      if (!r.ok) return null;
      return {
        kind: ActionKind.Equip,
        actorId: actor.id,
        itemId: r.item.id,
        manner: validated.manner,
      };
    }
    case ActionKind.Unequip: {
      const r = resolveItem(validated.itemRef, inventory);
      if (!r.ok) return null;
      return {
        kind: ActionKind.Unequip,
        actorId: actor.id,
        itemId: r.item.id,
        manner: validated.manner,
      };
    }
    case ActionKind.Open: {
      const r = resolveItem(validated.itemRef, [...view.items, ...inventory]);
      if (!r.ok) return null;
      return { kind: ActionKind.Open, actorId: actor.id, itemId: r.item.id };
    }
    case ActionKind.Close: {
      const r = resolveItem(validated.itemRef, [...view.items, ...inventory]);
      if (!r.ok) return null;
      return { kind: ActionKind.Close, actorId: actor.id, itemId: r.item.id };
    }
    case 'impossible':
      return { kind: ParseErrorKind.ImpossibleAction, reason: validated.reason };
    case 'unknown':
    case 'invalid':
      return null;
  }
}
