import type { Agent } from '@core/domain/entities';
import type { DomainEvent } from '@core/domain/events';
import type { AgentId } from '@core/domain/ids';
import { EventKind, NpcFallbackIntent } from '@core/domain/kinds';
import type { LanguageModel } from './language-model';
import { decideNpcIntent } from './npc-mind';
import { MAX_NPCS_PER_TICK, scheduleNpcs } from './npc-scheduler';
import type { ParseFn } from './parser/composite';
import type { Repository } from './repository';
import {
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
 * Tick orchestrator: a single player turn followed by zero or more autonomous
 * NPC turns (abstract-design §5, §7).
 *
 * Flow:
 *   1. Run the player's command through `runTurn` exactly as before.
 *   2. Use the NPC scheduler to pick co-located autonomous NPCs (capped).
 *   3. For each chosen NPC: ask the NPC mind for an intent string, then feed
 *      that string through the *same* `runTurn` machinery — same composite
 *      parser, same closed action vocabulary, same validation.
 *   4. Aggregate witnessed prose: the player gets a list of one-line
 *      descriptions of NPC actions they could perceive.
 *
 * Determinism: the scheduler is deterministic; the only nondeterministic
 * source is the LLM. With a null LLM, NPCs produce the fallback intent
 * ("wait") which the parser rejects as an unknown verb — i.e. they do nothing.
 */

export interface TickResult {
  /** The player's render — what would have been returned before slice 4. */
  readonly render: string;
  /** Player-perspective lines describing NPC actions they witnessed this tick. */
  readonly witnessed: readonly string[];
  /** All events from this tick (player's + NPCs'), in order. */
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
  }
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

  // 2. Scheduler picks NPCs co-located with the player.
  const npcIds = await scheduleNpcs({ playerId, repo, cap });

  // 3. NPC ticks.
  const witnessed: string[] = [];
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
      const line = await renderWitnessForPlayer(ev, playerId, repo);
      if (line !== null && line.length > 0) witnessed.push(line);
    }
  }

  return {
    render: playerResult.render,
    witnessed,
    events,
  };
}
