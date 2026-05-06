import type { DomainEvent } from '@core/domain/events';
import type { AgentId } from '@core/domain/ids';
import { dispatch } from './actions/registry';
import { parse as ruleParse } from './parser';
import type { ParseFn } from './parser/composite';
import { perceive } from './perception';
import type { Repository } from './repository';
import { renderActionError, renderParseError } from './templates';

export interface TurnResult {
  readonly render: string;
  readonly events: readonly DomainEvent[];
}

const defaultParse: ParseFn = async (text, actor, view, inventory) =>
  ruleParse(text, actor, view, inventory);

export async function runTurn(
  actorId: AgentId,
  text: string,
  repo: Repository,
  parse: ParseFn = defaultParse,
): Promise<TurnResult> {
  const actor = await repo.getAgent(actorId);
  const view = await perceive(actorId, repo);
  const inventory = await repo.itemsOwnedBy({ kind: 'agent', id: actorId });

  const parsed = await parse(text, actor, view, inventory);
  if (!('actorId' in parsed)) {
    return { render: renderParseError(parsed), events: [] };
  }

  const r = await dispatch(parsed, repo);
  if (!r.ok) {
    return { render: renderActionError(r.error), events: [] };
  }
  return { render: r.value.render, events: [r.value.event] };
}
