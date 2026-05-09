import {
  cloneLiveAsDraft,
  createDraft,
  deleteAgent,
  deleteExit,
  deleteItem,
  deleteLocation,
  deleteLocationSpawnTrigger,
  deleteMonsterTemplate,
  getWorldTree,
  listWorlds,
  publish,
  upsertAgent,
  upsertExit,
  upsertItem,
  upsertLocation,
  upsertLocationSpawnTrigger,
  upsertMonsterTemplate,
} from '@core/builder/index';
import type { BuilderRepository } from '@core/builder/repository';
import { validateWorld } from '@core/builder/validate';
import {
  asAgentId,
  asExitId,
  asItemId,
  asLocationId,
  asMonsterTemplateId,
  asSpawnTriggerId,
  asWorldId,
} from '@core/domain/ids';
import type { OwnerKind } from '@core/domain/kinds';

/**
 * The MCP tool surface. Each entry is a thin wrapper around a builder facade
 * function. The server (server.ts) registers these against an MCP server.
 *
 * Tool input schemas are JSON Schema; outputs are the `Result<T, BuilderError>`
 * shape verbatim, so a calling AI can act on `ok: false` directly.
 *
 * NOTE: `reset_live_to_draft` is intentionally NOT exposed via MCP — it wipes
 * gameplay state. It remains available in the UI (with a confirmation modal).
 */
export interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run: (repo: BuilderRepository, args: Record<string, unknown>) => Promise<unknown>;
}

const stringField = (description: string) => ({ type: 'string', description });

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
      properties: { worldId: stringField('world id') },
      required: ['worldId'],
    },
    run: (repo, a) => getWorldTree(repo, asWorldId(a.worldId as string)),
  },
  {
    name: 'create_draft',
    description: 'Create an empty draft world.',
    inputSchema: {
      type: 'object',
      properties: {
        displayName: stringField('display name'),
        label: stringField('short label'),
      },
      required: ['displayName', 'label'],
    },
    run: (repo, a) =>
      createDraft(repo, {
        displayName: a.displayName as string,
        label: a.label as string,
      }),
  },
  {
    name: 'clone_live_as_draft',
    description: 'Clone an existing live world into a new editable draft.',
    inputSchema: {
      type: 'object',
      properties: { worldId: stringField('live world id') },
      required: ['worldId'],
    },
    run: (repo, a) => cloneLiveAsDraft(repo, asWorldId(a.worldId as string)),
  },
  {
    name: 'validate_world',
    description: 'Return structural problems for a world. Empty array means clean.',
    inputSchema: {
      type: 'object',
      properties: { worldId: stringField('world id') },
      required: ['worldId'],
    },
    run: async (repo, a) => {
      const tree = await getWorldTree(repo, asWorldId(a.worldId as string));
      if (!tree.ok) return tree;
      return { ok: true, problems: validateWorld(tree.value) };
    },
  },
  {
    name: 'publish_world',
    description:
      'Publish a draft to its live world. Validates first; structural three-way merge with skipped-change report.',
    inputSchema: {
      type: 'object',
      properties: { draftId: stringField('draft world id') },
      required: ['draftId'],
    },
    run: (repo, a) => publish(repo, asWorldId(a.draftId as string)),
  },
  // NOTE: reset_live_to_draft is intentionally NOT exposed via MCP — it wipes
  // gameplay state. It remains available in the UI (with a confirmation
  // modal) and the HTTP API.
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
      },
      required: ['worldId', 'id', 'label', 'shortDescription', 'longDescription'],
    },
    run: (repo, a) =>
      upsertLocation(repo, asWorldId(a.worldId as string), {
        id: asLocationId(a.id as string),
        label: a.label as string,
        shortDescription: a.shortDescription as string,
        longDescription: a.longDescription as string,
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
        startingItems: { type: 'array' },
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
