import type { BuilderRepository } from '@core/builder/repository';
import { NARRATED_EVENT_KINDS } from '@core/domain/events';
import type { DomainEvent } from '@core/domain/events';
import type { AgentId } from '@core/domain/ids';
import {
  ActionKind,
  EventKind,
  ExaminableKind,
  OwnerKind,
  ParseErrorKind,
} from '@core/domain/kinds';
import { dispatch } from './actions/registry';
import { nextEventId } from './ids-gen';
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

/**
 * Mutable counter shared across a tick — `runTick` constructs one and passes
 * it to each `runTurn`. `runTurn` decrements before calling the discovery
 * LLM (either via the `search` action or the failed-look fall-through). When
 * `remaining` hits zero, discovery is skipped and the turn falls back to the
 * normal mechanical path (search emits a stock narration; failed-look emits
 * the standard parse-error).
 */
export interface DiscoveryBudget {
  remaining: number;
}

export interface RunTurnOptions {
  readonly parse?: ParseFn;
  readonly llm?: LanguageModel | null;
  readonly builderRepo?: BuilderRepository;
  readonly discoveryBudget?: DiscoveryBudget;
}

const defaultParse: ParseFn = async (text, actor, view, inventory) =>
  ruleParse(text, actor, view, inventory);

/**
 * Verbs that, when they produce a `no_such_target` parse error, are eligible
 * for generative-discovery fall-through. Kept in sync with the parser's
 * `look` case — adding an alias there should add it here too.
 */
const LOOK_VERBS: ReadonlySet<string> = new Set(['look', 'l']);

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
    // Failed-look fall-through: a `look <unknown>` parse error reroutes to
    // generative discovery instead of surfacing the parse error — so the
    // player sees a flavour line (or a freshly-spawned entity) rather than
    // "you don't see one here". Requires both an llm and a builderRepo;
    // honours the per-tick discovery budget when supplied.
    if (
      parsed.kind === ParseErrorKind.NoSuchTarget &&
      parsed.verb !== undefined &&
      LOOK_VERBS.has(parsed.verb) &&
      llm &&
      opts.builderRepo
    ) {
      const budget = opts.discoveryBudget;
      if (!budget || budget.remaining > 0) {
        if (budget) budget.remaining -= 1;
        const worldId = await repo.getWorldId();
        const searchResult = await dispatch(
          { kind: ActionKind.Search, actorId, query: parsed.ref },
          repo,
          { llm, worldId, builderRepo: opts.builderRepo },
        );
        if (searchResult.ok) {
          return { render: searchResult.value.render, events: [searchResult.value.event] };
        }
      }
    }
    const reason = renderParseError(parsed);
    const failed: DomainEvent = {
      id: nextEventId(),
      worldId: await repo.getWorldId(),
      actorId,
      witnesses: [actorId],
      createdAt: new Date(),
      kind: 'failed',
      attempted: text,
      reason,
    };
    await repo.appendEvent(failed);
    return { render: reason, events: [failed] };
  }

  const worldId = await repo.getWorldId();

  // Per-tick discovery budget gates the `search` verb the same way it gates
  // the failed-look fall-through above. When exhausted, emit a stock
  // "nothing of note" Look event (no LLM call) instead of dispatching.
  if (parsed.kind === ActionKind.Search) {
    const budget = opts.discoveryBudget;
    if (budget && budget.remaining <= 0) {
      const event: DomainEvent = {
        id: nextEventId(),
        worldId,
        actorId,
        witnesses: [actorId],
        createdAt: new Date(),
        kind: EventKind.Look,
        locationId: view.location.id,
        target: { kind: ExaminableKind.Room },
      };
      await repo.appendEvent(event);
      return { render: 'You find nothing of note.', events: [event] };
    }
    if (budget) budget.remaining -= 1;
  }

  const r = await dispatch(
    parsed,
    repo,
    opts.builderRepo ? { llm, worldId, builderRepo: opts.builderRepo } : { llm, worldId },
  );
  if (!r.ok) {
    const reason = renderActionError(r.error);
    const failed: DomainEvent = {
      id: nextEventId(),
      worldId: await repo.getWorldId(),
      actorId,
      witnesses: [actorId],
      createdAt: new Date(),
      kind: 'failed',
      attempted: text,
      reason,
    };
    await repo.appendEvent(failed);
    return { render: reason, events: [failed] };
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
