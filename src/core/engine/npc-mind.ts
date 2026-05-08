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
  lines.push('- Optional control lines come first (zero, one, or both, in either order):');
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
  lines.push('  INTENT: deliver the fire map to Captain Serena near the docks');
  lines.push('  I take the fire map.');
  lines.push('');
  lines.push('  INTENT_DONE');
  lines.push('  I wait.');
  lines.push('');
  lines.push('  I move south.');
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
    '1. If the user message contains a section "directed AT YOU that you have NOT yet responded to", respond — usually with `say "..." to <them>`. Be true to your mood and goal. If that section is absent or empty, you have nothing pending to respond to and you should NOT bring up earlier exchanges again — move on.',
  );
  lines.push(
    '2. If someone is currently attacking you (and you have not yet retaliated), decide whether to fight back, flee through an exit, or speak.',
  );
  lines.push(
    '3. Manage your own `Current short-term intent` (shown in the header above). Each turn, decide:\n   a. If you HAVE NO intent yet but the situation calls for one (someone asked you to do something multi-step, or you decided to pursue a goal), declare it with `INTENT: <full plan>`. Capture the WHOLE task ("deliver the fire map to Captain Serena near the docks"), not just the first step.\n   b. If you HAVE an intent and have just carried it out (cross-reference your witnessed events and current state), prefix with `INTENT_DONE`.\n   c. If you HAVE an intent and your understanding of it has sharpened (you learned the destination, the recipient, etc.), restate it with `INTENT: <refined plan>`.\n   d. If you HAVE an intent and it is still in progress, do not emit a control line — just take the next concrete step (pick up the item, move toward the destination, hand it over, etc.).',
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
    '- Refer only to characters, items, and exits that appear in the user message. Inventing names will fail.',
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

  try {
    const prose = await llm.completeText({
      system: SYSTEM_PROMPT(actor),
      user: await buildUserPrompt(ctx, actorId, repo),
    });
    let body = prose.trim();
    if (body.length === 0) {
      console.warn(`[npc-mind] empty response for ${actor.label}; falling back to wait`);
      return NpcFallbackIntent;
    }
    // The NPC mind owns its own shortTermIntent. The reply format may begin
    // with control lines that update intent; remaining lines are the action
    // command for this turn.
    //   INTENT_DONE          — clear the current intent.
    //   INTENT: <text>       — set or replace the intent.
    // Both can appear (clear-and-replace), in either order. Lines after the
    // last control line are the action.
    let cleared = false;
    let setTo: string | null = null;
    const lines = body.split(/\r?\n/);
    while (lines.length > 0) {
      const first = lines[0]?.trim() ?? '';
      if (/^INTENT_DONE\b/.test(first)) {
        cleared = true;
        lines.shift();
        continue;
      }
      const setMatch = first.match(/^INTENT:\s*(.+?)\s*$/);
      if (setMatch?.[1]) {
        setTo = setMatch[1];
        lines.shift();
        continue;
      }
      break;
    }
    body = lines.join('\n').trim();
    if (cleared && setTo === null && actor.shortTermIntent !== null) {
      await repo.updateAgentDescription(actorId, { shortTermIntent: null });
      console.info(`[npc-mind] ${actor.label} cleared own intent: "${actor.shortTermIntent}"`);
    }
    if (setTo !== null && setTo !== actor.shortTermIntent) {
      await repo.updateAgentDescription(actorId, { shortTermIntent: setTo });
      console.info(
        `[npc-mind] ${actor.label} set own intent: "${actor.shortTermIntent ?? '(none)'}" -> "${setTo}"`,
      );
    }
    if (body.length === 0) return NpcFallbackIntent;
    return body;
  } catch (err) {
    console.warn(`[npc-mind] error deciding intent for ${actor.label}:`, err);
    return NpcFallbackIntent;
  }
}
