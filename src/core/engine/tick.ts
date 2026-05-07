import type { Action } from '@core/domain/actions';
import type { Agent } from '@core/domain/entities';
import type { DomainEvent } from '@core/domain/events';
import type { AgentId } from '@core/domain/ids';
import { EventKind, NpcFallbackIntent } from '@core/domain/kinds';
import { dispatch } from './actions/registry';
import { MAX_CONSEQUENCE_DEPTH, consequencesFor } from './consequences';
import type { LanguageModel } from './language-model';
import { decideNpcIntent } from './npc-mind';
import { MAX_NPCS_PER_TICK, scheduleNpcs } from './npc-scheduler';
import type { ParseFn } from './parser/composite';
import type { Repository } from './repository';
import {
  renderDescriptionUpdatedObserved,
  renderDropObserved,
  renderLookObserved,
  renderMoveObserved,
  renderTakeObserved,
} from './templates';
import { runTurn } from './turn';

/**
 * The NPC mind's most common "I have nothing to do" output. We don't add a
 * `wait` action to the closed vocabulary just for this — instead the tick
 * orchestrator recognises a small set of phrasings as benign no-ops and skips
 * the runTurn call entirely. Any phrasing is matched after lowercasing and
 * stripping leading "i " / final ".".
 */
const NPC_WAIT_PHRASES: ReadonlySet<string> = new Set<string>([
  NpcFallbackIntent,
  'wait',
  'i wait',
  'do nothing',
  'i do nothing',
  'hold my ground',
  'i hold my ground',
  'watch',
  'i watch',
]);

const isWaitIntent = (intent: string): boolean => {
  const normalised = intent
    .trim()
    .toLowerCase()
    .replace(/[.!]+$/g, '')
    .replace(/^i /, 'i ')
    .trim();
  return NPC_WAIT_PHRASES.has(normalised) || NPC_WAIT_PHRASES.has(normalised.replace(/^i /, ''));
};

/**
 * Tick orchestrator: a single player turn followed by the consequence pass,
 * autonomous NPC turns, and a second consequence pass over the new NPC events
 * (abstract-design §5, §7, §9).
 *
 * Consequence passes:
 *   - depth 0 after the player turn (over events from the player turn);
 *   - depth 1 after the NPC loop (over the *new* NPC events only).
 * `MAX_CONSEQUENCE_DEPTH = 1` keeps the recursion bounded (§9, §12).
 *
 * Determinism: with a null LLM, both consequence passes return [] and tick
 * behaviour is identical to slice 4. The 171-test baseline is preserved.
 */

export interface TickResult {
  /** The player's render — what would have been returned before slice 4. */
  readonly render: string;
  /** Player-perspective lines describing NPC actions they witnessed this tick. */
  readonly witnessed: readonly string[];
  /** All events from this tick (player's + NPCs' + consequence-emitted), in order. */
  readonly events: readonly DomainEvent[];
}

export interface RunTickOptions {
  readonly parse: ParseFn;
  readonly llm: LanguageModel | null;
  /** Override the per-tick NPC cap. Defaults to MAX_NPCS_PER_TICK. */
  readonly npcCap?: number;
}

/**
 * Render a witnessed event from the player's perspective. Mechanical events
 * use observer-aware templates; narrated events use the per-witness narration
 * the Narrator already produced and persisted on the event.
 *
 * Returns `null` if the player did not witness the event.
 */
async function renderWitnessForPlayer(
  event: DomainEvent,
  playerId: AgentId,
  repo: Repository,
): Promise<string | null> {
  if (event.actorId === playerId) return null; // player's own action — already in `render`
  if (!event.witnesses.some((w) => w === playerId)) return null;

  const actor = await repo.getAgent(event.actorId);

  switch (event.kind) {
    case EventKind.Move:
      return renderMoveObserved(actor, event.direction);
    case EventKind.Take: {
      const item = await repo.getItem(event.itemId);
      return renderTakeObserved(actor, item);
    }
    case EventKind.Drop: {
      const item = await repo.getItem(event.itemId);
      return renderDropObserved(actor, item);
    }
    case EventKind.Look:
      return renderLookObserved(actor);
    case EventKind.Inventory:
      // Inventory checks are private — the player wouldn't notice.
      return null;
    case EventKind.Failed:
      // An NPC's failed parse / action is internal; surfacing it would leak
      // engine details into the player's transcript.
      return null;
    case EventKind.Speak:
    case EventKind.Attack:
      return event.narrations?.[playerId] ?? null;
    case EventKind.DescriptionUpdated:
      return renderDescriptionUpdatedObserved();
  }
}

/**
 * Run the consequence engine over a slice of newly-emitted events and apply
 * each returned action through the standard dispatch pipeline. Returns the
 * events emitted by those consequence actions (so the caller can fold them
 * into the running tick log and run a second pass at depth+1).
 */
async function runConsequencePass(
  events: readonly DomainEvent[],
  repo: Repository,
  llm: LanguageModel | null,
  depth: number,
): Promise<readonly DomainEvent[]> {
  if (depth > MAX_CONSEQUENCE_DEPTH) return [];
  const actions: readonly Action[] = await consequencesFor(events, repo, llm);
  const out: DomainEvent[] = [];
  for (const action of actions) {
    const r = await dispatch(action, repo);
    if (!r.ok) {
      console.warn(`[consequence] dispatch failed: ${r.error}`);
      continue;
    }
    out.push(r.value.event);
  }
  return out;
}

export async function runTick(
  playerId: AgentId,
  text: string,
  repo: Repository,
  opts: RunTickOptions,
): Promise<TickResult> {
  const { parse, llm } = opts;
  const cap = opts.npcCap ?? MAX_NPCS_PER_TICK;

  // 1. Player turn.
  const playerResult = await runTurn(playerId, text, repo, { parse, llm });
  const events: DomainEvent[] = [...playerResult.events];
  const witnessed: string[] = [];

  // 2. Consequence pass over the player's events (depth 0).
  const postPlayerConsequences = await runConsequencePass(playerResult.events, repo, llm, 0);
  for (const ev of postPlayerConsequences) {
    events.push(ev);
    const line = await renderWitnessForPlayer(ev, playerId, repo);
    if (line !== null && line.length > 0) witnessed.push(line);
  }

  // 3. Scheduler picks NPCs co-located with the player.
  const npcIds = await scheduleNpcs({ playerId, repo, cap });

  // 4. NPC ticks.
  const npcEvents: DomainEvent[] = [];
  for (const npcId of npcIds) {
    // Re-check eligibility just before acting: the player's action may have
    // moved/killed/relocated the NPC mid-tick.
    let npc: Agent;
    try {
      npc = await repo.getAgent(npcId);
    } catch {
      continue;
    }
    if (!npc.autonomous || npc.hp <= 0) continue;

    const intent = await decideNpcIntent(npcId, repo, llm);
    console.info(`[npc] ${npc.label} intent: "${intent}"`);

    if (isWaitIntent(intent)) {
      // Benign no-op — don't bother the parser, don't pollute the player's
      // transcript with "Spark waits."-style filler.
      continue;
    }

    const npcResult = await runTurn(npcId, intent, repo, { parse, llm });
    if (npcResult.events.length === 0) {
      // Intent didn't parse or dispatch failed. The reason is in npcResult.render
      // (a parse-error or action-error message). Surface it so the dev terminal
      // shows why the NPC produced nothing visible to the player.
      console.info(`[npc] ${npc.label} produced no event: ${npcResult.render}`);
    } else {
      for (const ev of npcResult.events) {
        console.info(`[npc] ${npc.label} -> ${ev.kind}`);
      }
    }
    for (const ev of npcResult.events) {
      events.push(ev);
      npcEvents.push(ev);
      const line = await renderWitnessForPlayer(ev, playerId, repo);
      if (line !== null && line.length > 0) witnessed.push(line);
    }
  }

  // 5. Consequence pass over the NPC events only (depth 1).
  const postNpcConsequences = await runConsequencePass(npcEvents, repo, llm, 1);
  for (const ev of postNpcConsequences) {
    events.push(ev);
    const line = await renderWitnessForPlayer(ev, playerId, repo);
    if (line !== null && line.length > 0) witnessed.push(line);
  }

  return {
    render: playerResult.render,
    witnessed,
    events,
  };
}
