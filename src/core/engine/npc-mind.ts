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
import type { DecisionSnapshot, RawPrompt } from '@core/domain/npc-decision';
import type { LanguageModel } from './language-model';
import { recallFor } from './memory';
import type { NpcDecisionRepository } from './npc-decision-repository';
import { type PerceptionView, perceive } from './perception';
import type { HandlerRepo } from './repository';

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
  if (npc.sideQuest) lines.push(`Active side quest: ${npc.sideQuest}.`);
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
    '    QUEST_DONE               — complete your current side quest (use ONLY when the end state is observably, unambiguously achieved in the world).',
  );
  lines.push(
    '    QUEST: <full goal>       — set or replace your active side quest. A side quest is a SIGNIFICANT, MULTI-STEP GOAL WITH A REAL-WORLD OUTCOME — the kind of thing worth tracking across many turns. Phrase it as the END STATE you are working toward ("deliver the fire map to Captain Serena near the docks", "find out what is causing the fires in the east wing", "earn enough gold to buy passage out of the district"). NOT side quests: asking someone a question, picking up a nearby item, moving to an adjacent room, saying hello, or anything completable in one or two actions. If your goal can be carried out right now, just do it — do NOT open a side quest for it.',
  );
  lines.push(
    '- Then exactly one action command for this turn, in the first person, using one of the verbs below.',
  );
  lines.push('');
  lines.push('Examples:');
  lines.push(
    '  THOUGHT: I notice the District Chart on the wall. I want to look at it. Looking takes one action — that is all. So I just look; no QUEST needed. After this action my goal is done.',
  );
  lines.push('  I look at the District Chart.');
  lines.push('');
  lines.push(
    '  THOUGHT: Paff just asked me to deliver the fire map to Captain Serena. I do not have it yet.',
  );
  lines.push('  THOUGHT: It is on the table here. I should take it first. This will take several more steps after this turn.');
  lines.push('  QUEST: deliver the fire map to Captain Serena near the docks');
  lines.push('  I take the fire map.');
  lines.push('');
  lines.push(
    '  THOUGHT: I am on the ship and Captain Serena is here. I have the map. The next step is to hand it to her.',
  );
  lines.push('  I give the fire map to Captain Serena.');
  lines.push('');
  lines.push('  THOUGHT: I just delivered the map. The end state is true now — a bystander would agree the quest is done.');
  lines.push('  QUEST_DONE');
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
  lines.push(
    '  - open <item|exit>     — open a container in this room or in your inventory, OR walk through a door (e.g. "I open the wooden box", "I open the back door"). Auto-unlocks if you carry the matching key.',
  );
  lines.push(
    '  - close <item>         — shut a container you previously opened (e.g. "I close the chest")',
  );
  lines.push(
    '  - offer <item> for <N> gold   — set the price of an item in YOUR inventory so someone can buy it from you (e.g. "I offer the rusty dagger for 5 gold"). The item then shows up as "(Ngp)" in your inventory; nearby characters hear you quote the price.',
  );
  lines.push(
    '  - buy <item> from <character> — buy an item another character has priced (the engine asks them to consent). You must be in the same room and have at least their asking price in gold.',
  );
  lines.push(
    '  - sell <item> to <character>  — sell an item you have already `offer`-priced to another character (the engine asks them to consent). Don\'t use `give` for sales — `give` transfers without payment.',
  );
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
    '3. Manage your `Active side quest` (shown in the header above). A side quest is a SIGNIFICANT, MULTI-STEP GOAL WITH A REAL-WORLD OUTCOME — the kind of thing worth tracking across many turns. Each turn, decide:\n   a. If you have NO side quest: set one ONLY if you have something worth pursuing that will take MULTIPLE TURNS AND MULTIPLE ACTIONS to complete. Good side quests: "deliver the fire map to Captain Serena", "find out what is causing the fires in the east wing", "earn enough gold to buy passage out of the district". NOT side quests: asking someone a question, picking up a nearby item, moving to an adjacent room, saying hello, or anything completable in one or two actions. If your goal can be carried out right now, just do it — do NOT open a side quest for it.\n   b. QUEST_DONE: emit this ONLY when the end state of your side quest is observably, unambiguously complete — the thing you set out to achieve has happened in the world. Getting a partial answer, beginning a task, or taking a first step are NOT completion. The test: would a bystander watching this turn agree "yes, that quest is done"?\n   c. If your side quest is still in progress, do not emit a control line — take the next concrete step toward it.\n   IMPORTANT: An empty side quest at the end of a turn means you go dormant. A side quest keeps you active in the scene.',
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
    '- SPEECH IS A FREE ACTION. You may emit ONE speech line (`I say "..." to X`, `I tell X, ...`, `I ask X about ...`, etc.) AND ONE non-speech action line (move, look, take, drop, give, emote, attack, search, equip, unequip, open, close, offer, buy, sell) in the same turn. Put each on its own line. Examples: \n  I say "Be right back!" to Paff.\n  I move south.\n  — or —\n  I tell the bartender, "I\'ll take that drink."\n  I take the bottle.\n  Limit: at most one of each kind. Two speech lines or two physical-action lines in the same turn will be reduced to one.',
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
  repo: HandlerRepo,
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
          const desc = item.shortDescription ? ` — ${item.shortDescription}` : '';
          return `${actorLabel} examined the ${item.label}${desc}`;
        } catch {
          return `${actorLabel} examined an item`;
        }
      }
      if (t.kind === ExaminableKind.Agent) {
        try {
          const a = await repo.getAgent(t.id);
          const desc = a.shortDescription ? ` — ${a.shortDescription}` : '';
          return `${actorLabel} looked at ${a.label}${desc}`;
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
    case EventKind.CreativeAttack: {
      const targetLabel = await labelOf(event.targetAgentId);
      const dmg = event.outcome === AttackOutcome.Hit ? `, ${event.damageDealt} dmg` : '';
      if (event.targetAgentId === selfId) {
        return `${actorLabel} ${event.narrative} — hit you (${event.outcome}${dmg})`;
      }
      return `${actorLabel} ${event.narrative} targeting ${targetLabel} (${event.outcome}${dmg})`;
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
    case EventKind.Open: {
      try {
        const item = await repo.getItem(event.itemId);
        return event.unlocked
          ? `${actorLabel} unlocked and opened the ${item.label}`
          : `${actorLabel} opened the ${item.label}`;
      } catch {
        return `${actorLabel} opened a container`;
      }
    }
    case EventKind.Close: {
      try {
        const item = await repo.getItem(event.itemId);
        return `${actorLabel} closed the ${item.label}`;
      } catch {
        return `${actorLabel} closed a container`;
      }
    }
    case EventKind.Trade: {
      const buyerLabel = await labelOf(event.buyerId);
      const sellerLabel = await labelOf(event.sellerId);
      let itemLabel: string;
      try {
        itemLabel = (await repo.getItem(event.itemId)).label;
      } catch {
        itemLabel = 'an item';
      }
      return event.accepted
        ? `${buyerLabel} bought the ${itemLabel} from ${sellerLabel} for ${event.price} gold`
        : `${sellerLabel} refused to sell the ${itemLabel} to ${buyerLabel} for ${event.price} gold`;
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

interface UserPromptResult {
  readonly prompt: string;
  readonly baseSnapshot: Omit<DecisionSnapshot, 'response' | 'fallback'>;
}

const DEFAULT_MEMORY_LIMIT = 8;
const DEFAULT_MAX_TURN_DEPTH = 5;

const TICK_LABEL: Readonly<Record<number, string>> = {
  0: 'This turn',
  1: 'Last turn',
  2: 'Two turns ago',
  3: 'Three turns ago',
};

async function buildUserPrompt(
  ctx: NpcMindContext,
  selfId: AgentId,
  repo: HandlerRepo,
  opts: Pick<NpcMindOptions, 'maxTurnDepth'>,
): Promise<UserPromptResult> {
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
      ((m.kind === EventKind.Speak || m.kind === EventKind.Attack || m.kind === EventKind.CreativeAttack) && m.targetAgentId === selfId) ||
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
  const unansweredSummaries: string[] = [];
  if (unanswered.length > 0) {
    lines.push('');
    lines.push('IMPORTANT — recent events directed AT YOU that you have NOT yet responded to:');
    for (const m of unanswered) {
      const summary = await summariseEvent(m, selfId, repo);
      unansweredSummaries.push(summary);
      lines.push(`- ${summary}`);
    }
  }

  // Note: we used to derive "commitments" by pattern-matching recent self-
  // speech here. That mechanism overlapped with `Agent.sideQuest` (which
  // the consequence engine sets durably and structurally) and produced false
  // positives ("I run around a lot" read as a commitment). Removed in favour
  // of a single source of truth: the consequence engine watches outgoing
  // speech and decides what is or isn't a commitment, persisting it as
  // sideQuest. The NPC mind's prompt header already surfaces that field
  // as "Active side quest" and priority #3 (below) acts on it.

  const memorySummaries: string[] = [];
  if (memory.length > 0) {
    const maxDepth = opts.maxTurnDepth ?? DEFAULT_MAX_TURN_DEPTH;

    // Group events by tickId. null key = pre-migration or unstamped.
    const groupMap = new Map<number | null, DomainEvent[]>();
    for (const m of memory) {
      const key = m.tickId ?? null;
      const bucket = groupMap.get(key);
      if (bucket) bucket.push(m);
      else groupMap.set(key, [m]);
    }

    // Sort oldest-first: null group comes first, then ascending tickId.
    const sorted: Array<[number | null, DomainEvent[]]> = [];
    if (groupMap.has(null)) sorted.push([null, groupMap.get(null)!]);
    const tickIds = [...groupMap.keys()]
      .filter((k): k is number => k !== null)
      .sort((a, b) => a - b);
    for (const tid of tickIds) sorted.push([tid, groupMap.get(tid)!]);

    // Keep at most maxDepth groups, dropping the oldest.
    const capped = sorted.length > maxDepth ? sorted.slice(sorted.length - maxDepth) : sorted;
    const n = capped.length;

    lines.push('');
    lines.push('What you have witnessed, oldest to most recent:');
    for (let i = 0; i < n; i++) {
      const [key, events] = capped[i]!;
      const distFromEnd = n - 1 - i;
      const timeLabel =
        key === null ? 'Earlier' : (TICK_LABEL[distFromEnd] ?? `${distFromEnd} turns ago`);
      // All events in a tick group share the same location for a given observer.
      const locLabel = events[0]?.locationLabel;
      const header = locLabel ? `${timeLabel} — ${locLabel}:` : `${timeLabel}:`;
      lines.push('');
      lines.push(header);
      for (const m of events) {
        const summary = await summariseEvent(m, selfId, repo);
        memorySummaries.push(summary);
        lines.push(`- ${summary}`);
      }
    }
  }
  const baseSnapshot: Omit<DecisionSnapshot, 'response' | 'fallback'> = {
    agentState: {
      mood: actor.mood ?? null,
      goal: actor.goal ?? null,
      sideQuest: actor.sideQuest ?? null,
    },
    perception: {
      locationLabel: view.location.label,
      locationDescription: view.location.shortDescription,
      visibleItems: view.items.map((i) => i.label),
      visibleAgents: view.agents.map((a) =>
        a.mood ? { label: a.label, mood: a.mood } : { label: a.label },
      ),
      exits: view.exits.map((e) => ({
        direction: e.direction,
        label: e.label,
        locked: e.locked,
      })),
      inventory: inventory.map((i) => i.label),
      unansweredAddresses: unansweredSummaries,
    },
    memory: memorySummaries,
  };
  return { prompt: lines.join('\n'), baseSnapshot };
}

export interface NpcMindOptions {
  /** Cap on recent-memory entries fed into the prompt. */
  readonly memoryLimit?: number;
  /** Maximum number of distinct tick-groups to show in the memory section. Oldest are dropped. */
  readonly maxTurnDepth?: number;
  /** When provided, each decision is persisted as a snapshot for the Sensorium. */
  readonly decisionRepo?: NpcDecisionRepository | null;
}

/**
 * Returns up to two intent lines for the NPC to execute this turn. Speech
 * is a "free action" — an NPC may speak AND do one other thing in the same
 * tick. The returned array contains:
 *   - 0 entries: a wait fallback (caller decides what to do).
 *   - 1 entry: a single intent line (speech OR action).
 *   - 2 entries: speech line first, then a non-speech action line.
 *
 * The wait sentinel `NpcFallbackIntent` is returned as a single-element
 * array so callers can treat it uniformly.
 */
export async function decideNpcIntent(
  actorId: AgentId,
  repo: HandlerRepo,
  llm: LanguageModel | null,
  opts: NpcMindOptions = {},
): Promise<readonly string[]> {
  if (!llm) return [NpcFallbackIntent];

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
  const { prompt: userPrompt, baseSnapshot } = await buildUserPrompt(ctx, actorId, repo, opts);
  // Verbose prompt logging is gated because the prompt is long. Set
  // NPC_MIND_DEBUG=1 (or =prompts) to see it in the dev terminal.
  const debug = process.env.NPC_MIND_DEBUG;
  if (debug) {
    log.info(
      `[npc-mind:debug] ${actor.label} prompt:\n--- system ---\n${systemPrompt}\n--- user ---\n${userPrompt}\n---`,
    );
  }

  const decisionRepo = opts.decisionRepo ?? null;
  const worldId = decisionRepo ? await repo.getWorldId() : null;
  const rawPrompt: RawPrompt = { system: systemPrompt, user: userPrompt };

  try {
    const prose = await llm.completeText({ system: systemPrompt, user: userPrompt });
    let body = prose.trim();
    log.info(`[npc-mind] ${actor.label} raw reply: ${JSON.stringify(prose)}`);
    if (body.length === 0) {
      log.warn(`[npc-mind] empty response for ${actor.label}; falling back to wait`);
      if (decisionRepo && worldId) {
        await decisionRepo.save(
          worldId,
          String(actorId),
          {
            ...baseSnapshot,
            response: {
              rawText: prose,
              thought: null,
              sideQuestBefore: actor.sideQuest ?? null,
              sideQuestAfter: actor.sideQuest ?? null,
              actions: [],
            },
            fallback: true,
          },
          rawPrompt,
        );
      }
      return [NpcFallbackIntent];
    }
    // The NPC mind owns its own sideQuest and reasons out loud before
    // acting. The reply format is:
    //   THOUGHT: <reasoning>   — private reasoning. Logged, not dispatched.
    //   QUEST_DONE             — complete the current side quest.
    //   QUEST: <text>          — set or replace the side quest.
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
      if (/^QUEST_DONE\b/.test(line)) {
        cleared = true;
        continue;
      }
      const setMatch = line.match(/^QUEST:\s*(.+?)\s*$/);
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
    // Speech is a FREE action: the NPC may emit up to one speech line plus
    // one non-speech line in the same turn. We classify each line by its
    // leading verb. If multiple speech lines or multiple non-speech lines
    // are emitted, we keep only the first of each and warn about the rest.
    const speechRegex =
      /^i\s+(say|tell|talk|speak|shout|whisper|ask|reply|answer|cry|mutter|murmur|sing|greet|call|exclaim|respond)\b/i;
    const isSpeech = (l: string): boolean => speechRegex.test(l.trim());
    const bodyLines = remaining;
    let speechLine: string | null = null;
    let actionLine: string | null = null;
    const dropped: string[] = [];
    for (const line of bodyLines) {
      if (isSpeech(line)) {
        if (speechLine === null) speechLine = line;
        else dropped.push(line);
      } else {
        if (actionLine === null) actionLine = line;
        else dropped.push(line);
      }
    }
    if (dropped.length > 0) {
      log.warn(
        `[npc-mind] ${actor.label} emitted extra action lines beyond speech+action; dropping: ${JSON.stringify(dropped)}`,
      );
    }
    const orderedLines: string[] = [];
    if (speechLine !== null) orderedLines.push(speechLine);
    if (actionLine !== null) orderedLines.push(actionLine);
    body = orderedLines.join(' && ');
    if (cleared && setTo === null && actor.sideQuest !== null) {
      await repo.updateAgentDescription(actorId, { sideQuest: null });
      log.info(`[npc-mind] ${actor.label} cleared own side quest: "${actor.sideQuest}"`);
    }
    if (setTo !== null && setTo !== actor.sideQuest) {
      await repo.updateAgentDescription(actorId, { sideQuest: setTo });
      log.info(
        `[npc-mind] ${actor.label} set own side quest: "${actor.sideQuest ?? '(none)'}" -> "${setTo}"`,
      );
    }
    // Final state for diagnostic purposes: the agent's side quest after this
    // tick's parse, plus the action we're about to dispatch.
    const finalIntent = setTo !== null ? setTo : cleared ? null : (actor.sideQuest ?? null);
    log.info(
      `[npc-mind] ${actor.label} side quest now: ${finalIntent === null ? '(none)' : `"${finalIntent}"`}; action: ${
        body.length === 0 ? '(wait — empty after control lines)' : JSON.stringify(body)
      }`,
    );
    if (decisionRepo && worldId) {
      const snapshot: DecisionSnapshot = {
        ...baseSnapshot,
        response: {
          rawText: prose,
          thought: thoughts.length > 0 ? thoughts.join('\n') : null,
          sideQuestBefore: actor.sideQuest ?? null,
          sideQuestAfter: finalIntent,
          actions: orderedLines,
        },
        fallback: false,
      };
      await decisionRepo.save(worldId, String(actorId), snapshot, rawPrompt);
    }
    if (orderedLines.length === 0) return [NpcFallbackIntent];
    return orderedLines;
  } catch (err) {
    log.warn(`[npc-mind] error deciding intent for ${actor.label}: ${String(err)}`);
    if (decisionRepo && worldId) {
      await decisionRepo.save(
        worldId,
        String(actorId),
        {
          ...baseSnapshot,
          response: {
            rawText: '',
            thought: null,
            sideQuestBefore: actor.sideQuest ?? null,
            sideQuestAfter: actor.sideQuest ?? null,
            actions: [],
          },
          fallback: true,
        },
        rawPrompt,
      );
    }
    return [NpcFallbackIntent];
  }
}
