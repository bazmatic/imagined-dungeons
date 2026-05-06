import type { Action } from '@core/domain/actions';
import type { Agent, Item } from '@core/domain/entities';
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
    case 'move':
      return { kind: 'move', actorId: actor.id, direction: validated.direction };
    case 'look': {
      if (validated.targetRef === null) {
        return { kind: 'look', actorId: actor.id, targetItemId: null };
      }
      const r = resolveItem(validated.targetRef, [...view.items, ...inventory]);
      if (!r.ok) return null;
      return { kind: 'look', actorId: actor.id, targetItemId: r.item.id };
    }
    case 'take': {
      const r = resolveItem(validated.itemRef, view.items);
      if (!r.ok) return null;
      return { kind: 'take', actorId: actor.id, itemId: r.item.id };
    }
    case 'drop': {
      const r = resolveItem(validated.itemRef, inventory);
      if (!r.ok) return null;
      return { kind: 'drop', actorId: actor.id, itemId: r.item.id };
    }
    case 'inventory':
      return { kind: 'inventory', actorId: actor.id };
    case 'speak': {
      const r = resolveAgent(validated.targetAgentRef, view.agents);
      if (!r.ok) return null;
      return {
        kind: 'speak',
        actorId: actor.id,
        targetAgentId: r.agent.id,
        utterance: validated.utterance,
      };
    }
    case 'attack': {
      const r = resolveAgent(validated.targetAgentRef, view.agents);
      if (!r.ok) return null;
      return { kind: 'attack', actorId: actor.id, targetAgentId: r.agent.id };
    }
    case 'unknown':
    case 'invalid':
      return null;
  }
}
