import type { Action } from '@core/domain/actions';
import type { Agent, Item } from '@core/domain/entities';
import { ActionKind } from '@core/domain/kinds';
import type { LanguageModel } from './language-model';
import {
  PLAYER_ACTION_SCHEMA,
  PLAYER_ACTION_SCHEMA_NAME,
  validatePlayerAction,
} from './llm-output';
import { buildSystemPrompt, buildUserPrompt } from './llm-prompt';
import { resolveAgent, resolveItem } from './parser';
import type { PerceptionView } from './perception';

export async function llmInterpret(
  text: string,
  actor: Agent,
  view: PerceptionView,
  inventory: readonly Item[],
  llm: LanguageModel,
): Promise<Action | null> {
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
      if (validated.targetRef === null) {
        return { kind: ActionKind.Look, actorId: actor.id, targetItemId: null };
      }
      const r = resolveItem(validated.targetRef, [...view.items, ...inventory]);
      if (!r.ok) return null;
      return { kind: ActionKind.Look, actorId: actor.id, targetItemId: r.item.id };
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
    case ActionKind.Inventory:
      return { kind: ActionKind.Inventory, actorId: actor.id };
    case ActionKind.Speak: {
      const r = resolveAgent(validated.targetAgentRef, view.agents);
      if (!r.ok) return null;
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
    case 'unknown':
    case 'invalid':
      return null;
  }
}
