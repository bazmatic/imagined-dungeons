import type { Action } from '@core/domain/actions';
import type { Agent, Item } from '@core/domain/entities';
import type { LanguageModel } from './language-model';
import {
  PLAYER_ACTION_SCHEMA,
  PLAYER_ACTION_SCHEMA_NAME,
  validatePlayerAction,
} from './llm-output';
import { buildSystemPrompt, buildUserPrompt } from './llm-prompt';
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
    case 'look':
      return { kind: 'look', actorId: actor.id, targetRef: validated.targetRef };
    case 'take':
      return { kind: 'take', actorId: actor.id, itemRef: validated.itemRef };
    case 'drop':
      return { kind: 'drop', actorId: actor.id, itemRef: validated.itemRef };
    case 'inventory':
      return { kind: 'inventory', actorId: actor.id };
    case 'unknown':
    case 'invalid':
      return null;
  }
}
