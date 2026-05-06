import { NARRATED_EVENT_KINDS } from '@core/domain/events';
import type { DomainEvent } from '@core/domain/events';
import type { AgentId } from '@core/domain/ids';
import { OwnerKind } from '@core/domain/kinds';
import { dispatch } from './actions/registry';
import type { LanguageModel } from './language-model';
import { narrate } from './narrate';
import { parse as ruleParse } from './parser';
import type { ParseFn } from './parser/composite';
import { perceive } from './perception';
import type { Repository } from './repository';
import { renderActionError, renderParseError } from './templates';

export interface TurnResult {
  readonly render: string;
  readonly events: readonly DomainEvent[];
}

export interface RunTurnOptions {
  readonly parse?: ParseFn;
  readonly llm?: LanguageModel | null;
}

const defaultParse: ParseFn = async (text, actor, view, inventory) =>
  ruleParse(text, actor, view, inventory);

export async function runTurn(
  actorId: AgentId,
  text: string,
  repo: Repository,
  parseOrOptions: ParseFn | RunTurnOptions = defaultParse,
): Promise<TurnResult> {
  const opts: RunTurnOptions =
    typeof parseOrOptions === 'function' ? { parse: parseOrOptions } : parseOrOptions;
  const parse = opts.parse ?? defaultParse;
  const llm = opts.llm ?? null;

  const actor = await repo.getAgent(actorId);
  const view = await perceive(actorId, repo);
  const inventory = await repo.itemsOwnedBy({ kind: OwnerKind.Agent, id: actorId });

  const parsed = await parse(text, actor, view, inventory);
  if (!('actorId' in parsed)) {
    return { render: renderParseError(parsed), events: [] };
  }

  const r = await dispatch(parsed, repo);
  if (!r.ok) {
    return { render: renderActionError(r.error), events: [] };
  }

  const outcome = r.value;
  let event = outcome.event;
  let render = outcome.render;

  if (NARRATED_EVENT_KINDS.has(event.kind)) {
    // Narrated handlers do NOT persist their own event — runTurn enriches
    // it with per-witness narrations first, then persists.
    const narrations: Record<string, string> = {};
    for (const witnessId of event.witnesses) {
      const witness = await repo.getAgent(witnessId);
      const prose = await narrate(event, witness, repo, llm);
      narrations[witnessId] = prose;
    }
    event = { ...event, narrations } as DomainEvent;
    render = narrations[actorId] ?? render;
    await repo.appendEvent(event);
  }
  // Mechanical handlers already called repo.appendEvent themselves.

  return { render, events: [event] };
}
