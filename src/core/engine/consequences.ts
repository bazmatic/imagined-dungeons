import type { Action, DescriptionTarget } from '@core/domain/actions';
import type { Agent, Item, Location } from '@core/domain/entities';
import type { DomainEvent } from '@core/domain/events';
import { type AgentId, SYSTEM_AGENT_ID } from '@core/domain/ids';
import { ActionKind, AttackOutcome, EventKind, OwnerKind } from '@core/domain/kinds';
import type { JsonSchema, LanguageModel } from './language-model';
import { resolveAgent, resolveItem } from './parser';
import type { Repository } from './repository';

/**
 * The consequence engine (abstract-design §9, §10).
 *
 * Given the events that just resolved, ask the model whether the world's
 * stored short/long descriptions should change to reflect them durably. The
 * output is a list of actions in the closed vocabulary — for slice 5, only
 * `update_description` actions are emitted.
 *
 * Bounded by §12:
 *   - one LLM call per pass;
 *   - cap of 3 returned actions (extras are dropped);
 *   - depth cap enforced by the caller (see runTick).
 *
 * Determinism: with `llm === null`, returns `[]`. Tests stay green without
 * an API key. Malformed responses also collapse to `[]` with a `[llm]` warn.
 */

const SYSTEM_PROMPT = `You are the consequence engine of a fantasy text adventure.

Given a batch of events that just happened, decide whether the world's stored short/long descriptions should change to reflect those events durably.

You can only emit \`update_description\` actions. Be conservative — most batches need no consequences. Reply with a JSON object containing a \`consequences\` array (possibly empty).

When to emit a consequence:
- An event has visibly altered an entity in a way that the prior stored description now misrepresents (e.g. an attack outcome leaves a body, wreckage, or stains; a take of a key item leaves an empty pedestal; fire damage scars a wall).
- Prefer updating the location's longDescription when the room itself is now different.

When NOT to emit a consequence:
- Routine movement (move): people enter and leave rooms constantly; that does not change the room.
- Routine looking, inventory checks, or failed actions.
- Speech that does not damage anything.
- Any change you would have to invent details for that the events do not support.

Output rules:
- Refer to entities by short natural-language names ("the workshop", "the lantern", "Paff Pinkerton") in the targetRef field.
- targetKind must be exactly one of: "location", "item", "agent".
- Set shortDescription or longDescription to the new prose, or null to leave that field unchanged. At least one must be a string.
- Keep prose short, present tense, factual, and grounded in what actually happened in the events.
- Maximum 3 entries in consequences.`;

export const CONSEQUENCE_SCHEMA_NAME = 'ConsequenceResponse';

const TARGET_KINDS = [OwnerKind.Location, OwnerKind.Item, OwnerKind.Agent] as const;
const CONSEQUENCE_KINDS = [ActionKind.UpdateDescription] as const;

export const CONSEQUENCE_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['consequences'],
  properties: {
    consequences: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'targetKind', 'targetRef', 'shortDescription', 'longDescription'],
        properties: {
          kind: { enum: [...CONSEQUENCE_KINDS] },
          targetKind: { enum: [...TARGET_KINDS] },
          targetRef: { type: 'string' },
          shortDescription: { type: ['string', 'null'] },
          longDescription: { type: ['string', 'null'] },
        },
      },
    },
  },
};

/** Hard cap on consequence actions returned per pass (§12 boundedness). */
export const MAX_CONSEQUENCES_PER_PASS = 3;

/** Cap on consequence-pass recursion depth (§9 termination). */
export const MAX_CONSEQUENCE_DEPTH = 1;

interface RawConsequence {
  readonly kind: 'update_description';
  readonly targetKind: 'location' | 'item' | 'agent';
  readonly targetRef: string;
  readonly shortDescription: string | null;
  readonly longDescription: string | null;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function parseResponse(parsed: unknown): readonly RawConsequence[] {
  if (!isRecord(parsed)) return [];
  const list = parsed.consequences;
  if (!Array.isArray(list)) return [];
  const out: RawConsequence[] = [];
  for (const entry of list) {
    if (!isRecord(entry)) continue;
    if (entry.kind !== ActionKind.UpdateDescription) continue;
    const targetKind = entry.targetKind;
    if (
      targetKind !== OwnerKind.Location &&
      targetKind !== OwnerKind.Item &&
      targetKind !== OwnerKind.Agent
    ) {
      continue;
    }
    const targetRef = entry.targetRef;
    if (typeof targetRef !== 'string' || targetRef.length === 0) continue;
    const shortDescription = entry.shortDescription;
    const longDescription = entry.longDescription;
    if (shortDescription !== null && typeof shortDescription !== 'string') continue;
    if (longDescription !== null && typeof longDescription !== 'string') continue;
    if (shortDescription === null && longDescription === null) continue;
    out.push({
      kind: ActionKind.UpdateDescription,
      targetKind,
      targetRef,
      shortDescription,
      longDescription,
    });
  }
  return out;
}

async function summarise(event: DomainEvent, repo: Repository): Promise<string> {
  const labelOf = async (id: AgentId): Promise<string> => {
    try {
      return (await repo.getAgent(id)).label;
    } catch {
      return id;
    }
  };
  switch (event.kind) {
    case EventKind.Move: {
      const actor = await labelOf(event.actorId);
      return `${actor} moved ${event.direction}`;
    }
    case EventKind.Take: {
      const actor = await labelOf(event.actorId);
      try {
        const item = await repo.getItem(event.itemId);
        return `${actor} took the ${item.label}`;
      } catch {
        return `${actor} took an item`;
      }
    }
    case EventKind.Drop: {
      const actor = await labelOf(event.actorId);
      try {
        const item = await repo.getItem(event.itemId);
        return `${actor} dropped the ${item.label}`;
      } catch {
        return `${actor} dropped an item`;
      }
    }
    case EventKind.Look:
      return `${await labelOf(event.actorId)} looked around`;
    case EventKind.Inventory:
      return `${await labelOf(event.actorId)} checked inventory`;
    case EventKind.Failed:
      return `${await labelOf(event.actorId)} attempted: ${event.attempted}`;
    case EventKind.Speak: {
      const actor = await labelOf(event.actorId);
      const target = await labelOf(event.targetAgentId);
      return `${actor} said "${event.utterance}" to ${target}`;
    }
    case EventKind.Emote: {
      const actor = await labelOf(event.actorId);
      if (event.targetAgentId === null) {
        return `${actor} ${event.description} (for show, no state change)`;
      }
      const target = await labelOf(event.targetAgentId);
      return `${actor} ${event.description} at ${target} (for show, no state change)`;
    }
    case EventKind.Attack: {
      const actor = await labelOf(event.actorId);
      const target = await labelOf(event.targetAgentId);
      const dmg = event.outcome === AttackOutcome.Hit ? `, ${event.damageDealt} dmg` : '';
      return `${actor} attacked ${target} (${event.outcome}${dmg})`;
    }
    case EventKind.DescriptionUpdated: {
      const actor = await labelOf(event.actorId);
      return `${actor} updated a description (${event.target.kind})`;
    }
  }
}

/** Distinct location ids referenced by a batch of events, in order. */
async function locationsInvolved(
  events: readonly DomainEvent[],
  repo: Repository,
): Promise<readonly Location[]> {
  const seen = new Set<string>();
  const out: Location[] = [];
  for (const e of events) {
    let locId: string | null = null;
    if (e.kind === EventKind.Move) locId = e.to;
    else if (e.kind === EventKind.Take) locId = e.from;
    else if (e.kind === EventKind.Drop) locId = e.to;
    else if (e.kind === EventKind.Look) locId = e.locationId;
    else {
      try {
        const actor = await repo.getAgent(e.actorId);
        locId = actor.locationId;
      } catch {
        locId = null;
      }
    }
    if (!locId || seen.has(locId)) continue;
    seen.add(locId);
    try {
      out.push(await repo.getLocation(locId as Location['id']));
    } catch {
      // skip
    }
  }
  return out;
}

/** Items referenced directly by events (take/drop). */
async function itemsInvolved(
  events: readonly DomainEvent[],
  repo: Repository,
): Promise<readonly Item[]> {
  const seen = new Set<string>();
  const out: Item[] = [];
  for (const e of events) {
    if (e.kind !== EventKind.Take && e.kind !== EventKind.Drop) continue;
    if (seen.has(e.itemId)) continue;
    seen.add(e.itemId);
    try {
      out.push(await repo.getItem(e.itemId));
    } catch {
      // skip
    }
  }
  return out;
}

/** Agents referenced by events (actors, speak/attack targets). */
async function agentsInvolved(
  events: readonly DomainEvent[],
  repo: Repository,
): Promise<readonly Agent[]> {
  const seen = new Set<string>();
  const out: Agent[] = [];
  const add = async (id: AgentId): Promise<void> => {
    if (seen.has(id)) return;
    seen.add(id);
    try {
      out.push(await repo.getAgent(id));
    } catch {
      // skip
    }
  };
  for (const e of events) {
    if (e.actorId !== SYSTEM_AGENT_ID) await add(e.actorId);
    if (e.kind === EventKind.Speak || e.kind === EventKind.Attack) {
      await add(e.targetAgentId);
    }
    if (e.kind === EventKind.Emote && e.targetAgentId !== null) {
      await add(e.targetAgentId);
    }
  }
  return out;
}

async function buildUserPrompt(events: readonly DomainEvent[], repo: Repository): Promise<string> {
  const lines: string[] = ['Events that just happened:'];
  if (events.length === 0) {
    lines.push('- (none)');
  } else {
    for (const e of events) lines.push(`- ${await summarise(e, repo)}`);
  }

  const locs = await locationsInvolved(events, repo);
  if (locs.length > 0) {
    lines.push('');
    lines.push('Current stored descriptions for involved locations:');
    for (const l of locs) {
      lines.push(`- LOCATION ${l.label}`);
      lines.push(`    short: ${l.shortDescription}`);
      lines.push(`    long: ${l.longDescription}`);
    }
  }

  const items = await itemsInvolved(events, repo);
  if (items.length > 0) {
    lines.push('');
    lines.push('Current stored descriptions for involved items:');
    for (const it of items) {
      lines.push(`- ITEM ${it.label}`);
      lines.push(`    short: ${it.shortDescription}`);
      lines.push(`    long: ${it.longDescription}`);
    }
  }

  const agents = await agentsInvolved(events, repo);
  if (agents.length > 0) {
    lines.push('');
    lines.push('Current stored descriptions for involved characters:');
    for (const a of agents) {
      lines.push(`- AGENT ${a.label}`);
      lines.push(`    short: ${a.shortDescription}`);
      lines.push(`    long: ${a.longDescription}`);
    }
  }

  return lines.join('\n');
}

async function resolveTarget(
  raw: RawConsequence,
  events: readonly DomainEvent[],
  repo: Repository,
): Promise<DescriptionTarget | null> {
  if (raw.targetKind === OwnerKind.Location) {
    const locs = await locationsInvolved(events, repo);
    const needle = raw.targetRef.toLowerCase();
    const exact = locs.find((l) => l.label.toLowerCase() === needle);
    if (exact) return { kind: OwnerKind.Location, id: exact.id };
    const partial = locs.find(
      (l) => l.label.toLowerCase().includes(needle) || needle.includes(l.label.toLowerCase()),
    );
    if (partial) return { kind: OwnerKind.Location, id: partial.id };
    return null;
  }
  if (raw.targetKind === OwnerKind.Item) {
    const items = await itemsInvolved(events, repo);
    const r = resolveItem(raw.targetRef, items);
    if (!r.ok) return null;
    return { kind: OwnerKind.Item, id: r.item.id };
  }
  // agent
  const agents = await agentsInvolved(events, repo);
  const r = resolveAgent(raw.targetRef, agents);
  if (!r.ok) return null;
  return { kind: OwnerKind.Agent, id: r.agent.id };
}

export async function consequencesFor(
  events: readonly DomainEvent[],
  repo: Repository,
  llm: LanguageModel | null,
): Promise<readonly Action[]> {
  if (!llm) return [];
  if (events.length === 0) return [];

  let parsed: unknown;
  try {
    const response = await llm.complete({
      system: SYSTEM_PROMPT,
      user: await buildUserPrompt(events, repo),
      schema: CONSEQUENCE_SCHEMA,
      schemaName: CONSEQUENCE_SCHEMA_NAME,
    });
    parsed = response.parsed;
  } catch (err) {
    console.warn('[llm] consequence engine error:', err);
    return [];
  }

  const raws = parseResponse(parsed).slice(0, MAX_CONSEQUENCES_PER_PASS);
  const actions: Action[] = [];
  for (const raw of raws) {
    const target = await resolveTarget(raw, events, repo);
    if (!target) continue;
    actions.push({
      kind: ActionKind.UpdateDescription,
      actorId: SYSTEM_AGENT_ID,
      target,
      shortDescription: raw.shortDescription,
      longDescription: raw.longDescription,
    });
  }
  return actions;
}
