import type { Action, DescriptionTarget } from '@core/domain/actions';
import type { MonsterTemplate, UpsertAgentInput, UpsertExitInput, UpsertItemInput, UpsertLocationInput, WorldLore } from '@core/domain/builder-types';
import type { Agent, Item, Location } from '@core/domain/entities';
import type { DomainEvent } from '@core/domain/events';
import { asAgentId, asExitId, asItemId, asLocationId, type AgentId, type ExitId, type ItemId, type LocationId, SYSTEM_AGENT_ID, type WorldId } from '@core/domain/ids';
import { expandSpawn } from '@core/spawning/expand';
import { ActionKind, AttackOutcome, EntityKind, EventKind, OwnerKind } from '@core/domain/kinds';
import { log } from '@core/log';
import type { JsonSchema, LanguageModel } from './language-model';
import { resolveAgent, resolveItem } from './parser';
import type { HandlerRepo } from './repository';

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

const SYSTEM_PROMPT_LINES: readonly string[] = [
  'You are the consequence engine of a fantasy text adventure.',
  '',
  "Given a batch of events that just happened, decide whether the world's stored short/long descriptions should change to reflect those events durably, and whether any agent's mood should be updated. (Agents manage their own sideQuest — DO NOT touch it here.)",
  '',
  'You can emit two kinds of consequence actions: `update_description` (mutate a stored description / mood) and `reveal_item` (flip a hidden item to visible). Be conservative — most batches need no consequences. Reply with a JSON object containing a `consequences` array (possibly empty).',
  '',
  'GM-only notes: Some locations carry `GM-only notes` — secret information about hidden dynamics, things behind the wall, factional alignments the player has not learned, items waiting to be discovered, etc. ONLY YOU see these notes; the player, the narrator, and the NPC minds never do. Use the notes to inform what you reveal, spawn, or change in response to player actions. Never echo a GM-only note verbatim into a description; that would leak it. Use the notes as inspiration; surface their content only when the player has earned it through their actions.',
  '',
  'When to emit `reveal_item`:',
  '- The player disturbed, broke, or rearranged the scene in a way that would expose something previously hidden (smashing a chest, knocking over a pile, lifting a tapestry, kicking aside a rug, lighting a dark corner).',
  "- The player's narrated action contextually suggests they would now notice a specific hidden item that exists at the location.",
  '- For a reveal action, set kind="reveal_item", targetRef = the natural-language name of the hidden item the engine should reveal, targetKind="item", and the description / mood fields all null. The engine resolves targetRef against the currently-hidden items at the locations where the events happened.',
  '- Do NOT use reveal_item when a normal search already matched the hidden item; the search handler reveals it directly. Reveal is for INDIRECT discoveries — actions that incidentally expose something.',
  '',
  'When to emit `record_effect`:',
  "- Use for specific, visible physical traces that compound incrementally — a carving, a spill, a scorch mark with a particular shape, graffiti, a fresh stain. The `effect` string must describe exactly what a bystander arriving later would see (e.g. \"a crude carving reading 'Paff woz ere' scratched into the cobblestones\"; \"a spreading wine stain on the rug\"). Preserve specific names, texts, shapes, and colours verbatim — do not paraphrase.",
  '- Prefer `record_effect` for most durable changes. Traces accumulate and are shown together when a player examines the entity.',
  '',
  'When to emit a description update (`update_description`):',
  '- Only for major structural changes that make the existing description misleading or wrong — a wall collapses, a building burns to the ground, a key fixture is destroyed. This rewrites the baseline; use it sparingly.',
  "- Prefer updating the location's longDescription when the room itself is now fundamentally different.",
  '- Do NOT bake TRANSIENT state into a stored description. Transient state is anything the simulation tracks elsewhere and recomputes each turn — who is currently in the room, what items are currently lying about, who is carrying what, who is awake or asleep, current moods, current intents, current HP. The renderer surfaces all of that live; duplicating it into a stored description is wrong because the description goes stale the next turn (someone walks in or out and the description now lies). If the only thing that changed is who/what is currently somewhere, emit no consequence.',
  '',
  'When to update mood (agent target only):',
  '- After being attacked: shift toward fearful, defiant, or angry depending on outcome.',
  '- After receiving distressing news: shift toward melancholy or anxious.',
  '- After a positive interaction: shift toward warmer or more relaxed.',
  '- Routine actions do NOT change mood.',
  '',
  'sideQuest is OWNED BY THE AGENT THEMSELVES via the NPC-mind reply. Never set or clear it from a consequence. Always pass sideQuest: null on every consequence you emit (which means "leave unchanged" — the only legal value here).',
  '',
  'When NOT to emit a consequence:',
  '- Routine movement (move): people enter and leave rooms constantly; that does not change the room.',
  '- Routine looking, inventory checks, or failed actions.',
  '- Speech that does not damage anything. (Commitments and instructions in speech are NOT a consequence concern — agents handle their own intent.)',
  '- Any change you would have to invent details for that the events do not support.',
  '',
  'Output rules:',
  '- Refer to entities by short natural-language names ("the workshop", "the lantern", "Paff Pinkerton") in the targetRef field.',
  '- targetKind must be exactly one of: "location", "item", "agent".',
  '- Set shortDescription or longDescription to the new prose, or null to leave that field unchanged.',
  '- mood and sideQuest are only meaningful when targetKind is "agent". On a location or item they will be ignored.',
  '- Use null for mood/sideQuest to leave that field unchanged. Use "" (empty string) to explicitly clear it. Use a short string to set it.',
  "- A consequence must change SOMETHING — at least one of shortDescription, longDescription, mood, sideQuest must be non-null. (Empty string '' counts as a change for mood/sideQuest.)",
  '- For `update_description` prose: short, present tense, factual. Describe the new baseline state, not the event that caused it.',
  '- Maximum 3 entries in consequences.',
  '',
  'updatedStorySoFar:',
  '- Only set `updatedStorySoFar` for events that meaningfully change the campaign — a major character dying, a quest resolving, a faction shifting. Routine moves, conversations, and inventory changes leave it null.',
  '',
  'World Expansion:',
  'You may create and delete entities when events durably alter the world — a secret passage is discovered, a merchant arrives, a wall is blasted open, a building collapses.',
  '',
  'Do NOT create entities for transient events (a candle flickering, a guard walking past). Created entities persist for the rest of the session.',
  '',
  "IDs: Invent a short snake_case id prefixed by kind (loc_, agent_, item_, exit_). You may reference a just-created ID in a later action in the same batch.",
  '',
  "Spawning agents: Use create_agent with an existing templateKey from the world's monster templates. Do not invent stats. If no template fits, prefer description updates over spawning.",
  '',
  'Enriching sparse locations: When a location has empty or minimal descriptions (a newly generated stub), treat any player action there as a signal to generate full content — proper label, descriptions, atmosphere, and any items or agents that belong there. You may plant exits with to=null to suggest depth beyond the current scene.',
  '',
  "create/delete limits: No more than 3 create or delete actions per batch. Maximum 5 total consequences. When in doubt, don't create — a good description update is often better than a new entity.",
  '',
  'When to emit creative_attack:',
  "- A player or NPC used the environment creatively in a way that would realistically cause damage: shoving furniture, triggering a hazard, using a prop as a weapon, dropping something heavy.",
  '- Do NOT emit if the action is silly or physically implausible (hypnotising a troll with a spoon, invoking fire that does not exist). Implausible actions produce no consequence.',
  '- Do NOT emit if the actor already dispatched a standard attack action this turn — creative_attack is for non-attack actions that happen to cause harm.',
  '',
  'For creative_attack set:',
  "- actorRef: natural-language name of the actor (e.g. \"Paff Pinkerton\")",
  "- targetRef: natural-language name of the target (e.g. \"the orc\")",
  '- toHit: { sides: 20, threshold: N } — lower threshold = easier to hit; threshold reflects cleverness: inspired idea 4-6, solid idea 10-14, clumsy idea 16+',
  "- damage: { count, sides, bonus } — reflects physical severity: small hazard 1d4, moderate 1d6-1d8, serious 2d6",
  "- narrative: one sentence of prose describing what happened (e.g. \"Mira sweeps the candelabra into the orc's face\")",
];

const SYSTEM_PROMPT = SYSTEM_PROMPT_LINES.join('\n');

export const CONSEQUENCE_SCHEMA_NAME = 'ConsequenceResponse';

export const CONSEQUENCE_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['consequences', 'updatedStorySoFar'],
  properties: {
    updatedStorySoFar: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    consequences: {
      type: 'array',
      maxItems: 5,
      items: {
        anyOf: [
          {
            type: 'object',
            additionalProperties: false,
            required: ['kind', 'targetKind', 'targetRef', 'shortDescription', 'longDescription', 'mood', 'sideQuest'],
            properties: {
              kind: { type: 'string', enum: ['update_description'] },
              targetKind: { type: 'string', enum: ['location', 'item', 'agent'] },
              targetRef: { type: 'string' },
              shortDescription: { anyOf: [{ type: 'string' }, { type: 'null' }] },
              longDescription: { anyOf: [{ type: 'string' }, { type: 'null' }] },
              mood: { anyOf: [{ type: 'string' }, { type: 'null' }] },
              sideQuest: { anyOf: [{ type: 'string' }, { type: 'null' }] },
            },
          },
          {
            type: 'object',
            additionalProperties: false,
            required: ['kind', 'targetRef'],
            properties: {
              kind: { type: 'string', enum: ['reveal_item'] },
              targetRef: { type: 'string' },
            },
          },
          {
            type: 'object',
            additionalProperties: false,
            required: ['kind', 'actorRef', 'targetRef', 'toHit', 'damage', 'narrative'],
            properties: {
              kind: { type: 'string', enum: ['creative_attack'] },
              actorRef: { type: 'string' },
              targetRef: { type: 'string' },
              toHit: {
                type: 'object',
                additionalProperties: false,
                required: ['sides', 'threshold'],
                properties: {
                  sides: { type: 'integer', enum: [20] },
                  threshold: { type: 'integer', minimum: 1, maximum: 25 },
                },
              },
              damage: {
                type: 'object',
                additionalProperties: false,
                required: ['count', 'sides', 'bonus'],
                properties: {
                  count: { type: 'integer', minimum: 1, maximum: 6 },
                  sides: { type: 'integer', minimum: 4, maximum: 12 },
                  bonus: { type: 'integer', minimum: 0, maximum: 5 },
                },
              },
              narrative: { type: 'string', minLength: 1 },
            },
          },
          {
            type: 'object',
            additionalProperties: false,
            required: ['kind', 'targetKind', 'targetRef', 'effect'],
            properties: {
              kind: { type: 'string', enum: ['record_effect'] },
              targetKind: { type: 'string', enum: ['location', 'item', 'agent'] },
              targetRef: { type: 'string' },
              effect: { type: 'string', minLength: 1 },
            },
          },
          {
            type: 'object',
            additionalProperties: false,
            required: ['kind', 'id', 'label', 'shortDescription', 'longDescription', 'secretDescription', 'tags'],
            properties: {
              kind: { type: 'string', enum: ['create_location'] },
              id: { type: 'string' },
              label: { type: 'string' },
              shortDescription: { type: 'string' },
              longDescription: { type: 'string' },
              secretDescription: { type: 'string' },
              tags: { type: 'array', items: { type: 'string' } },
            },
          },
          {
            type: 'object',
            additionalProperties: false,
            required: ['kind', 'id', 'from', 'to', 'direction', 'label', 'locked'],
            properties: {
              kind: { type: 'string', enum: ['create_exit'] },
              id: { type: 'string' },
              from: { type: 'string' },
              to: { anyOf: [{ type: 'string' }, { type: 'null' }] },
              direction: { type: 'string' },
              label: { type: 'string' },
              locked: { type: 'boolean' },
            },
          },
          {
            type: 'object',
            additionalProperties: false,
            required: ['kind', 'templateKey', 'locationId', 'count'],
            properties: {
              kind: { type: 'string', enum: ['create_agent'] },
              templateKey: { type: 'string' },
              locationId: { type: 'string' },
              count: { type: 'integer' },
            },
          },
          {
            type: 'object',
            additionalProperties: false,
            required: ['kind', 'id', 'label', 'shortDescription', 'longDescription', 'ownerKind', 'ownerId', 'weight', 'hidden', 'tags', 'weaponDamage', 'armorDefense'],
            properties: {
              kind: { type: 'string', enum: ['create_item'] },
              id: { type: 'string' },
              label: { type: 'string' },
              shortDescription: { type: 'string' },
              longDescription: { type: 'string' },
              ownerKind: { type: 'string', enum: ['location', 'agent'] },
              ownerId: { type: 'string' },
              weight: { type: 'integer' },
              hidden: { type: 'boolean' },
              tags: { type: 'array', items: { type: 'string' } },
              weaponDamage: { type: ['number', 'null'] },
              armorDefense: { type: ['number', 'null'] },
            },
          },
          {
            type: 'object',
            additionalProperties: false,
            required: ['kind', 'targetKind', 'entityId'],
            properties: {
              kind: { type: 'string', enum: ['delete_entity'] },
              targetKind: { type: 'string', enum: ['location', 'exit', 'agent', 'item'] },
              entityId: { type: 'string' },
            },
          },
        ],
      },
    },
  },
};

/** Hard cap on consequence actions returned per pass (§12 boundedness). */
export const MAX_CONSEQUENCES_PER_PASS = 5;

/** Cap on consequence-pass recursion depth (§9 termination). */
export const MAX_CONSEQUENCE_DEPTH = 1;

export const MAX_ENTITY_TRACES = 10;

export type RawConsequence =
  | {
      readonly kind: 'update_description';
      readonly targetKind: 'location' | 'item' | 'agent';
      readonly targetRef: string;
      readonly shortDescription: string | null;
      readonly longDescription: string | null;
      readonly mood: string | null;
      readonly sideQuest: string | null;
    }
  | {
      readonly kind: 'reveal_item';
      readonly targetRef: string;
    }
  | {
      readonly kind: 'creative_attack';
      readonly actorRef: string;
      readonly targetRef: string;
      readonly toHit: { readonly sides: number; readonly threshold: number };
      readonly damage: { readonly count: number; readonly sides: number; readonly bonus: number };
      readonly narrative: string;
    }
  | {
      readonly kind: 'create_location';
      readonly id: string;
      readonly label: string;
      readonly shortDescription: string;
      readonly longDescription: string;
      readonly secretDescription: string;
      readonly tags: readonly string[];
    }
  | {
      readonly kind: 'create_exit';
      readonly id: string;
      readonly from: string;
      readonly to: string | null;
      readonly direction: string;
      readonly label: string;
      readonly locked: boolean;
    }
  | {
      readonly kind: 'create_agent';
      readonly templateKey: string;
      readonly locationId: string;
      readonly count: number;
    }
  | {
      readonly kind: 'create_item';
      readonly id: string;
      readonly label: string;
      readonly shortDescription: string;
      readonly longDescription: string;
      readonly ownerKind: 'location' | 'agent';
      readonly ownerId: string;
      readonly weight: number;
      readonly hidden: boolean;
      readonly tags: readonly string[];
      readonly weaponDamage: number | null;
      readonly armorDefense: number | null;
    }
  | {
      readonly kind: 'delete_entity';
      readonly targetKind: 'location' | 'exit' | 'agent' | 'item';
      readonly entityId: string;
    }
  | {
      readonly kind: 'record_effect';
      readonly targetKind: EntityKind;
      readonly targetRef: string;
      readonly effect: string;
    };

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export function parseConsequenceResponse(parsed: unknown): readonly RawConsequence[] {
  if (!isRecord(parsed)) return [];
  const list = parsed.consequences;
  if (!Array.isArray(list)) return [];
  const out: RawConsequence[] = [];
  for (const entry of list) {
    if (!isRecord(entry)) continue;
    const kind = entry.kind;

    if (kind === ActionKind.RevealItem) {
      const targetRef = entry.targetRef;
      if (typeof targetRef !== 'string' || targetRef.length === 0) continue;
      out.push({ kind: ActionKind.RevealItem, targetRef });
      continue;
    }

    if (kind === ActionKind.CreativeAttack) {
      const actorRef = entry.actorRef;
      const targetRef = entry.targetRef;
      const toHit = entry.toHit;
      const damage = entry.damage;
      const narrative = entry.narrative;
      if (
        typeof actorRef !== 'string' || actorRef.length === 0 ||
        typeof targetRef !== 'string' || targetRef.length === 0 ||
        typeof narrative !== 'string' || narrative.length === 0 ||
        !isRecord(toHit) || typeof toHit.sides !== 'number' || toHit.sides !== 20 || typeof toHit.threshold !== 'number' || toHit.threshold < 1 ||
        !isRecord(damage) || typeof damage.count !== 'number' || damage.count < 1 || typeof damage.sides !== 'number' || damage.sides < 4 || typeof damage.bonus !== 'number' || damage.bonus < 0
      ) continue;
      out.push({
        kind: ActionKind.CreativeAttack,
        actorRef,
        targetRef,
        toHit: { sides: toHit.sides, threshold: toHit.threshold },
        damage: { count: damage.count, sides: damage.sides, bonus: damage.bonus },
        narrative,
      });
      continue;
    }

    if (kind === ActionKind.CreateLocation) {
      const id = entry.id;
      const label = entry.label;
      const short = entry.shortDescription;
      const long = entry.longDescription;
      const secret = entry.secretDescription ?? '';
      const tags = Array.isArray(entry.tags) ? (entry.tags as string[]) : [];
      if (typeof id !== 'string' || typeof label !== 'string' || typeof short !== 'string' || typeof long !== 'string') {
        console.warn('[consequence] create_location missing required fields; dropping');
        continue;
      }
      out.push({ kind: ActionKind.CreateLocation, id, label, shortDescription: short, longDescription: long, secretDescription: typeof secret === 'string' ? secret : '', tags });
      continue;
    }

    if (kind === ActionKind.CreateExit) {
      const id = entry.id;
      const from = entry.from;
      const to = entry.to ?? null;
      const direction = entry.direction;
      const label = entry.label ?? '';
      const locked = Boolean(entry.locked);
      if (typeof id !== 'string' || typeof from !== 'string' || typeof direction !== 'string') {
        console.warn('[consequence] create_exit missing required fields; dropping');
        continue;
      }
      if (to !== null && typeof to !== 'string') continue;
      out.push({ kind: ActionKind.CreateExit, id, from, to: typeof to === 'string' ? to : null, direction, label: typeof label === 'string' ? label : '', locked });
      continue;
    }

    if (kind === ActionKind.CreateAgent) {
      const templateKey = entry.templateKey;
      const locationId = entry.locationId;
      const count = typeof entry.count === 'number' ? Math.max(1, Math.floor(entry.count)) : 1;
      if (typeof templateKey !== 'string' || typeof locationId !== 'string') {
        console.warn('[consequence] create_agent missing templateKey or locationId; dropping');
        continue;
      }
      out.push({ kind: ActionKind.CreateAgent, templateKey, locationId, count });
      continue;
    }

    if (kind === ActionKind.CreateItem) {
      const id = entry.id;
      const label = entry.label;
      const short = entry.shortDescription;
      const long = entry.longDescription;
      const ownerKind = entry.ownerKind;
      const ownerId = entry.ownerId;
      const weight = typeof entry.weight === 'number' ? entry.weight : 0;
      const hidden = Boolean(entry.hidden);
      const tags = Array.isArray(entry.tags) ? (entry.tags as string[]) : [];
      if (typeof id !== 'string' || typeof label !== 'string' || typeof short !== 'string' || typeof long !== 'string' || typeof ownerId !== 'string') {
        console.warn('[consequence] create_item missing required fields; dropping');
        continue;
      }
      if (ownerKind !== OwnerKind.Location && ownerKind !== OwnerKind.Agent) continue;
      const weaponDamage = typeof entry.weaponDamage === 'number' ? entry.weaponDamage : null;
      const armorDefense = typeof entry.armorDefense === 'number' ? entry.armorDefense : null;
      out.push({ kind: ActionKind.CreateItem, id, label, shortDescription: short, longDescription: long, ownerKind, ownerId, weight, hidden, tags, weaponDamage, armorDefense });
      continue;
    }

    if (kind === ActionKind.DeleteEntity) {
      const targetKind = entry.targetKind;
      const entityId = entry.entityId;
      if (typeof entityId !== 'string' || entityId.length === 0) continue;
      if (targetKind !== 'location' && targetKind !== 'exit' && targetKind !== 'agent' && targetKind !== 'item') continue;
      out.push({ kind: ActionKind.DeleteEntity, targetKind, entityId });
      continue;
    }

    if (kind === ActionKind.RecordEffect) {
      const targetKind = entry.targetKind as EntityKind;
      const targetRef = entry.targetRef as string;
      const effect = entry.effect as string;
      if (
        targetKind !== EntityKind.Location && targetKind !== EntityKind.Agent && targetKind !== EntityKind.Item
      ) continue;
      if (typeof targetRef !== 'string' || targetRef.length === 0) continue;
      if (typeof effect !== 'string' || effect.length === 0) continue;
      out.push({ kind: ActionKind.RecordEffect, targetKind, targetRef, effect });
      continue;
    }

    if (kind !== ActionKind.UpdateDescription) continue;
    const targetKind = entry.targetKind;
    if (targetKind !== OwnerKind.Location && targetKind !== OwnerKind.Item && targetKind !== OwnerKind.Agent) continue;
    const targetRef = entry.targetRef;
    if (typeof targetRef !== 'string' || targetRef.length === 0) continue;
    const shortDescription = entry.shortDescription;
    const longDescription = entry.longDescription;
    if (shortDescription !== null && typeof shortDescription !== 'string') continue;
    if (longDescription !== null && typeof longDescription !== 'string') continue;
    const moodRaw = 'mood' in entry ? entry.mood : null;
    if (moodRaw !== null && typeof moodRaw !== 'string') continue;
    const isAgent = targetKind === OwnerKind.Agent;
    const mood = isAgent ? (moodRaw as string | null) : null;
    const sideQuest = null;
    const agentSideChange = isAgent && mood !== null;
    if (shortDescription === null && longDescription === null && !agentSideChange) continue;
    out.push({ kind: ActionKind.UpdateDescription, targetKind, targetRef, shortDescription, longDescription, mood, sideQuest });
  }
  return out;
}

async function applyWorldExpansion(
  raws: readonly RawConsequence[],
  lore: ConsequenceLoreSink,
  playerLocationId: string,
): Promise<void> {
  const mintedLocationIds = new Set<string>();

  // Step 1: create_location
  for (const raw of raws) {
    if (raw.kind !== ActionKind.CreateLocation) continue;
    try {
      await lore.builderRepo.upsertLocation(lore.worldId, {
        id: asLocationId(raw.id),
        label: raw.label,
        shortDescription: raw.shortDescription,
        longDescription: raw.longDescription,
        secretDescription: raw.secretDescription,
        tags: [...raw.tags],
      });
      mintedLocationIds.add(raw.id);
    } catch (err) {
      log.warn(`[consequence] create_location ${raw.id} failed: ${String(err)}`);
    }
  }

  // Step 2: create_item and create_agent
  const templates = await lore.builderRepo.listMonsterTemplates(lore.worldId);
  const templateByKey = new Map(templates.map((t: MonsterTemplate) => [t.templateKey, t]));

  for (const raw of raws) {
    if (raw.kind === ActionKind.CreateItem) {
      if (raw.ownerKind !== OwnerKind.Location && raw.ownerKind !== OwnerKind.Agent) continue;
      try {
        await lore.builderRepo.upsertItem(lore.worldId, {
          id: asItemId(raw.id),
          label: raw.label,
          shortDescription: raw.shortDescription,
          longDescription: raw.longDescription,
          ownerKind: raw.ownerKind,
          ownerId: raw.ownerId,
          weight: raw.weight,
          hidden: raw.hidden,
          tags: [...raw.tags],
          container: false,
          opened: true,
          locked: false,
          lockedByItem: null,
          priceTag: null,
          weaponDamage: raw.weaponDamage,
          armorDefense: raw.armorDefense,
        });
      } catch (err) {
        log.warn(`[consequence] create_item ${raw.id} failed: ${String(err)}`);
      }
    }

    if (raw.kind === ActionKind.CreateAgent) {
      const template = templateByKey.get(raw.templateKey);
      if (!template) {
        log.warn(`[consequence] create_agent: no template with key "${raw.templateKey}"; dropping`);
        continue;
      }
      const result = expandSpawn({
        template,
        locationId: asLocationId(raw.locationId),
        count: raw.count,
      });
      for (const input of result.agents) {
        try {
          await lore.builderRepo.upsertAgent(lore.worldId, input);
        } catch (err) {
          log.warn(`[consequence] create_agent upsert failed: ${String(err)}`);
        }
      }
      for (const item of result.items) {
        try {
          await lore.builderRepo.upsertItem(lore.worldId, item);
        } catch (err) {
          log.warn(`[consequence] create_agent item upsert failed: ${String(err)}`);
        }
      }
    }
  }

  // Step 3: create_exit
  for (const raw of raws) {
    if (raw.kind !== ActionKind.CreateExit) continue;
    const fromExists = mintedLocationIds.has(raw.from) || await locationExistsInLive(raw.from, lore);
    if (!fromExists) {
      log.warn(`[consequence] create_exit: from "${raw.from}" not found; dropping`);
      continue;
    }
    if (raw.to !== null) {
      const toExists = mintedLocationIds.has(raw.to) || await locationExistsInLive(raw.to, lore);
      if (!toExists) {
        log.warn(`[consequence] create_exit: to "${raw.to}" not found; dropping`);
        continue;
      }
    }
    try {
      await lore.builderRepo.upsertExit(lore.worldId, {
        id: asExitId(raw.id),
        from: asLocationId(raw.from),
        to: raw.to ? asLocationId(raw.to) : null,
        direction: raw.direction,
        label: raw.label,
        locked: raw.locked,
        lockedByItem: null,
      });
    } catch (err) {
      log.warn(`[consequence] create_exit ${raw.id} failed: ${String(err)}`);
    }
  }

  // Step 4: delete_entity
  for (const raw of raws) {
    if (raw.kind !== ActionKind.DeleteEntity) continue;
    if (raw.targetKind === 'location' && raw.entityId === playerLocationId) {
      log.warn(`[consequence] delete_entity: refusing to delete player's current location; dropping`);
      continue;
    }
    try {
      if (raw.targetKind === 'location') {
        await lore.builderRepo.deleteLocation(lore.worldId, asLocationId(raw.entityId));
      } else if (raw.targetKind === 'exit') {
        await lore.builderRepo.deleteExit(lore.worldId, asExitId(raw.entityId));
      } else if (raw.targetKind === 'agent') {
        await lore.builderRepo.deleteAgent(lore.worldId, asAgentId(raw.entityId));
      } else if (raw.targetKind === 'item') {
        await lore.builderRepo.deleteItem(lore.worldId, asItemId(raw.entityId));
      }
    } catch (err) {
      log.warn(`[consequence] delete_entity ${raw.entityId} failed: ${String(err)}`);
    }
  }
}

async function locationExistsInLive(id: string, lore: ConsequenceLoreSink): Promise<boolean> {
  try {
    const locs = await lore.builderRepo.listLocations(lore.worldId);
    return locs.some((l: Location) => (l.id as string) === id);
  } catch {
    return false;
  }
}

async function summarise(event: DomainEvent, repo: HandlerRepo): Promise<string> {
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
    case EventKind.Give: {
      const actor = await labelOf(event.actorId);
      const recipient = await labelOf(event.targetAgentId);
      try {
        const item = await repo.getItem(event.itemId);
        return `${actor} gave the ${item.label} to ${recipient}`;
      } catch {
        return `${actor} gave an item to ${recipient}`;
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
      if (event.targetAgentId === null) {
        return `${actor} said "${event.utterance}" (to no one in particular)`;
      }
      const target = await labelOf(event.targetAgentId);
      return `${actor} said "${event.utterance}" to ${target}`;
    }
    case EventKind.Emote: {
      const actor = await labelOf(event.actorId);
      if (event.targetAgentId === null) {
        return `${actor} ${event.description}`;
      }
      const target = await labelOf(event.targetAgentId);
      return `${actor} ${event.description} at ${target}`;
    }
    case EventKind.Attack: {
      const actor = await labelOf(event.actorId);
      const target = await labelOf(event.targetAgentId);
      const dmg = event.outcome === AttackOutcome.Hit ? `, ${event.damageDealt} dmg` : '';
      return `${actor} attacked ${target} (${event.outcome}${dmg})`;
    }
    case EventKind.CreativeAttack: {
      const actor = await labelOf(event.actorId);
      const target = await labelOf(event.targetAgentId);
      const dmg = event.outcome === AttackOutcome.Hit ? `, ${event.damageDealt} dmg` : '';
      return `${actor} ${event.narrative} (${event.outcome}${dmg}) against ${target}`;
    }
    case EventKind.DescriptionUpdated: {
      const actor = await labelOf(event.actorId);
      return `${actor} updated a description (${event.target.kind})`;
    }
    case EventKind.AgentSpawned: {
      const spawned = await labelOf(event.spawnedAgentId);
      return `${spawned} appeared`;
    }
    case EventKind.Equip: {
      const actor = await labelOf(event.actorId);
      try {
        const item = await repo.getItem(event.itemId);
        return `${actor} ${event.manner} the ${item.label}`;
      } catch {
        return `${actor} equipped an item`;
      }
    }
    case EventKind.Unequip: {
      const actor = await labelOf(event.actorId);
      try {
        const item = await repo.getItem(event.itemId);
        return `${actor} ${event.manner} the ${item.label}`;
      } catch {
        return `${actor} unequipped an item`;
      }
    }
    case EventKind.Reveal: {
      try {
        const item = await repo.getItem(event.itemId);
        return `${item.label} became visible`;
      } catch {
        return 'a hidden item became visible';
      }
    }
    case EventKind.Open: {
      const actor = await labelOf(event.actorId);
      try {
        const item = await repo.getItem(event.itemId);
        return event.unlocked
          ? `${actor} unlocked and opened the ${item.label}`
          : `${actor} opened the ${item.label}`;
      } catch {
        return `${actor} opened a container`;
      }
    }
    case EventKind.Close: {
      const actor = await labelOf(event.actorId);
      try {
        const item = await repo.getItem(event.itemId);
        return `${actor} closed the ${item.label}`;
      } catch {
        return `${actor} closed a container`;
      }
    }
    case EventKind.Trade: {
      const buyerLabel = await labelOf(event.buyerId);
      const sellerLabel = await labelOf(event.sellerId);
      let itemLabel: string;
      try {
        itemLabel = (await repo.getItem(event.itemId)).label;
      } catch {
        itemLabel = event.itemId;
      }
      return event.accepted
        ? `${buyerLabel} bought the ${itemLabel} from ${sellerLabel} for ${event.price} gold`
        : `${sellerLabel} refused to sell the ${itemLabel} to ${buyerLabel} for ${event.price} gold`;
    }
  }
}

/** Distinct location ids referenced by a batch of events, in order. */
async function locationsInvolved(
  events: readonly DomainEvent[],
  repo: HandlerRepo,
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
  repo: HandlerRepo,
): Promise<readonly Item[]> {
  const seen = new Set<string>();
  const out: Item[] = [];
  for (const e of events) {
    if (e.kind !== EventKind.Take && e.kind !== EventKind.Drop && e.kind !== EventKind.Give)
      continue;
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
  repo: HandlerRepo,
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
    if (e.kind === EventKind.Attack || e.kind === EventKind.CreativeAttack || e.kind === EventKind.Give) {
      await add(e.targetAgentId);
    }
    if ((e.kind === EventKind.Speak || e.kind === EventKind.Emote) && e.targetAgentId !== null) {
      await add(e.targetAgentId);
    }
  }
  return out;
}

async function buildUserPrompt(events: readonly DomainEvent[], repo: HandlerRepo): Promise<string> {
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
      // GM-only secret notes. Surfaced ONLY to the consequence engine; the
      // player, narrator, and NPC minds never see this. Use these to inform
      // hidden dynamics — what's behind the wall, who's secretly involved,
      // what the room contains that no one's discovered yet.
      if (l.secretDescription && l.secretDescription.length > 0) {
        lines.push(`    GM-only notes: ${l.secretDescription}`);
      }
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
      lines.push(`    mood: ${a.mood ?? '(none)'}`);
      if (a.secretDescription && a.secretDescription.length > 0) {
        lines.push(`    GM-only notes: ${a.secretDescription}`);
      }
    }
  }

  return lines.join('\n');
}

/** Pre-fetched entity data for the pure resolve phases. */
export interface ConsequenceContext {
  readonly locations: readonly Location[];
  readonly items: readonly Item[];
  readonly agents: readonly Agent[];
  readonly hiddenItems: readonly Item[];
}

/** Build a ConsequenceContext by fetching all entities referenced by the events. */
export async function buildConsequenceContext(
  events: readonly DomainEvent[],
  repo: HandlerRepo,
): Promise<ConsequenceContext> {
  const locations = await locationsInvolved(events, repo);
  const items = await itemsInvolved(events, repo);
  const agents = await agentsInvolved(events, repo);
  const hiddenItems: Item[] = [];
  for (const loc of locations) {
    const at = await repo.itemsOwnedBy({ kind: OwnerKind.Location, id: loc.id });
    for (const it of at) {
      if (it.hidden) hiddenItems.push(it);
    }
  }
  return { locations, items, agents, hiddenItems };
}

/** Pure: resolve an update_description target ref against pre-fetched context. */
export function resolveConsequenceTarget(
  raw: Extract<RawConsequence, { kind: 'update_description' }>,
  ctx: ConsequenceContext,
): DescriptionTarget | null {
  if (raw.targetKind === OwnerKind.Location) {
    const needle = raw.targetRef.toLowerCase();
    const exact = ctx.locations.find((l) => l.label.toLowerCase() === needle);
    if (exact) return { kind: OwnerKind.Location, id: exact.id };
    const partial = ctx.locations.find(
      (l) => l.label.toLowerCase().includes(needle) || needle.includes(l.label.toLowerCase()),
    );
    return partial ? { kind: OwnerKind.Location, id: partial.id } : null;
  }
  if (raw.targetKind === OwnerKind.Item) {
    const r = resolveItem(raw.targetRef, ctx.items);
    return r.ok ? { kind: OwnerKind.Item, id: r.item.id } : null;
  }
  // agent
  const r = resolveAgent(raw.targetRef, ctx.agents);
  if (!r.ok) return null;
  // The synthetic system agent is bookkeeping, not a character. Never mutate it.
  if (r.agent.id === SYSTEM_AGENT_ID) return null;
  return { kind: OwnerKind.Agent, id: r.agent.id };
}

/** Pure: find a hidden item by name ref against pre-fetched context. */
export function resolveHiddenConsequenceItem(targetRef: string, ctx: ConsequenceContext): Item | null {
  const r = resolveItem(targetRef, ctx.hiddenItems);
  return r.ok ? r.item : null;
}

/** Narrow write interface: only the methods the consequence engine actually calls. */
export interface WorldExpansionSink {
  upsertLocation(worldId: WorldId, input: UpsertLocationInput): Promise<void>;
  upsertExit(worldId: WorldId, input: UpsertExitInput): Promise<void>;
  upsertItem(worldId: WorldId, input: UpsertItemInput): Promise<void>;
  upsertAgent(worldId: WorldId, input: UpsertAgentInput): Promise<void>;
  deleteLocation(worldId: WorldId, id: LocationId): Promise<void>;
  deleteExit(worldId: WorldId, id: ExitId): Promise<void>;
  deleteItem(worldId: WorldId, id: ItemId): Promise<void>;
  deleteAgent(worldId: WorldId, id: AgentId): Promise<void>;
  listMonsterTemplates(worldId: WorldId): Promise<readonly MonsterTemplate[]>;
  listLocations(worldId: WorldId): Promise<readonly Location[]>;
  readWorldLore(worldId: WorldId): Promise<WorldLore>;
  writeWorldLore(worldId: WorldId, lore: Omit<WorldLore, 'worldId'>): Promise<void>;
}

export interface ConsequenceLoreSink {
  readonly builderRepo: WorldExpansionSink;
  readonly worldId: WorldId;
}

export async function consequencesFor(
  events: readonly DomainEvent[],
  repo: HandlerRepo,
  llm: LanguageModel | null,
  lore?: ConsequenceLoreSink,
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
    log.warn(`[llm] consequence engine error: ${String(err)}`);
    return [];
  }

  if (lore && isRecord(parsed)) {
    const updated = parsed.updatedStorySoFar;
    if (updated !== null && typeof updated === 'string') {
      try {
        const current = await lore.builderRepo.readWorldLore(lore.worldId);
        await lore.builderRepo.writeWorldLore(lore.worldId, {
          worldOverview: current.worldOverview,
          storySoFar: updated,
        });
      } catch (err) {
        log.warn(`[consequence] failed to write updatedStorySoFar: ${String(err)}`);
      }
    }
  }

  const raws = parseConsequenceResponse(parsed).slice(0, MAX_CONSEQUENCES_PER_PASS);

  // Pre-fetch entity context once — used by both resolve phases below.
  const ctx = await buildConsequenceContext(events, repo);

  // Execute create/delete actions via builderRepo before returning domain actions.
  if (lore) {
    try {
      const playerLocId = (ctx.locations[0]?.id ?? SYSTEM_AGENT_ID) as string;
      await applyWorldExpansion(raws, lore, playerLocId);
    } catch (err) {
      log.warn(`[consequence] applyWorldExpansion error: ${String(err)}`);
    }
  }

  for (const raw of raws) {
    if (raw.kind !== ActionKind.RecordEffect) continue;
    const target = resolveConsequenceTarget(
      {
        kind: ActionKind.UpdateDescription,
        targetKind: raw.targetKind,
        targetRef: raw.targetRef,
        shortDescription: null,
        longDescription: null,
        mood: null,
        sideQuest: null,
      },
      ctx,
    );
    if (!target) continue;
    try {
      await repo.recordEntityTrace(target.kind as EntityKind, target.id, raw.effect);
    } catch (err) {
      log.warn(`[consequence] record_effect failed: ${String(err)}`);
    }
  }

  const actions: Action[] = [];
  for (const raw of raws) {
    if (raw.kind === ActionKind.RevealItem) {
      const item = resolveHiddenConsequenceItem(raw.targetRef, ctx);
      if (!item) continue;
      actions.push({ kind: ActionKind.RevealItem, actorId: SYSTEM_AGENT_ID, itemId: item.id });
      continue;
    }
    if (raw.kind === ActionKind.CreativeAttack) {
      const actor = resolveAgent(raw.actorRef, ctx.agents);
      const target = resolveAgent(raw.targetRef, ctx.agents);
      if (!actor.ok || !target.ok) continue;
      actions.push({
        kind: ActionKind.CreativeAttack,
        actorId: actor.agent.id,
        targetAgentId: target.agent.id,
        toHit: raw.toHit,
        damage: raw.damage,
        narrative: raw.narrative,
      });
      continue;
    }
    if (raw.kind !== ActionKind.UpdateDescription) continue;
    const target = resolveConsequenceTarget(raw, ctx);
    if (!target) continue;
    actions.push({
      kind: ActionKind.UpdateDescription,
      actorId: SYSTEM_AGENT_ID,
      target,
      shortDescription: raw.shortDescription,
      longDescription: raw.longDescription,
      mood: raw.mood,
      sideQuest: raw.sideQuest,
    });
  }
  return actions;
}
