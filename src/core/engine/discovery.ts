import type {
  DiscoveryRequest,
  DiscoveryResponse,
  UpsertAgentInput,
  UpsertItemInput,
} from '@core/domain/builder-types';
import type { AgentId, ItemId } from '@core/domain/ids';
import { log } from '@core/log';
import type { JsonSchema, LanguageModel } from './language-model';

/**
 * Generative discovery pass (Lore & Generative Discovery §Task 12).
 *
 * Pure-core: this function only calls the injected LanguageModel. It builds
 * a subject-aware prompt and asks the model to choose one of four outcomes:
 *
 *   1. MATCH    — the player's query refers to an existing visible item or
 *                  agent. Return its id in matchedItemId / matchedAgentId.
 *   2. NARRATE  — purely flavour. narration only, all other fields null.
 *   3. SPAWN ITEM  — invent a brand new item and return its UpsertItemInput.
 *   4. SPAWN AGENT — invent a brand new agent and return its UpsertAgentInput.
 *
 * The dispatcher (Task 13) is responsible for validating matched ids against
 * the visible list and for actually persisting spawned entities. runDiscovery
 * itself performs no validation beyond shape-coercion.
 */

const SYSTEM_PROMPT_LINES: readonly string[] = [
  'You are the generative discovery engine of a fantasy text adventure.',
  '',
  'The player has issued a look or search query that did not match anything obvious. Your job is to decide what they perceive, choosing ONE of four valid outcomes:',
  '',
  '1. MATCH — if their query clearly refers to one of the visible items or agents listed below, OR to one of the HIDDEN items at the location (only if the query specifically describes that hidden item), return its id in `matchedItemId` or `matchedAgentId`. Leave `narration` empty and the other fields null. The engine will then route through the normal `look <entity>` path; if a hidden item was matched, it is revealed for future turns.',
  '2. NARRATE — pure flavour. Describe what the player perceives but do not introduce any new persistent entity. Set `narration` to a short, grounded sentence or two. Leave all other fields null.',
  '3. SPAWN ITEM — invent a small, plausible new item that fits the location and the world. Populate `spawnedItem` with a complete UpsertItemInput-shaped object and write narration that introduces it.',
  '4. SPAWN AGENT — invent a small, plausible new agent (a creature, a passer-by, a member of the staff or faction the location is known for) that fits the location and world. Populate `spawnedAgent` with a complete UpsertAgentInput-shaped object and write narration that introduces them.',
  '',
  'Exactly ONE of: matchedItemId, matchedAgentId, spawnedItem, spawnedAgent may be non-null. All four must be set to null in the NARRATE case.',
  '',
  'How to choose:',
  '- If the query is broad atmosphere ("what does the room feel like", "look around"), prefer NARRATE.',
  '- If the query explicitly asks about PEOPLE or CREATURES ("who is here?", "any staff?", "is anyone behind the bar?", "any guards?") AND the location\'s tag-lore descriptions mention an inhabitant class (staff, patrols, faction members, vermin, etc.) that is NOT already in the visible characters list, you SHOULD SPAWN AGENT — invent one such inhabitant. Do not fall back to NARRATE in this case; the player is explicitly asking to encounter someone.',
  '- If the query explicitly asks about OBJECTS ("what\'s on the shelves?", "anything hidden in the corner?") and the lore invites concrete props, prefer SPAWN ITEM over NARRATE.',
  "- Spawned agents and items become permanent parts of the world; spawn them only when they fit the lore and the player's query genuinely invites them. Never contradict the world overview, story so far, or tag descriptions.",
  '',
  'If a SUBJECT is supplied, the player is examining that specific entity — augment its existing descriptions with additional detail or atmosphere, do NOT invent a replacement entity that occupies the same conceptual slot.',
  '',
  'When spawning, the `id` must be a fresh snake_case identifier (e.g. `agt_tiefling_barkeep`, `itm_brass_lantern`); the `ownerKind`/`ownerId` for items and the `locationId` for agents must reference the current location (use the location id from the user prompt context). Tags should be drawn from the tag-lore listed for this location where they fit.',
  '',
  'All five fields (`narration`, `matchedItemId`, `matchedAgentId`, `spawnedItem`, `spawnedAgent`) must be present in the response. Use null for any field you are not using.',
];

const SYSTEM_PROMPT = SYSTEM_PROMPT_LINES.join('\n');

export const DISCOVERY_SCHEMA_NAME = 'discovery_response';

// OpenAI strict mode requires every property in `properties` to appear in
// `required`, and every nested object (including nullable ones) to set
// `additionalProperties: false`. Nullable fields use a tuple `type` of
// `[<base>, 'null']` so the model can choose to emit `null`.
const SPAWNED_ITEM_SCHEMA: JsonSchema = {
  type: ['object', 'null'],
  additionalProperties: false,
  required: [
    'id',
    'label',
    'shortDescription',
    'longDescription',
    'ownerKind',
    'ownerId',
    'weight',
    'hidden',
    'tags',
  ],
  properties: {
    id: { type: 'string' },
    label: { type: 'string' },
    shortDescription: { type: 'string' },
    longDescription: { type: 'string' },
    ownerKind: { type: 'string', enum: ['location', 'agent', 'item'] },
    ownerId: { type: 'string' },
    weight: { type: 'number' },
    hidden: { type: 'boolean' },
    tags: { type: 'array', items: { type: 'string' } },
  },
};

const SPAWNED_AGENT_SCHEMA: JsonSchema = {
  type: ['object', 'null'],
  additionalProperties: false,
  required: [
    'id',
    'label',
    'shortDescription',
    'longDescription',
    'locationId',
    'hp',
    'damage',
    'defense',
    'capacity',
    'mood',
    'goal',
    'autonomous',
    'gold',
    'tags',
  ],
  properties: {
    id: { type: 'string' },
    label: { type: 'string' },
    shortDescription: { type: 'string' },
    longDescription: { type: 'string' },
    locationId: { type: 'string' },
    hp: { type: 'number' },
    damage: { type: 'number' },
    defense: { type: 'number' },
    capacity: { type: 'number' },
    mood: { type: ['string', 'null'] },
    goal: { type: ['string', 'null'] },
    autonomous: { type: 'boolean' },
    gold: { type: 'number' },
    tags: { type: 'array', items: { type: 'string' } },
  },
};

export const DISCOVERY_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['narration', 'matchedItemId', 'matchedAgentId', 'spawnedItem', 'spawnedAgent'],
  properties: {
    narration: { type: 'string' },
    matchedItemId: { type: ['string', 'null'] },
    matchedAgentId: { type: ['string', 'null'] },
    spawnedItem: SPAWNED_ITEM_SCHEMA,
    spawnedAgent: SPAWNED_AGENT_SCHEMA,
  },
};

const FALLBACK_RESPONSE: DiscoveryResponse = {
  narration: 'You find nothing of note.',
  matchedItemId: null,
  matchedAgentId: null,
  spawnedItem: null,
  spawnedAgent: null,
};

function buildUserPrompt(req: DiscoveryRequest): string {
  const lines: string[] = [];
  lines.push('World overview:');
  lines.push(req.loreContext.worldOverview || '(none)');
  lines.push('');
  lines.push('Story so far:');
  lines.push(req.loreContext.storySoFar || '(none)');

  const tagEntries = Object.entries(req.loreContext.tagDescriptions);
  if (tagEntries.length > 0) {
    lines.push('');
    lines.push('Relevant tag lore:');
    for (const [tag, desc] of tagEntries) {
      lines.push(`- ${tag}: ${desc}`);
    }
  }

  lines.push('');
  lines.push(`Trigger: ${req.trigger}`);
  lines.push(`Current location id: ${req.locationId}`);
  lines.push(`Player query: ${req.query}`);

  if (req.subject !== null) {
    lines.push('');
    lines.push(`Subject (${req.subject.kind}):`);
    lines.push(`  label: ${req.subject.label}`);
    lines.push(`  short: ${req.subject.shortDescription}`);
    lines.push(`  long: ${req.subject.longDescription}`);
    lines.push('Augment this subject — do not invent a replacement entity for the same slot.');
  }

  lines.push('');
  lines.push('Visible items in the current location:');
  if (req.visibleItems.length === 0) {
    lines.push('  (none)');
  } else {
    for (const it of req.visibleItems) {
      lines.push(`- ${it.id} | ${it.label} — ${it.shortDescription}`);
    }
  }

  lines.push('');
  lines.push('Visible characters in the current location:');
  if (req.visibleAgents.length === 0) {
    lines.push('  (none)');
  } else {
    for (const a of req.visibleAgents) {
      lines.push(`- ${a.id} | ${a.label} — ${a.shortDescription}`);
    }
  }

  if (req.undiscoveredItems.length > 0) {
    lines.push('');
    lines.push(
      "Hidden items at this location (the player cannot see these unless they search for them — match one via matchedItemId ONLY if the player's query specifically describes or asks for it; do NOT spawn a duplicate):",
    );
    for (const it of req.undiscoveredItems) {
      lines.push(`- ${it.id} | ${it.label} — ${it.shortDescription}`);
    }
  }

  return lines.join('\n');
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function coerceResponse(parsed: unknown): DiscoveryResponse | null {
  if (!isRecord(parsed)) return null;
  const narration = parsed.narration;
  if (typeof narration !== 'string') return null;
  const matchedItemId =
    typeof parsed.matchedItemId === 'string' ? (parsed.matchedItemId as ItemId) : null;
  const matchedAgentId =
    typeof parsed.matchedAgentId === 'string' ? (parsed.matchedAgentId as AgentId) : null;
  const spawnedItem = isRecord(parsed.spawnedItem)
    ? (parsed.spawnedItem as unknown as UpsertItemInput)
    : null;
  const spawnedAgent = isRecord(parsed.spawnedAgent)
    ? (parsed.spawnedAgent as unknown as UpsertAgentInput)
    : null;
  return { narration, matchedItemId, matchedAgentId, spawnedItem, spawnedAgent };
}

export async function runDiscovery(
  req: DiscoveryRequest,
  llm: LanguageModel,
): Promise<DiscoveryResponse> {
  try {
    const response = await llm.complete({
      system: SYSTEM_PROMPT,
      user: buildUserPrompt(req),
      schema: DISCOVERY_SCHEMA,
      schemaName: DISCOVERY_SCHEMA_NAME,
    });
    const coerced = coerceResponse(response.parsed);
    if (!coerced) {
      log.warn('[llm] discovery: malformed response, using fallback');
      return FALLBACK_RESPONSE;
    }
    return coerced;
  } catch (err) {
    log.warn(`[llm] discovery error: ${String(err)}`);
    return FALLBACK_RESPONSE;
  }
}
