import type { BuilderRepository } from '@core/builder/repository';
import type { Action } from '@core/domain/actions';
import type { Agent } from '@core/domain/entities';
import type { DomainEvent } from '@core/domain/events';
import { type AgentId, type LocationId, SYSTEM_AGENT_ID, type WorldId } from '@core/domain/ids';
import { EventKind, ExaminableKind, NpcFallbackIntent, OwnerKind } from '@core/domain/kinds';
import { type Segment, SegmentKind } from '@core/domain/segments';
import { log } from '@core/log';
import { generateSpawnNarration } from '@core/spawning/narration';
import { runSpawnTickPass } from '@core/spawning/tick-pass';
import type { PerceptionView } from '@core/spawning/triggers';
import { dispatch } from './actions/registry';
import { type ConsequenceLoreSink, MAX_CONSEQUENCE_DEPTH } from './consequences';
import type { GameAI } from './game-ai';
import type { LanguageModel } from './language-model';
import type { NpcDecisionRepository } from './npc-decision-repository';
import { TickChunkKind, type NpcTurnChunk, type PlayerTurnChunk } from './tick-stream-types';
import { MAX_NPCS_PER_TICK, scheduleNpcs } from './npc-scheduler';
import type { ParseFn } from './parser/composite';
import { perceive } from './perception';
import type { Repository } from './repository';
import {
  renderAgentSpawnedObserved,
  renderAgentStateUpdatedObserved,
  renderCloseObserved,
  renderDropObserved,
  renderEquipObserved,
  renderGiveByActor,
  renderGiveObserved,
  renderLook,
  renderLookObserved,
  renderMoveObserved,
  renderOpenObserved,
  renderRevealObserved,
  renderTakeObserved,
  renderTradeObserved,
  renderUnequipObserved,
} from './templates';
import { type DiscoveryBudget, runTurn } from './turn';

/**
 * Per-tick cap on generative-discovery LLM calls. The discovery LLM is
 * shared by the explicit `search` verb and the failed-look fall-through;
 * a single tick can trigger at most this many calls in total (across all
 * actors that ticked). Beyond the cap the engine falls back to its
 * deterministic path — search emits "You find nothing of note.", failed
 * look surfaces the normal parse error.
 */
export const MAX_DISCOVERY_CALLS_PER_TICK = 1;

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

const isWaitIntention = (intent: string): boolean => {
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
  readonly render: readonly Segment[];
  /** Player-perspective lines describing NPC actions they witnessed this tick. */
  readonly witnessed: readonly string[];
  /** All events from this tick (player's + NPCs' + consequence-emitted), in order. */
  readonly events: readonly DomainEvent[];
}

export interface RunTickOptions {
  readonly parse: ParseFn;
  readonly ai: GameAI | null;
  /**
   * Raw LLM for the spawn subsystem (LLM-judgement spawn triggers and spawn
   * arrival narration). Separate from `ai` because the spawn system hasn't
   * been integrated into the GameAI boundary yet.
   */
  readonly llm?: LanguageModel | null;
  /** Override the per-tick NPC cap. Defaults to MAX_NPCS_PER_TICK. */
  readonly npcCap?: number;
  /**
   * Optional builder repository — when present, the tick runs the
   * monster-templates spawn pass after consequences. When absent (e.g.
   * legacy callers, narrow tests) the spawn pass is skipped entirely.
   */
  readonly builderRepo?: BuilderRepository;
  /**
   * Optional streaming callback. Called once with a PlayerTurnChunk after the
   * player's turn completes, then once per NPC that produces at least one
   * witnessed event this tick.
   */
  readonly onChunk?: (chunk: PlayerTurnChunk | NpcTurnChunk) => void;
  readonly decisionRepo?: NpcDecisionRepository | null;
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
  if (event.actorId === SYSTEM_AGENT_ID) return null; // synthetic; never narrate as a witnessed actor
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
    case EventKind.Give: {
      const item = await repo.getItem(event.itemId);
      const recipient = await repo.getAgent(event.targetAgentId);
      // The recipient gets a second-person line; everyone else (including
      // the player as a bystander) gets the third-person observed line.
      if (event.targetAgentId === playerId) return renderGiveByActor(actor, item);
      return renderGiveObserved(actor, item, recipient);
    }
    case EventKind.Look: {
      let targetPhrase: string | null = null;
      if (event.target.kind === ExaminableKind.Item) {
        try {
          const item = await repo.getItem(event.target.id);
          targetPhrase = `the ${item.label}`;
        } catch { /* target no longer accessible; fall through to "looks around" */ }
      } else if (event.target.kind === ExaminableKind.Agent) {
        try {
          const target = await repo.getAgent(event.target.id);
          targetPhrase = target.label;
        } catch { /* fall through */ }
      } else if (event.target.kind === ExaminableKind.Exit) {
        try {
          const exit = await repo.getExit(event.target.id);
          targetPhrase = `the ${exit.label !== exit.direction ? exit.label : `${exit.direction} exit`}`;
        } catch { /* fall through */ }
      }
      return renderLookObserved(actor, targetPhrase);
    }
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
      if (descriptionChanged) return null;
      // For an agent target, surface the mood change as a visible expression
      // cue keyed on the *target* (whose mood changed), not the actor
      // (which is the synthetic system agent for consequence-emitted events).
      // Suppress entirely if:
      //   - the target is the system agent (bookkeeping; never narrate),
      //   - the target IS the player (second-person reads weirdly here).
      if (event.target.kind === OwnerKind.Agent && moodChanged) {
        if (event.target.id === SYSTEM_AGENT_ID) return null;
        if (event.target.id === playerId) return null;
        try {
          const targetAgent = await repo.getAgent(event.target.id);
          return renderAgentStateUpdatedObserved(targetAgent, event.moodAfter);
        } catch {
          return null;
        }
      }
      if (intentChanged) return null;
      return null;
    }
    case EventKind.Equip: {
      try {
        const item = await repo.getItem(event.itemId);
        return renderEquipObserved(actor, item, event.manner);
      } catch {
        return null;
      }
    }
    case EventKind.Unequip: {
      try {
        const item = await repo.getItem(event.itemId);
        return renderUnequipObserved(actor, item, event.manner);
      } catch {
        return null;
      }
    }
    case EventKind.Reveal: {
      try {
        const item = await repo.getItem(event.itemId);
        return renderRevealObserved(item);
      } catch {
        return null;
      }
    }
    case EventKind.Open: {
      try {
        const item = await repo.getItem(event.itemId);
        return renderOpenObserved(actor, item);
      } catch {
        return null;
      }
    }
    case EventKind.Close: {
      try {
        const item = await repo.getItem(event.itemId);
        return renderCloseObserved(actor, item);
      } catch {
        return null;
      }
    }
    case EventKind.Trade: {
      try {
        const buyer = await repo.getAgent(event.buyerId);
        const seller = await repo.getAgent(event.sellerId);
        const item = await repo.getItem(event.itemId);
        return renderTradeObserved(buyer, seller, item, event.price, event.accepted);
      } catch {
        return null;
      }
    }
    case EventKind.Death: {
      try {
        const target = await repo.getAgent(event.targetAgentId);
        const actor = await repo.getAgent(event.actorId);
        return `${actor.label} slays ${target.label}.`;
      } catch {
        return null;
      }
    }
  }
}

/**
 * Build a `PerceptionView` for the spawn pass: every agent's current
 * location and (for v1) an empty item-template-keys map. Items
 * carrying a template-key concept are out of scope for v1; passing an
 * empty map means `ItemTaken` triggers without a `itemTemplateKey`
 * filter still match by location alone, which is the only behaviour
 * the validator allows in v1.
 */
async function buildPerceptionView(
  playerId: AgentId,
  repo: Repository,
): Promise<{ readonly view: PerceptionView; readonly worldId: WorldId }> {
  const all = await repo.allAgents();
  const agentLocations = new Map<AgentId, LocationId>();
  for (const a of all) agentLocations.set(a.id, a.locationId);
  const player = await repo.getAgent(playerId);
  return {
    view: {
      agentLocations,
      itemTemplateKeys: new Map(),
      playerId,
    },
    worldId: player.worldId,
  };
}

/**
 * Event kinds that, when they happen in an NPC's location, are noteworthy
 * enough to wake them: someone enters or leaves, someone speaks/emotes/
 * attacks, someone picks up or drops an item. Look/inventory/failed/
 * description-updated are excluded — they are either private to the actor
 * or internal bookkeeping.
 */
const WAKING_EVENT_KINDS: ReadonlySet<DomainEvent['kind']> = new Set<DomainEvent['kind']>([
  EventKind.Move,
  EventKind.Take,
  EventKind.Drop,
  EventKind.Give,
  EventKind.Speak,
  EventKind.Attack,
  EventKind.Emote,
  EventKind.Death,
]);

/**
 * Wake any dormant NPCs whose attention these events should draw. An NPC is
 * woken when something noteworthy happens in their presence — a witness
 * relation is enough. The scheduler then picks them up alongside the
 * always-on autonomous agents.
 *
 * Sleeping is handled separately by sleepFinishedNpcs after the tick: an
 * NPC who is awake-not-autonomous and whose shortTermIntent has cleared is
 * considered "done" and goes back to sleep.
 */
async function wakeWitnessingNpcs(events: readonly DomainEvent[], repo: Repository): Promise<void> {
  const wakeIds = new Set<AgentId>();
  for (const e of events) {
    if (!WAKING_EVENT_KINDS.has(e.kind)) continue;
    for (const witnessId of e.witnesses) {
      if (witnessId === e.actorId) continue;
      // Departures don't wake dormant NPCs — only arrivals do. A witness at
      // the source location saw someone leave; a witness at the destination
      // saw someone arrive. Only the latter is noteworthy enough to rouse.
      if (e.kind === EventKind.Move) {
        try {
          const w = await repo.getAgent(witnessId);
          if (w.locationId !== e.to) continue;
        } catch {
          continue;
        }
      }
      wakeIds.add(witnessId);
    }
  }
  for (const id of wakeIds) {
    try {
      const a = await repo.getAgent(id);
      if (!a.autonomous && !a.awake && a.hp > 0) {
        await repo.setAgentAwake(id, true);
        // No intent is seeded here — the agent owns their own intent. They
        // get one tick to set one; if they don't, the sleep sweep dismisses
        // them at end-of-tick.
        log.info(`[wake] ${a.label} woken by witnessed event`);
      }
    } catch {
      // skip
    }
  }
}

/**
 * Sleep any NPC who was woken (awake && !autonomous) but no longer has a
 * short-term intent — they've finished what drew them in. Autonomous agents
 * are never slept here; their `awake` flag is incidental.
 *
 * Critically, only NPCs who actually ticked this turn are eligible for the
 * sweep. An NPC woken by another NPC's event during this same turn (e.g.
 * Spark says "Captain, I have your map" → Serena wakes) hasn't had a chance
 * to declare an intent yet; sleeping them immediately would dismiss them
 * before they ever act. They get next turn.
 */
async function sleepFinishedNpcs(
  repo: Repository,
  playerId: AgentId,
  tickedIds: ReadonlySet<AgentId>,
): Promise<void> {
  const player = await repo.getAgent(playerId);
  const here = await repo.agentsAt(player.locationId);
  for (const a of here) {
    if (a.id === playerId) continue;
    if (a.autonomous) continue;
    if (!a.awake) continue;
    if (!tickedIds.has(a.id)) continue;
    if (a.shortTermIntent !== null) continue;
    await repo.setAgentAwake(a.id, false);
    log.info(`[sleep] ${a.label} returned to dormant (intent fulfilled)`);
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
  ai: GameAI | null,
  depth: number,
  lore: ConsequenceLoreSink | undefined,
): Promise<readonly DomainEvent[]> {
  if (depth > MAX_CONSEQUENCE_DEPTH) return [];
  const actions: readonly Action[] = ai ? await ai.consequences(events, repo, lore) : [];
  const out: DomainEvent[] = [];
  for (const action of actions) {
    const r = await dispatch(action, repo);
    if (!r.ok) {
      log.warn(`[consequence] dispatch failed: ${r.error}`);
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
  await repo.incrementTickCount();

  const { parse, ai, llm } = opts;
  const cap = opts.npcCap ?? MAX_NPCS_PER_TICK;
  // A single shared counter across the whole tick — search/failed-look from
  // the player turn or any NPC turn all draw from the same pool.
  const discoveryBudget: DiscoveryBudget = { remaining: MAX_DISCOVERY_CALLS_PER_TICK };

  // The consequence engine writes durable lore (storySoFar) through the
  // builder port. Only available when the caller supplied a builderRepo;
  // legacy callers that omit it get the engine-only behaviour.
  let loreSink: ConsequenceLoreSink | undefined;
  if (opts.builderRepo) {
    try {
      const player = await repo.getAgent(playerId);
      loreSink = { builderRepo: opts.builderRepo, worldId: player.worldId };
    } catch {
      loreSink = undefined;
    }
  }

  // 1. Player turn — but a "wait" intent is treated symmetrically with NPC
  //    waits: the orchestrator emits no event, no error, and skips the
  //    consequence pass over a non-existent player turn. NPCs still tick, so
  //    the player can deliberately let time pass to see what happens.
  const events: DomainEvent[] = [];
  const witnessed: string[] = [];
  let playerRender: readonly Segment[];

  if (isWaitIntention(text)) {
    playerRender = [{ kind: SegmentKind.Feedback, text: 'You wait.' }];
  } else {
    const playerResult = await runTurn(playerId, text, repo, {
      parse,
      ai,
      discoveryBudget,
      playerId,
      ...(opts.builderRepo ? { builderRepo: opts.builderRepo } : {}),
    });
    playerRender = playerResult.render;
    events.push(...playerResult.events);

    // After a successful move, follow up with a full room overview so the
    // player gets the same orientation a `look` would print. Mirrors what
    // most parser-IFs do; matches the data the sidebar refreshes with.
    if (playerResult.events.some((e) => e.kind === EventKind.Move)) {
      const view = await perceive(playerId, repo);
      playerRender = [...playerResult.render, ...renderLook(view)];
    }

    // Wake any dormant NPCs whose attention the player just drew, so the
    // scheduler picks them up this same tick.
    await wakeWitnessingNpcs(playerResult.events, repo);

    // 2. Consequence pass over the player's events (depth 0).
    const postPlayerConsequences = await runConsequencePass(
      playerResult.events,
      repo,
      ai,
      0,
      loreSink,
    );
    for (const ev of postPlayerConsequences) {
      events.push(ev);
      const line = await renderWitnessForPlayer(ev, playerId, repo);
      if (line !== null && line.length > 0) witnessed.push(line);
    }
  }

  opts.onChunk?.({
    kind: TickChunkKind.PlayerTurn,
    render: playerRender,
    witnessed: [...witnessed],
  });

  // 3. Scheduler picks NPCs co-located with the player.
  const npcIds = await scheduleNpcs({ playerId, repo, cap });
  if (npcIds.length === 0) {
    log.info('[scheduler] no NPCs eligible this tick');
  } else {
    log.info(`[scheduler] eligible: ${npcIds.join(', ')}`);
  }

  // 4. NPC ticks.
  const npcEvents: DomainEvent[] = [];
  const tickedIds = new Set<AgentId>();
  for (const npcId of npcIds) {
    // Re-check eligibility just before acting: the player's action may have
    // moved/killed/relocated the NPC mid-tick.
    let npc: Agent;
    try {
      npc = await repo.getAgent(npcId);
    } catch {
      continue;
    }
    // The scheduler eligibility is autonomous || awake; mirror it here so a
    // newly-woken NPC gets to tick.
    if ((!npc.autonomous && !npc.awake) || npc.hp <= 0) continue;
    tickedIds.add(npcId);

    // Speech is a free action. decideNpcIntent returns up to two intent
    // lines for the same NPC this tick (typically: a speech line + a
    // non-speech action line). Dispatch them in order so the NPC can
    // both talk and do something.
    const npcWitnessed: string[] = [];
    const intents = ai
      ? await ai.npcIntent(npcId, repo, opts.decisionRepo ? { decisionRepo: opts.decisionRepo } : undefined)
      : [NpcFallbackIntent];
    for (const intention of intents) {
      log.info(`[npc] ${npc.label} action: "${intention}"`);

      if (isWaitIntention(intention)) {
        // Benign no-op — don't bother the parser, don't pollute the player's
        // transcript with "Spark waits."-style filler.
        continue;
      }

      const npcResult = await runTurn(npcId, intention, repo, {
        parse,
        ai,
        discoveryBudget,
        playerId,
        ...(opts.builderRepo ? { builderRepo: opts.builderRepo } : {}),
      });
      if (npcResult.events.length === 0) {
        // Intent didn't parse or dispatch failed. The reason is in npcResult.render
        // (a parse-error or action-error message). Surface it so the dev terminal
        // shows why the NPC produced nothing visible to the player.
        log.info(`[npc] ${npc.label} produced no event: ${npcResult.render.map((s) => s.text).join(' ')}`);
      } else {
        for (const ev of npcResult.events) {
          log.info(`[npc] ${npc.label} -> ${ev.kind}`);
        }
      }
      for (const ev of npcResult.events) {
        events.push(ev);
        npcEvents.push(ev);
        const line = await renderWitnessForPlayer(ev, playerId, repo);
        if (line !== null && line.length > 0) {
          witnessed.push(line);
          npcWitnessed.push(line);
        }
      }
    }
    if (npcWitnessed.length > 0) {
      opts.onChunk?.({ kind: TickChunkKind.NpcTurn, witnessed: npcWitnessed });
    }
  }

  // 5. Wake NPCs that other NPCs just drew the attention of (cross-NPC
  // wake — e.g. Spark addresses Serena, who hasn't ticked yet).
  await wakeWitnessingNpcs(npcEvents, repo);

  // 6. Consequence pass over the NPC events only (depth 1).
  const postNpcConsequences = await runConsequencePass(npcEvents, repo, ai, 1, loreSink);
  for (const ev of postNpcConsequences) {
    events.push(ev);
    const line = await renderWitnessForPlayer(ev, playerId, repo);
    if (line !== null && line.length > 0) witnessed.push(line);
  }

  // 6.5 Spawn pass (monster templates and triggers). Optional: skipped
  // when the caller didn't supply a builderRepo (preserves legacy tests
  // that don't author monsters).
  if (opts.builderRepo) {
    const spawnPerception = await buildPerceptionView(playerId, repo);
    const spawnResult = await runSpawnTickPass({
      worldId: spawnPerception.worldId,
      events,
      engineRepo: repo,
      builderRepo: opts.builderRepo,
      llm: llm ?? null,
      perception: spawnPerception.view,
    });
    for (const ev of spawnResult.events) {
      events.push(ev);
      if (ev.kind === EventKind.AgentSpawned && ev.witnesses.some((w) => w === playerId)) {
        const spawned = await repo.getAgent(ev.spawnedAgentId);
        const text = renderAgentSpawnedObserved(spawned.label);
        playerRender = [...playerRender, { kind: SegmentKind.Spawn, text }];
        opts.onChunk?.({ kind: TickChunkKind.NpcTurn, witnessed: [text] });
      } else {
        const line = await renderWitnessForPlayer(ev, playerId, repo);
        if (line !== null && line.length > 0) witnessed.push(line);
      }
    }
    // Transient LLM narration describing the arrival — does not update stored descriptions
    if (spawnResult.events.length > 0) {
      const spawnNarrations = await generateSpawnNarration({
        spawnEvents: spawnResult.events,
        playerId,
        repo,
        llm: llm ?? null,
      });
      for (const line of spawnNarrations) witnessed.push(line);
      if (spawnNarrations.length > 0) {
        opts.onChunk?.({ kind: TickChunkKind.NpcTurn, witnessed: spawnNarrations });
      }
    }
  }

  // 7. Sleep any woken NPCs (awake && !autonomous) whose shortTermIntent
  // is now null — they've finished what drew them in.
  await sleepFinishedNpcs(repo, playerId, tickedIds);

  return {
    render: playerRender,
    witnessed,
    events,
  };
}
