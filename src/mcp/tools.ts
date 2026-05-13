import {
  createWorld,
  deleteAgent,
  deleteExit,
  deleteItem,
  deleteLocation,
  deleteLocationSpawnTrigger,
  deleteMonsterTemplate,
  deleteTagLore,
  getWorldLore,
  getWorldTree,
  listWorlds,
  updateWorldLore,
  upsertAgent,
  upsertExit,
  upsertItem,
  upsertLocation,
  upsertLocationSpawnTrigger,
  upsertMonsterTemplate,
  upsertTagLore,
} from '@core/builder/index';
import type { BuilderRepository } from '@core/builder/repository';
import { validateWorld } from '@core/builder/validate';
import { StarterPackEntryKind } from '@core/domain/builder-kinds';
import {
  asAgentId,
  asExitId,
  asItemId,
  asLocationId,
  asMonsterTemplateId,
  asSpawnTriggerId,
  asTagLoreId,
  asWorldId,
} from '@core/domain/ids';
import type { OwnerKind } from '@core/domain/kinds';

import { AGENT_EXCLUDED_TOOL_NAMES } from './agent-excluded-tools';

/**
 * The MCP tool surface. Each entry is a thin wrapper around a builder facade
 * function. The server (server.ts) registers these against an MCP server.
 *
 * Tool input schemas are JSON Schema; outputs are the `Result<T, BuilderError>`
 * shape verbatim, so a calling AI can act on `ok: false` directly.
 *
 * NOTE: Load / Save / Reset starting-state ops are intentionally NOT exposed
 * via MCP — they're wholesale wipes of authored or gameplay state. They live
 * only in the admin UI (with confirmation modals).
 */
export interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run: (repo: BuilderRepository, args: Record<string, unknown>) => Promise<unknown>;
}

const stringField = (description: string) => ({ type: 'string', description });

const tagsField = {
  type: 'array',
  items: { type: 'string' },
  description: 'tag names — must already exist as tag_lore rows on the world',
};

/** OpenAI tool calling requires `items` on every array schema. */
const startingItemsField = {
  type: 'array',
  description:
    'Inline starter items for this template. Use kind "inline" with label, descriptions, weight, and hidden.',
  items: {
    type: 'object',
    properties: {
      kind: { type: 'string', enum: [StarterPackEntryKind.Inline] },
      label: stringField('item label'),
      shortDescription: stringField('short description'),
      longDescription: stringField('long description'),
      weight: { type: 'number', description: 'inventory weight' },
      hidden: { type: 'boolean', description: 'whether the item starts hidden' },
    },
    required: ['kind', 'label', 'shortDescription', 'longDescription', 'weight', 'hidden'],
  },
};

const readTags = (a: Record<string, unknown>): readonly string[] =>
  Array.isArray(a.tags) ? (a.tags as string[]) : [];

export const TOOLS: readonly ToolDef[] = [
  {
    name: 'list_worlds',
    description: 'List all draft and live worlds.',
    inputSchema: { type: 'object', properties: {} },
    run: (repo) => listWorlds(repo),
  },
  {
    name: 'get_world',
    description: 'Return the full tree (locations, exits, items, agents) for a world.',
    inputSchema: {
      type: 'object',
      properties: { id: stringField('world id') },
      required: ['id'],
    },
    run: (repo, a) => getWorldTree(repo, asWorldId(a.id as string)),
  },
  {
    name: 'create_world',
    description:
      'Create a new world. Produces a paired scratch (Draft) and live world with an empty starting-state snapshot. Returns the scratch id — that is what the admin opens for authoring.',
    inputSchema: {
      type: 'object',
      properties: {
        displayName: stringField('display name'),
        label: stringField('short label'),
      },
      required: ['displayName', 'label'],
    },
    run: (repo, a) =>
      createWorld(repo, {
        displayName: a.displayName as string,
        label: a.label as string,
      }),
  },
  {
    name: 'validate_world',
    description: 'Return structural problems for a world. Empty array means clean.',
    inputSchema: {
      type: 'object',
      properties: { id: stringField('world id') },
      required: ['id'],
    },
    run: async (repo, a) => {
      const tree = await getWorldTree(repo, asWorldId(a.id as string));
      if (!tree.ok) return tree;
      return { ok: true, problems: validateWorld(tree.value) };
    },
  },
  {
    name: 'upsert_location',
    description: 'Create or update a location.',
    inputSchema: {
      type: 'object',
      properties: {
        worldId: stringField('world id'),
        id: stringField('location id'),
        label: stringField('label'),
        shortDescription: stringField('short description'),
        longDescription: stringField('long description'),
        tags: tagsField,
        secretDescription: stringField(
          'GM-only secret notes about this location. Surfaced ONLY to the consequence engine (never to the player, narrator, or NPC minds). Use for hidden dynamics, things behind walls, faction secrets, etc.',
        ),
      },
      required: ['worldId', 'id', 'label', 'shortDescription', 'longDescription'],
    },
    run: (repo, a) =>
      upsertLocation(repo, asWorldId(a.worldId as string), {
        id: asLocationId(a.id as string),
        label: a.label as string,
        shortDescription: a.shortDescription as string,
        longDescription: a.longDescription as string,
        tags: readTags(a),
        secretDescription: typeof a.secretDescription === 'string' ? a.secretDescription : '',
      }),
  },
  {
    name: 'upsert_exit',
    description: 'Create or update an exit between two locations.',
    inputSchema: {
      type: 'object',
      properties: {
        worldId: stringField('world id'),
        id: stringField('exit id'),
        from: stringField('source location id'),
        to: stringField('destination location id'),
        direction: stringField('direction (north/south/...)'),
        label: stringField('label'),
        locked: { type: 'boolean' },
        lockedByItem: { type: ['string', 'null'] },
      },
      required: ['worldId', 'id', 'from', 'to', 'direction', 'label', 'locked'],
    },
    run: (repo, a) =>
      upsertExit(repo, asWorldId(a.worldId as string), {
        id: asExitId(a.id as string),
        from: asLocationId(a.from as string),
        to: asLocationId(a.to as string),
        direction: a.direction as string,
        label: a.label as string,
        locked: Boolean(a.locked),
        lockedByItem:
          typeof a.lockedByItem === 'string' && a.lockedByItem.length > 0
            ? asItemId(a.lockedByItem)
            : null,
      }),
  },
  {
    name: 'upsert_item',
    description: 'Create or update an item.',
    inputSchema: {
      type: 'object',
      properties: {
        worldId: stringField('world id'),
        id: stringField('item id'),
        label: stringField('label'),
        shortDescription: stringField('short description'),
        longDescription: stringField('long description'),
        ownerKind: { type: 'string', enum: ['location', 'agent', 'item'] },
        ownerId: stringField('owner id'),
        weight: { type: 'number' },
        hidden: { type: 'boolean' },
        priceTag: { type: ['number', 'null'] },
        tags: tagsField,
      },
      required: [
        'worldId',
        'id',
        'label',
        'shortDescription',
        'longDescription',
        'ownerKind',
        'ownerId',
        'weight',
        'hidden',
      ],
    },
    run: (repo, a) =>
      upsertItem(repo, asWorldId(a.worldId as string), {
        id: asItemId(a.id as string),
        label: a.label as string,
        shortDescription: a.shortDescription as string,
        longDescription: a.longDescription as string,
        ownerKind: a.ownerKind as OwnerKind,
        ownerId: a.ownerId as string,
        weight: Number(a.weight),
        hidden: Boolean(a.hidden),
        tags: readTags(a),
        container: typeof a.container === 'boolean' ? a.container : false,
        opened: typeof a.opened === 'boolean' ? a.opened : true,
        locked: typeof a.locked === 'boolean' ? a.locked : false,
        lockedByItem:
          typeof a.lockedByItem === 'string' && a.lockedByItem.length > 0
            ? asItemId(a.lockedByItem)
            : null,
        priceTag: typeof a.priceTag === 'number' ? a.priceTag : null,
      }),
  },
  {
    name: 'upsert_agent',
    description: 'Create or update an agent.',
    inputSchema: {
      type: 'object',
      properties: {
        worldId: stringField('world id'),
        id: stringField('agent id'),
        label: stringField('label'),
        shortDescription: stringField('short description'),
        longDescription: stringField('long description'),
        locationId: stringField('starting location'),
        hp: { type: 'number' },
        damage: { type: 'number' },
        defense: { type: 'number' },
        capacity: { type: 'number' },
        mood: { type: ['string', 'null'] },
        goal: { type: ['string', 'null'] },
        autonomous: { type: 'boolean' },
        gold: { type: 'number' },
        tags: tagsField,
      },
      required: [
        'worldId',
        'id',
        'label',
        'shortDescription',
        'longDescription',
        'locationId',
        'hp',
        'damage',
        'defense',
        'capacity',
        'autonomous',
      ],
    },
    run: (repo, a) =>
      upsertAgent(repo, asWorldId(a.worldId as string), {
        id: asAgentId(a.id as string),
        label: a.label as string,
        shortDescription: a.shortDescription as string,
        longDescription: a.longDescription as string,
        locationId: asLocationId(a.locationId as string),
        hp: Number(a.hp),
        damage: Number(a.damage),
        defense: Number(a.defense),
        capacity: Number(a.capacity),
        mood: (a.mood as string | null) ?? null,
        goal: (a.goal as string | null) ?? null,
        autonomous: Boolean(a.autonomous),
        gold: typeof a.gold === 'number' ? a.gold : 0,
        tags: readTags(a),
      }),
  },
  {
    name: 'delete_location',
    description: 'Delete a location.',
    inputSchema: {
      type: 'object',
      properties: { worldId: stringField('world id'), id: stringField('location id') },
      required: ['worldId', 'id'],
    },
    run: (repo, a) =>
      deleteLocation(repo, asWorldId(a.worldId as string), asLocationId(a.id as string)),
  },
  {
    name: 'delete_exit',
    description: 'Delete an exit.',
    inputSchema: {
      type: 'object',
      properties: { worldId: stringField('world id'), id: stringField('exit id') },
      required: ['worldId', 'id'],
    },
    run: (repo, a) => deleteExit(repo, asWorldId(a.worldId as string), asExitId(a.id as string)),
  },
  {
    name: 'delete_item',
    description: 'Delete an item.',
    inputSchema: {
      type: 'object',
      properties: { worldId: stringField('world id'), id: stringField('item id') },
      required: ['worldId', 'id'],
    },
    run: (repo, a) => deleteItem(repo, asWorldId(a.worldId as string), asItemId(a.id as string)),
  },
  {
    name: 'delete_agent',
    description: 'Delete an agent.',
    inputSchema: {
      type: 'object',
      properties: { worldId: stringField('world id'), id: stringField('agent id') },
      required: ['worldId', 'id'],
    },
    run: (repo, a) => deleteAgent(repo, asWorldId(a.worldId as string), asAgentId(a.id as string)),
  },
  {
    name: 'list_monster_templates',
    description: 'List monster templates for a world.',
    inputSchema: {
      type: 'object',
      properties: { worldId: stringField('world id') },
      required: ['worldId'],
    },
    run: async (repo, a) => repo.listMonsterTemplates(asWorldId(a.worldId as string)),
  },
  {
    name: 'list_location_spawn_triggers',
    description: 'List spawn triggers, optionally filtered by location.',
    inputSchema: {
      type: 'object',
      properties: {
        worldId: stringField('world id'),
        locationId: stringField('optional location filter'),
      },
      required: ['worldId'],
    },
    run: async (repo, a) =>
      repo.listLocationSpawnTriggers(
        asWorldId(a.worldId as string),
        a.locationId ? asLocationId(a.locationId as string) : undefined,
      ),
  },
  {
    name: 'upsert_monster_template',
    description: 'Create or update a monster template on a draft.',
    inputSchema: {
      type: 'object',
      properties: {
        worldId: stringField('world id'),
        id: stringField('template id'),
        templateKey: stringField('author-stable key, e.g. "goblin"'),
        label: stringField('label'),
        shortDescription: stringField('short description'),
        longDescription: stringField('long description'),
        hp: { type: 'number' },
        mood: { type: ['string', 'null'] },
        startingItems: startingItemsField,
        tags: tagsField,
      },
      required: [
        'worldId',
        'id',
        'templateKey',
        'label',
        'shortDescription',
        'longDescription',
        'hp',
        'startingItems',
      ],
    },
    run: (repo, a) =>
      upsertMonsterTemplate(repo, asWorldId(a.worldId as string), {
        id: asMonsterTemplateId(a.id as string),
        templateKey: a.templateKey as string,
        label: a.label as string,
        shortDescription: a.shortDescription as string,
        longDescription: a.longDescription as string,
        hp: Number(a.hp),
        mood: (a.mood as string | null) ?? null,
        startingItems: (a.startingItems as never) ?? [],
        tags: readTags(a),
      }),
  },
  {
    name: 'delete_monster_template',
    description: 'Delete a monster template from a draft.',
    inputSchema: {
      type: 'object',
      properties: { worldId: stringField('world id'), id: stringField('template id') },
      required: ['worldId', 'id'],
    },
    run: (repo, a) =>
      deleteMonsterTemplate(
        repo,
        asWorldId(a.worldId as string),
        asMonsterTemplateId(a.id as string),
      ),
  },
  {
    name: 'upsert_location_spawn_trigger',
    description: 'Create or update a spawn trigger attached to a location on a draft.',
    inputSchema: {
      type: 'object',
      properties: {
        worldId: stringField('world id'),
        id: stringField('trigger id'),
        locationId: stringField('location id'),
        templateId: stringField('template id'),
        params: { type: 'object', description: 'TriggerParams discriminated union' },
        count: { type: 'number' },
        oneShot: { type: 'boolean' },
        fireOnInitialPublish: { type: 'boolean' },
      },
      required: [
        'worldId',
        'id',
        'locationId',
        'templateId',
        'params',
        'count',
        'oneShot',
        'fireOnInitialPublish',
      ],
    },
    run: (repo, a) =>
      upsertLocationSpawnTrigger(repo, asWorldId(a.worldId as string), {
        id: asSpawnTriggerId(a.id as string),
        locationId: asLocationId(a.locationId as string),
        templateId: asMonsterTemplateId(a.templateId as string),
        params: a.params as never,
        count: Number(a.count),
        oneShot: Boolean(a.oneShot),
        fireOnInitialPublish: Boolean(a.fireOnInitialPublish),
      }),
  },
  {
    name: 'get_world_lore',
    description: 'Return the world lore (worldOverview, storySoFar) for a world.',
    inputSchema: {
      type: 'object',
      properties: { id: stringField('world id') },
      required: ['id'],
    },
    run: (repo, a) => getWorldLore(repo, asWorldId(a.id as string)),
  },
  {
    name: 'update_world_lore',
    description: 'Update world lore (worldOverview, storySoFar) on a draft.',
    inputSchema: {
      type: 'object',
      properties: {
        id: stringField('world id'),
        worldOverview: stringField('world overview'),
        storySoFar: stringField('story so far'),
      },
      required: ['id', 'worldOverview', 'storySoFar'],
    },
    run: (repo, a) =>
      updateWorldLore(repo, asWorldId(a.id as string), {
        worldOverview: a.worldOverview as string,
        storySoFar: a.storySoFar as string,
      }),
  },
  {
    name: 'list_tag_lore',
    description: 'List tag lore entries for a world.',
    inputSchema: {
      type: 'object',
      properties: { worldId: stringField('world id') },
      required: ['worldId'],
    },
    run: async (repo, a) => repo.listTagLore(asWorldId(a.worldId as string)),
  },
  {
    name: 'upsert_tag_lore',
    description: 'Create or update a tag lore entry on a draft.',
    inputSchema: {
      type: 'object',
      properties: {
        worldId: stringField('world id'),
        payload: {
          type: 'object',
          properties: {
            id: stringField('tag lore id'),
            tag: stringField('tag value, e.g. "city:varos"'),
            title: stringField('title'),
            description: stringField('description'),
          },
          required: ['id', 'tag', 'title', 'description'],
        },
      },
      required: ['worldId', 'payload'],
    },
    run: (repo, a) => {
      const payload = a.payload as {
        id: string;
        tag: string;
        title: string;
        description: string;
      };
      return upsertTagLore(repo, asWorldId(a.worldId as string), {
        id: asTagLoreId(payload.id),
        tag: payload.tag,
        title: payload.title,
        description: payload.description,
      });
    },
  },
  {
    name: 'delete_tag_lore',
    description: 'Delete a tag lore entry from a draft.',
    inputSchema: {
      type: 'object',
      properties: { worldId: stringField('world id'), id: stringField('tag lore id') },
      required: ['worldId', 'id'],
    },
    run: (repo, a) =>
      deleteTagLore(repo, asWorldId(a.worldId as string), asTagLoreId(a.id as string)),
  },
  {
    name: 'delete_location_spawn_trigger',
    description: 'Delete a spawn trigger from a draft.',
    inputSchema: {
      type: 'object',
      properties: { worldId: stringField('world id'), id: stringField('trigger id') },
      required: ['worldId', 'id'],
    },
    run: (repo, a) =>
      deleteLocationSpawnTrigger(
        repo,
        asWorldId(a.worldId as string),
        asSpawnTriggerId(a.id as string),
      ),
  },
];

// Used by the smoke test — registering via name.
export const TOOL_BY_NAME: Record<string, ToolDef> = Object.fromEntries(
  TOOLS.map((t) => [t.name, t]),
);

export function toolsForAdminAgent(): readonly ToolDef[] {
  return TOOLS.filter((t) => !AGENT_EXCLUDED_TOOL_NAMES.has(t.name));
}
