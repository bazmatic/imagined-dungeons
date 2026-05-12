import type { Agent, Item, Location } from '@core/domain/entities';
import type { DomainEvent } from '@core/domain/events';
import type { AgentId } from '@core/domain/ids';
import {
  AttackOutcome,
  EventKind,
  ExaminableKind,
  NpcFallbackIntent,
  OwnerKind,
} from '@core/domain/kinds';
import { log } from '@core/log';
import type { LanguageModel } from './language-model';
import { recallFor } from './memory';
import { type PerceptionView, perceive } from './perception';
import type { Repository } from './repository';

/**
 * The NPC mind role (abstract-design §10, "special case of the interpreter").
 *
 * Input  = personality + memory + perceived surroundings.
 * Output = a short natural-language intent in the first person.
 *
 * The intent is *not* a structured action. It is fed back into the existing
 * composite parser so NPCs and players share the same closed action vocabulary
 * (slice-2 interpreter). This keeps the simulation tractable and ensures every
 * actor goes through the same validate/apply pipeline.
 *
 * When `llm` is null or the call throws, the function falls back to the
 * deterministic `NpcFallbackIntent` ("wait"). This satisfies §12's
 * "bounded model usage per turn" — even if the model is offline, NPC ticks are
 * cheap, safe, and preserve test determinism.
 */

const SYSTEM_PROMPT = (npc: Agent): string => {
  const lines: string[] = [];
  lines.push(`You are ${npc.label}, an autonomous character in a fantasy text adventure.`);
  if (npc.longDescription && npc.longDescription.length > 0) {
    lines.push(npc.longDescription);
  }
  if (npc.mood) lines.push(`Current mood: ${npc.mood}.`);
  if (npc.shortTermIntent) lines.push(`Current short-term intent: ${npc.shortTermIntent}.`);
  if (npc.goal) lines.push(`Long-term goal: ${npc.goal}.`);
  lines.push('');
  lines.push('Decide what you want to do this turn given what you can perceive right now.');
  lines.push('');
  lines.push('Reply format:');
  lines.push(
    '- ALWAYS START with one or more `THOUGHT: <reasoning>` lines. Use them to think out loud — what you currently see, what you remember, what your intent (if any) means in context, what step would actually achieve it, what obstacles you face, what you should do this turn and why. Two or three thoughts is usually enough; one is fine. These lines do not affect the world; they are your private reasoning and they help you avoid careless mistakes.',
  );
  lines.push('- Then optional control lines (zero, one, or both, in either order):');
  lines.push(
    '    INTENT_DONE              — clear your current short-term intent (use when you have just finished it).',
  );
  lines.push(
    '    INTENT: <full plan>      — set or replace your short-term intent. Phrase it as the WHOLE multi-step task ("deliver the fire map to Captain Serena near the docks"), not the next single step ("take the fire map"). Use this whenever you form a new plan, accept a request, or want to refine an existing intent.',
  );
  lines.push(
    '- Then exactly one action command for this turn, in the first person, using one of the verbs below.',
  );
  lines.push('');
  lines.push('Examples:');
  lines.push(
    '  THOUGHT: Paff just asked me to deliver the fire map to Captain Serena. I do not have it yet.',
  );
  lines.push('  THOUGHT: It is on the table here. I should take it first.');
  lines.push('  INTENT: deliver the fire map to Captain Serena near the docks');
  lines.push('  I take the fire map.');
  lines.push('');
  lines.push(
    '  THOUGHT: I am on the ship and Captain Serena is here. I have the map. The next step is to hand it to her.',
  );
  lines.push('  I give the fire map to Captain Serena.');
  lines.push('');
  lines.push('  THOUGHT: I just delivered the map. The end state is true now.');
  lines.push('  INTENT_DONE');
  lines.push('  I wait.');
  lines.push('');
  lines.push(
    'Your action will be parsed by a verb-noun command interpreter, so phrase the action line as a single command in the first person, using exactly one of these verbs:',
  );
  lines.push(
    '  - move <direction>     — travel through one of the listed exits (e.g. "I move north", "I go south")',
  );
  lines.push(
    '  - look [<thing>]       — examine the room, an item, a character, or an exit (e.g. "I look", "I look at the fire map", "I look at Paff", "I look at the door")',
  );
  lines.push(
    '  - take <item>          — pick up an item visible in the room (e.g. "I take the fire map")',
  );
  lines.push(
    '  - drop <item>          — drop an item from your inventory (e.g. "I drop the lantern")',
  );
  lines.push(
    '  - give <item> to <character>   — hand an item from your inventory to another character in the same room (e.g. "I give the fire map to Captain Serena")',
  );
  lines.push(
    '  - inventory            — check what you are carrying (e.g. "I check my inventory")',
  );
  lines.push(
    '  - say "<utterance>" [to <character>]   — speak. Quote the words. The "to <character>" clause is OPTIONAL: include it only when you mean to address one specific person. Without it, the line is broadcast to the room and listeners decide for themselves whether you meant them. (e.g. \'I say "hello there" to Paff\', or just \'I say "anyone seen the captain?"\')',
  );
  lines.push(
    '  - emote <description>             — perform a brief gesture or expression for show, no state change. Use the base verb form (e.g. "I emote wave at Paff", "I emote grin", "I emote shake my head").',
  );
  lines.push('  - attack <character>   — attack another character (e.g. "I attack the goblin")');
  lines.push('  - wait                 — do nothing this turn');
  lines.push('');
  lines.push('Behavioural priorities (in order):');
  lines.push(
    '1. If something has been directed AT YOU that you have NOT yet responded to (it will appear under a section with that heading), respond — usually with `say "..." to <them>`. Be true to your mood and goal. If no such section appears, you have nothing pending to respond to and you should NOT bring up earlier exchanges again — move on.',
  );
  lines.push(
    '2. If someone is currently attacking you (and you have not yet retaliated), decide whether to fight back, flee through an exit, or speak.',
  );
  lines.push(
    '3. Manage your own `Current short-term intent` (shown in the header above). Each turn, decide:\n   a. If you HAVE NO intent yet, ASK YOURSELF whether anything is worth doing right now — anything you observe, anything you remember, anything you just thought of (a question to ask, a person to find, a long-term goal to take a step toward, a curiosity to satisfy, a worry to address, a passive stance). If yes, declare it with `INTENT: <full plan>`. Phrase the intent as the END STATE you are working toward, not the next step on the way to it.\n   b. INTENT_DONE is ONLY for when the end state of your current intent is OBSERVABLY TRUE in this turn\'s events. Verbally agreeing to a task, beginning to work on it, taking the first step, arriving near the goal, or feeling confident you will succeed are NOT fulfilment — keep the intent in those cases. The test is: "if I look at what just happened, would another character watching agree this is finished?" If you cannot answer yes, omit INTENT_DONE.\n   c. If you HAVE an intent and your understanding of it has sharpened (new information, an obstacle, a refined plan), restate it with `INTENT: <refined plan>`.\n   d. If you HAVE an intent and it is still in progress, do not emit a control line — just take the next concrete step.\n   IMPORTANT: An empty `Current short-term intent` at the end of a turn means you go dormant. Declaring an intent is the way to stay in the scene. "I have something I want to pursue but did not declare it" is the failure mode to avoid.',
  );
  lines.push(
    "4. Otherwise, pick something consistent with your long-term goal — move toward something useful, examine your surroundings, pick up something you'd want, emote a small in-character gesture, or wait. Don't repeat or rephrase things you've already said, and do NOT volunteer follow-up speech about earlier exchanges.",
  );
  lines.push('');
  lines.push('Hard rules:');
  lines.push(
    '- Use one of the verbs above. For purely physical/expressive actions like waving, grinning, nodding, or shrugging, use `emote <description>` (e.g. "I emote wave at Paff"). For greeting someone with words, use `say "..." to <them>` plus `emote wave at <them>` if you want both.',
  );
  lines.push(
    '- Refer only to characters, items, and exits you actually perceive. Inventing names will fail.',
  );
  lines.push(
    '- For "say", quote the actual words in double quotes. Add "to <character>" ONLY when addressing one specific person; omit it for general remarks, vocatives, or rhetorical questions. Do not paraphrase.',
  );
  lines.push(
    '- Do not narrate. Do not describe yourself in third person. Do not address the reader.',
  );
  lines.push(
    '- If nothing useful presents itself, reply exactly: I wait. (or "I look" to take in the room.)',
  );
  lines.push(
    '- Reason about what you actually perceive and remember. The information above lists what you can see right now and what you have witnessed recently. Use it: if a previous attempt failed, understand WHY before doing anything similar. If progress on your intent is blocked here, think about what would unblock it — moving, asking someone, trying a different approach, gathering information, making something happen — and act on that.',
  );
  return lines.join('\n');
};

const join = (xs: readonly string[]): string => (xs.length === 0 ? 'none' : xs.join(', '));

async function summariseEvent(
  event: DomainEvent,
  selfId: AgentId,
  repo: Repository,
): Promise<string> {
  const labelOf = async (id: AgentId): Promise<string> => {
    if (id === selfId) return 'you';
    try {
      return (await repo.getAgent(id)).label;
    } catch {
      return id;
    }
  };
  const actorLabel = await labelOf(event.actorId);
  switch (event.kind) {
    case EventKind.Move:
      return `${actorLabel} went ${event.direction}`;
    case EventKind.Take: {
      try {
        const item = await repo.getItem(event.itemId);
        return `${actorLabel} took the ${item.label}`;
      } catch {
        return `${actorLabel} took an item`;
      }
    }
    case EventKind.Drop: {
      try {
        const item = await repo.getItem(event.itemId);
        return `${actorLabel} dropped the ${item.label}`;
      } catch {
        return `${actorLabel} dropped an item`;
      }
    }
    case EventKind.Give: {
      const recipientLabel = await labelOf(event.targetAgentId);
      try {
        const item = await repo.getItem(event.itemId);
        if (event.targetAgentId === selfId) {
          return `${actorLabel} gave you the ${item.label}`;
        }
        return `${actorLabel} gave the ${item.label} to ${recipientLabel}`;
      } catch {
        return `${actorLabel} gave an item to ${recipientLabel}`;
      }
    }
    case EventKind.Look: {
      const t = event.target;
      if (!t) return `${actorLabel} looked around`;
      if (t.kind === ExaminableKind.Room) return `${actorLabel} looked around`;
      if (t.kind === ExaminableKind.Item) {
        try {
          const item = await repo.getItem(t.id);
          return `${actorLabel} examined the ${item.label}`;
        } catch {
          return `${actorLabel} examined an item`;
        }
      }
      if (t.kind === ExaminableKind.Agent) {
        try {
          const a = await repo.getAgent(t.id);
          return `${actorLabel} looked at ${a.label}`;
        } catch {
          return `${actorLabel} looked at someone`;
        }
      }
      if (t.kind === ExaminableKind.Exit) {
        try {
          const exit = await repo.getExit(t.id);
          return `${actorLabel} examined the ${exit.label}`;
        } catch {
          return `${actorLabel} examined an exit`;
        }
      }
      return `${actorLabel} looked around`;
    }
    case EventKind.Inventory:
      return `${actorLabel} checked inventory`;
    case EventKind.Failed:
      return `${actorLabel} tried "${event.attempted}" but it failed: ${event.reason}`;
    case EventKind.Speak: {
      // When the NPC is the explicit target, foreground that — direct
      // address is the strongest cue for "you might want to respond".
      if (event.targetAgentId === selfId) {
        return `${actorLabel} said to you: "${event.utterance}"`;
      }
      // Broadcast speech (no specific addressee) — the NPC heard it. The
      // mind decides whether they think it was meant for them.
      if (event.targetAgentId === null) {
        return `${actorLabel} said (to the room): "${event.utterance}"`;
      }
      const targetLabel = await labelOf(event.targetAgentId);
      return `${actorLabel} said "${event.utterance}" to ${targetLabel}`;
    }
    case EventKind.Emote: {
      if (event.targetAgentId === selfId) {
        return `${actorLabel} ${event.description} at you`;
      }
      if (event.targetAgentId !== null) {
        const targetLabel = await labelOf(event.targetAgentId);
        return `${actorLabel} ${event.description} at ${targetLabel}`;
      }
      return `${actorLabel} ${event.description}`;
    }
    case EventKind.Attack: {
      const targetLabel = await labelOf(event.targetAgentId);
      const dmg = event.outcome === AttackOutcome.Hit ? `, ${event.damageDealt} dmg` : '';
      if (event.targetAgentId === selfId) {
        return `${actorLabel} attacked you (${event.outcome}${dmg})`;
      }
      return `${actorLabel} attacked ${targetLabel} (${event.outcome}${dmg})`;
    }
    case EventKind.DescriptionUpdated:
      return `the world changed (${event.target.kind} description updated)`;
    case EventKind.AgentSpawned: {
      const spawnedLabel = await labelOf(event.spawnedAgentId);
      return `${spawnedLabel} appeared`;
    }
    case EventKind.Equip: {
      try {
        const item = await repo.getItem(event.itemId);
        return `${actorLabel} ${event.manner} the ${item.label}`;
      } catch {
        return `${actorLabel} ${event.manner} something`;
      }
    }
    case EventKind.Unequip: {
      try {
        const item = await repo.getItem(event.itemId);
        return `${actorLabel} ${event.manner} the ${item.label}`;
      } catch {
        return `${actorLabel} ${event.manner} something`;
      }
    }
    case EventKind.Reveal: {
      try {
        const item = await repo.getItem(event.itemId);
        return `${item.label} became visible nearby`;
      } catch {
        return 'something previously hidden became visible nearby';
      }
    }
  }
}

interface NpcMindContext {
  readonly actor: Agent;
  readonly view: PerceptionView;
  readonly inventory: readonly Item[];
  readonly memory: readonly DomainEvent[];
  readonly location: Location;
}

async function buildUserPrompt(
  ctx: NpcMindContext,
  selfId: AgentId,
  repo: Repository,
): Promise<string> {
  const { actor, view, inventory, memory } = ctx;
  const selfNameRegex = new RegExp(
    `\\b${actor.label.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`,
  );
  const items = view.items.map((i) => i.label);
  const agents = view.agents.map((a) => {
    if (a.mood) return `${a.label} (mood: ${a.mood})`;
    return a.label;
  });
  const exits = view.exits.map((e) => {
    const base = e.label && e.label !== e.direction ? `${e.direction} (${e.label})` : e.direction;
    return e.locked ? `${base} [LOCKED]` : base;
  });
  const inv = inventory.map((i) => i.label);
  const lines: string[] = [];
  lines.push(`Location: ${view.location.label}`);
  if (view.location.shortDescription) lines.push(`Surroundings: ${view.location.shortDescription}`);
  lines.push(`Visible items: ${join(items)}`);
  lines.push(`Other characters here: ${join(agents)}`);
  lines.push(`Exits: ${join(exits)}`);
  lines.push(`You are carrying: ${join(inv)}`);

  // Foreground events directly addressed to the NPC that the NPC has NOT yet
  // responded to. An event is considered "addressed" once the NPC has emitted
  // any speak/emote event after it (chronological order is preserved in
  // `memory`). Without this filter the same incoming line keeps firing the
  // "respond" priority every turn, so the NPC repeats themselves indefinitely.
  const unanswered: DomainEvent[] = [];
  for (let i = 0; i < memory.length; i++) {
    const m = memory[i];
    if (!m) continue;
    // Direct address (target === self) always counts. Broadcast speech
    // (target === null) counts only if the NPC's own label appears as a
    // whole word in the utterance — that's the vocative cue. The LLM may
    // also choose to respond to broadcast lines that don't name the NPC,
    // but those don't get foregrounded by this priority-1 filter.
    const isAddressedToMe =
      ((m.kind === EventKind.Speak || m.kind === EventKind.Attack) && m.targetAgentId === selfId) ||
      (m.kind === EventKind.Speak &&
        m.targetAgentId === null &&
        selfNameRegex.test(m.utterance.toLowerCase()));
    if (!isAddressedToMe) continue;
    // Has the NPC already responded to this? Look for any subsequent
    // speak/emote *by* selfId in memory.
    const respondedAfter = memory
      .slice(i + 1)
      .some(
        (later) =>
          later.actorId === selfId &&
          (later.kind === EventKind.Speak || later.kind === EventKind.Emote),
      );
    if (!respondedAfter) unanswered.push(m);
  }
  if (unanswered.length > 0) {
    lines.push('');
    lines.push('IMPORTANT — recent events directed AT YOU that you have NOT yet responded to:');
    for (const m of unanswered) {
      lines.push(`- ${await summariseEvent(m, selfId, repo)}`);
    }
  }

  // Note: we used to derive "commitments" by pattern-matching recent self-
  // speech here. That mechanism overlapped with `Agent.shortTermIntent` (which
  // the consequence engine sets durably and structurally) and produced false
  // positives ("I run around a lot" read as a commitment). Removed in favour
  // of a single source of truth: the consequence engine watches outgoing
  // speech and decides what is or isn't a commitment, persisting it as
  // shortTermIntent. The NPC mind's prompt header already surfaces that field
  // as "Current short-term intent" and priority #3 (below) acts on it.

  if (memory.length > 0) {
    lines.push('');
    lines.push('What you have witnessed recently:');
    for (const m of memory) lines.push(`- ${await summariseEvent(m, selfId, repo)}`);
  }
  return lines.join('\n');
}

export interface NpcMindOptions {
  /** Cap on recent-memory entries fed into the prompt. */
  readonly memoryLimit?: number;
}

const DEFAULT_MEMORY_LIMIT = 8;

export async function decideNpcIntent(
  actorId: AgentId,
  repo: Repository,
  llm: LanguageModel | null,
  opts: NpcMindOptions = {},
): Promise<string> {
  if (!llm) return NpcFallbackIntent;

  const memoryLimit = opts.memoryLimit ?? DEFAULT_MEMORY_LIMIT;
  const actor = await repo.getAgent(actorId);
  const view = await perceive(actorId, repo);
  const inventory = await repo.itemsOwnedBy({ kind: OwnerKind.Agent, id: actorId });
  const memory = await recallFor(actorId, repo, memoryLimit);
  const ctx: NpcMindContext = {
    actor,
    view,
    inventory,
    memory,
    location: view.location,
  };

  const systemPrompt = SYSTEM_PROMPT(actor);
  const userPrompt = await buildUserPrompt(ctx, actorId, repo);
  // Verbose prompt logging is gated because the prompt is long. Set
  // NPC_MIND_DEBUG=1 (or =prompts) to see it in the dev terminal.
  const debug = process.env.NPC_MIND_DEBUG;
  if (debug) {
    log.info(
      `[npc-mind:debug] ${actor.label} prompt:\n--- system ---\n${systemPrompt}\n--- user ---\n${userPrompt}\n---`,
    );
  }

  try {
    const prose = await llm.completeText({ system: systemPrompt, user: userPrompt });
    let body = prose.trim();
    log.info(`[npc-mind] ${actor.label} raw reply: ${JSON.stringify(prose)}`);
    if (body.length === 0) {
      log.warn(`[npc-mind] empty response for ${actor.label}; falling back to wait`);
      return NpcFallbackIntent;
    }
    // The NPC mind owns its own shortTermIntent and reasons out loud before
    // acting. The reply format is:
    //   THOUGHT: <reasoning>   — private reasoning. Logged, not dispatched.
    //   INTENT_DONE            — clear the current intent.
    //   INTENT: <text>         — set or replace the intent.
    //   <action command>       — exactly one action line, in first person.
    //
    // Thoughts and control lines can be interleaved in any order; everything
    // that isn't a control line and isn't a thought is treated as the action.
    let cleared = false;
    let setTo: string | null = null;
    const thoughts: string[] = [];
    const remaining: string[] = [];
    for (const raw of body.split(/\r?\n/)) {
      const line = raw.trim();
      if (line.length === 0) continue;
      const thoughtMatch = line.match(/^THOUGHT:\s*(.+?)\s*$/);
      if (thoughtMatch?.[1]) {
        thoughts.push(thoughtMatch[1]);
        continue;
      }
      if (/^INTENT_DONE\b/.test(line)) {
        cleared = true;
        continue;
      }
      const setMatch = line.match(/^INTENT:\s*(.+?)\s*$/);
      if (setMatch?.[1]) {
        setTo = setMatch[1];
        continue;
      }
      remaining.push(line);
    }
    if (thoughts.length > 0) {
      for (const t of thoughts) {
        log.info(`[npc-mind] ${actor.label} thought: ${JSON.stringify(t)}`);
      }
    } else {
      log.warn(`[npc-mind] ${actor.label} emitted no THOUGHT lines this turn`);
    }
    // Body should be exactly one action line. If the LLM emitted multiple
    // (which happens when it gets confused — e.g. `say ...` then `move ...`
    // both as separate action lines), keep only the first non-empty one and
    // warn so we notice. Subsequent lines are dropped on the floor.
    const bodyLines = remaining;
    if (bodyLines.length > 1) {
      log.warn(
        `[npc-mind] ${actor.label} emitted ${bodyLines.length} action lines; keeping only the first: ${JSON.stringify(bodyLines)}`,
      );
    }
    body = bodyLines[0] ?? '';
    if (cleared && setTo === null && actor.shortTermIntent !== null) {
      await repo.updateAgentDescription(actorId, { shortTermIntent: null });
      log.info(`[npc-mind] ${actor.label} cleared own intent: "${actor.shortTermIntent}"`);
    }
    if (setTo !== null && setTo !== actor.shortTermIntent) {
      await repo.updateAgentDescription(actorId, { shortTermIntent: setTo });
      log.info(
        `[npc-mind] ${actor.label} set own intent: "${actor.shortTermIntent ?? '(none)'}" -> "${setTo}"`,
      );
    }
    // Final state for diagnostic purposes: the agent's intent after this
    // tick's parse, plus the action we're about to dispatch.
    const finalIntent = setTo !== null ? setTo : cleared ? null : (actor.shortTermIntent ?? null);
    log.info(
      `[npc-mind] ${actor.label} intent now: ${finalIntent === null ? '(none)' : `"${finalIntent}"`}; action: ${
        body.length === 0 ? '(wait — empty after control lines)' : JSON.stringify(body)
      }`,
    );
    if (body.length === 0) return NpcFallbackIntent;
    return body;
  } catch (err) {
    log.warn(`[npc-mind] error deciding intent for ${actor.label}: ${String(err)}`);
    return NpcFallbackIntent;
  }
}
