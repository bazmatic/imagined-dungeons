import type { Action } from '@core/domain/actions';
import type { Agent } from '@core/domain/entities';
import type { DomainEvent } from '@core/domain/events';
import { type AgentId, SYSTEM_AGENT_ID } from '@core/domain/ids';
import { EventKind, NpcFallbackIntent, OwnerKind } from '@core/domain/kinds';
import { dispatch } from './actions/registry';
import { MAX_CONSEQUENCE_DEPTH, consequencesFor } from './consequences';
import type { LanguageModel } from './language-model';
import { decideNpcIntent } from './npc-mind';
import { MAX_NPCS_PER_TICK, scheduleNpcs } from './npc-scheduler';
import type { ParseFn } from './parser/composite';
import { perceive } from './perception';
import type { Repository } from './repository';
import {
  renderAgentStateUpdatedObserved,
  renderDescriptionUpdatedObserved,
  renderDropObserved,
  renderLook,
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
    case EventKind.Emote:
    case EventKind.Attack:
      return event.narrations?.[playerId] ?? null;
    case EventKind.DescriptionUpdated: {
      const descriptionChanged =
        event.shortBefore !== event.shortAfter || event.longBefore !== event.longAfter;
      const moodChanged = event.moodBefore !== event.moodAfter;
      const intentChanged = event.shortTermIntentBefore !== event.shortTermIntentAfter;
      // Description changes are the broad "world shifts" line.
      if (descriptionChanged) return renderDescriptionUpdatedObserved();
      // Otherwise — for an agent target — a mood-only change is a subtle
      // visible cue keyed on the *target* (whose mood changed), not the actor
      // (which is the synthetic system agent for consequence-emitted events).
      // Suppress entirely if:
      //   - the target is the system agent (bookkeeping; never narrate),
      //   - the target IS the player (telling the player "your expression
      //     shifts" reads weirdly in third person, and second-person would
      //     leak the supposedly-private mood change anyway).
      if (event.target.kind === OwnerKind.Agent && moodChanged) {
        if (event.target.id === SYSTEM_AGENT_ID) return null;
        if (event.target.id === playerId) return null;
        try {
          const targetAgent = await repo.getAgent(event.target.id);
          return renderAgentStateUpdatedObserved(targetAgent);
        } catch {
          return null;
        }
      }
      if (intentChanged) return null;
      return null;
    }
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

  // 1. Player turn — but a "wait" intent is treated symmetrically with NPC
  //    waits: the orchestrator emits no event, no error, and skips the
  //    consequence pass over a non-existent player turn. NPCs still tick, so
  //    the player can deliberately let time pass to see what happens.
  const events: DomainEvent[] = [];
  const witnessed: string[] = [];
  let playerRender: string;

  if (isWaitIntent(text)) {
    playerRender = 'You wait.';
  } else {
    const playerResult = await runTurn(playerId, text, repo, { parse, llm });
    playerRender = playerResult.render;
    events.push(...playerResult.events);

    // After a successful move, follow up with a full room overview so the
    // player gets the same orientation a `look` would print. Mirrors what
    // most parser-IFs do; matches the data the sidebar refreshes with.
    if (playerResult.events.some((e) => e.kind === EventKind.Move)) {
      const view = await perceive(playerId, repo);
      playerRender = `${playerRender}\n\n${renderLook(view)}`;
    }

    // 2. Consequence pass over the player's events (depth 0).
    const postPlayerConsequences = await runConsequencePass(playerResult.events, repo, llm, 0);
    for (const ev of postPlayerConsequences) {
      events.push(ev);
      const line = await renderWitnessForPlayer(ev, playerId, repo);
      if (line !== null && line.length > 0) witnessed.push(line);
    }
  }

  // 3. Scheduler picks NPCs co-located with the player.
  const npcIds = await scheduleNpcs({ playerId, repo, cap });
  if (npcIds.length === 0) {
    console.info('[scheduler] no NPCs eligible this tick');
  } else {
    console.info(`[scheduler] eligible: ${npcIds.join(', ')}`);
  }

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
    render: playerRender,
    witnessed,
    events,
  };
}
