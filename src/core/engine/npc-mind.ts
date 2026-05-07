import type { Agent, Item, Location } from '@core/domain/entities';
import type { DomainEvent } from '@core/domain/events';
import type { AgentId } from '@core/domain/ids';
import { AttackOutcome, EventKind, NpcFallbackIntent, OwnerKind } from '@core/domain/kinds';
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
  if (npc.goal) lines.push(`Long-term goal: ${npc.goal}.`);
  lines.push('');
  lines.push('Decide what you want to do this turn given what you can perceive right now.');
  lines.push(
    'Your reply will be parsed by a verb-noun command interpreter, so you MUST phrase your intent as a single command in the first person, using exactly one of these verbs:',
  );
  lines.push(
    '  - move <direction>     — travel through one of the listed exits (e.g. "I move north", "I go south")',
  );
  lines.push(
    '  - look [<thing>]       — examine the room, an item, or another character (e.g. "I look", "I look at the fire map")',
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
    '  - say "<utterance>" to <character>   — speak to another character. Quote the words. (e.g. \'I say "hello there" to Paff\')',
  );
  lines.push('  - attack <character>   — attack another character (e.g. "I attack the goblin")');
  lines.push('  - wait                 — do nothing this turn');
  lines.push('');
  lines.push('Behavioural priorities (in order):');
  lines.push(
    '1. If someone has just spoken to you (look for "directed AT YOU" entries in the user message), respond — usually with `say "..." to <them>`. Be true to your mood and goal.',
  );
  lines.push(
    '2. If someone has just attacked you, decide whether to fight back, flee through an exit, or speak.',
  );
  lines.push(
    "3. Otherwise, pick something consistent with your goal — move toward something useful, examine your surroundings, pick up something you'd want, or wait.",
  );
  lines.push('');
  lines.push('Hard rules:');
  lines.push(
    '- Use one of the verbs above. Do not use "greet", "smile", "compliment", "approach", "wave", "nod", "look up", "shrug", or any verb not in the list — those will fail to parse and you will do nothing.',
  );
  lines.push(
    '- Refer only to characters, items, and exits that appear in the user message. Inventing names will fail.',
  );
  lines.push(
    '- For "say", quote the actual words in double quotes and name the listener. Do not paraphrase.',
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
    case EventKind.Look:
      return `${actorLabel} looked around`;
    case EventKind.Inventory:
      return `${actorLabel} checked inventory`;
    case EventKind.Failed:
      return `${actorLabel} attempted: ${event.attempted}`;
    case EventKind.Speak: {
      const targetLabel = await labelOf(event.targetAgentId);
      // When the NPC is the target, foreground that — direct address is the
      // strongest cue for "you might want to respond".
      if (event.targetAgentId === selfId) {
        return `${actorLabel} said to you: "${event.utterance}"`;
      }
      return `${actorLabel} said "${event.utterance}" to ${targetLabel}`;
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
  const { view, inventory, memory } = ctx;
  const items = view.items.map((i) => i.label);
  const agents = view.agents.map((a) => {
    if (a.mood) return `${a.label} (mood: ${a.mood})`;
    return a.label;
  });
  const exits = view.exits.map((e) =>
    e.label && e.label !== e.direction ? `${e.direction} (${e.label})` : e.direction,
  );
  const inv = inventory.map((i) => i.label);
  const lines: string[] = [];
  lines.push(`Location: ${view.location.label}`);
  if (view.location.shortDescription) lines.push(`Surroundings: ${view.location.shortDescription}`);
  lines.push(`Visible items: ${join(items)}`);
  lines.push(`Other characters here: ${join(agents)}`);
  lines.push(`Exits: ${join(exits)}`);
  lines.push(`You are carrying: ${join(inv)}`);

  // Foreground events directly addressed to the NPC — these are the strongest
  // cue for "respond, don't go off and do an unrelated thing".
  const directlyAddressed = memory.filter(
    (m) =>
      (m.kind === EventKind.Speak || m.kind === EventKind.Attack) && m.targetAgentId === selfId,
  );
  if (directlyAddressed.length > 0) {
    lines.push('');
    lines.push('IMPORTANT — recent events directed AT YOU (consider how to respond):');
    for (const m of directlyAddressed) {
      lines.push(`- ${await summariseEvent(m, selfId, repo)}`);
    }
  }

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
    const trimmed = prose.trim();
    if (trimmed.length === 0) {
      console.warn(`[npc-mind] empty response for ${actor.label}; falling back to wait`);
      return NpcFallbackIntent;
    }
    return trimmed;
  } catch (err) {
    console.warn(`[npc-mind] error deciding intent for ${actor.label}:`, err);
    return NpcFallbackIntent;
  }
}
