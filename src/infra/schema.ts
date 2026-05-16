import { integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const worlds = sqliteTable('worlds', {
  id: text('id').primaryKey(),
  label: text('label').notNull(),
  rngSeed: integer('rng_seed').notNull().default(1),
  kind: text('kind', { enum: ['draft', 'live'] })
    .notNull()
    .default('live'),
  parentDraftId: text('parent_draft_id'),
  displayName: text('display_name').notNull().default(''),
  playerAgentId: text('player_agent_id'),
  coverImageUrl: text('cover_image_url'),
});

// locations / exits / items / agents share entity ids across worlds (a draft and
// its live sibling deliberately reuse e.g. `loc_kitchen`). Primary key is the
// composite (worldId, id) so upserts target the right world rather than
// colliding on a sibling world's row.
export const locations = sqliteTable(
  'locations',
  {
    id: text('id').notNull(),
    worldId: text('world_id')
      .notNull()
      .references(() => worlds.id),
    label: text('label').notNull(),
    shortDescription: text('short_description').notNull(),
    longDescription: text('long_description').notNull(),
    tags: text('tags').notNull().default('[]'),
    // GM-only field; surfaced to the consequence engine but never to
    // player-visible narration or NPC prompts.
    secretDescription: text('secret_description').notNull().default(''),
  },
  (t) => [primaryKey({ columns: [t.worldId, t.id] })],
);

export const exits = sqliteTable(
  'exits',
  {
    id: text('id').notNull(),
    worldId: text('world_id')
      .notNull()
      .references(() => worlds.id),
    fromLocationId: text('from_location_id').notNull(),
    toLocationId: text('to_location_id'),
    direction: text('direction').notNull(),
    label: text('label').notNull(),
    locked: integer('locked', { mode: 'boolean' }).notNull(),
    // No FK on lockedByItemId: items.id is no longer unique on its own
    // (composite PK on items is (worldId, id)). Integrity is enforced by the
    // builder/engine at the application level.
    lockedByItemId: text('locked_by_item_id'),
  },
  (t) => [primaryKey({ columns: [t.worldId, t.id] })],
);

export const items = sqliteTable(
  'items',
  {
    id: text('id').notNull(),
    worldId: text('world_id')
      .notNull()
      .references(() => worlds.id),
    label: text('label').notNull(),
    shortDescription: text('short_description').notNull(),
    longDescription: text('long_description').notNull(),
    ownerKind: text('owner_kind', { enum: ['location', 'agent', 'item'] }).notNull(),
    ownerId: text('owner_id').notNull(),
    weight: integer('weight').notNull(),
    hidden: integer('hidden', { mode: 'boolean' }).notNull(),
    tags: text('tags').notNull().default('[]'),
    // Runtime flag (not authored). True while the owning agent is wearing or
    // wielding the item. Toggled by the equip / unequip actions during play.
    // Always false for items owned by a location or another item.
    equipped: integer('equipped', { mode: 'boolean' }).notNull().default(false),
    // Authored intent: this item is a container that can be opened/closed and may hold items.
    container: integer('container', { mode: 'boolean' }).notNull().default(false),
    // Runtime state. Meaningful only when container is true.
    opened: integer('opened', { mode: 'boolean' }).notNull().default(false),
    // Runtime state. Meaningful only when container is true.
    locked: integer('locked', { mode: 'boolean' }).notNull().default(false),
    // The item-id whose presence in the actor's inventory auto-unlocks this container.
    lockedByItemId: text('locked_by_item_id'),
    // Authored asking price (nullable). When non-null and > 0 the item is for
    // sale at this many gold; the engine clears it on Trade-event handover.
    priceTag: integer('price_tag'),
  },
  (t) => [primaryKey({ columns: [t.worldId, t.id] })],
);

export const agents = sqliteTable(
  'agents',
  {
    id: text('id').notNull(),
    worldId: text('world_id')
      .notNull()
      .references(() => worlds.id),
    label: text('label').notNull(),
    shortDescription: text('short_description').notNull(),
    longDescription: text('long_description').notNull(),
    locationId: text('location_id').notNull(),
    hp: integer('hp').notNull(),
    damage: integer('damage').notNull(),
    defense: integer('defense').notNull(),
    capacity: integer('capacity').notNull(),
    mood: text('mood'),
    shortTermIntent: text('short_term_intent'),
    goal: text('goal'),
    autonomous: integer('autonomous', { mode: 'boolean' }).notNull(),
    awake: integer('awake', { mode: 'boolean' }).notNull(),
    gold: integer('gold').notNull().default(0),
    tags: text('tags').notNull().default('[]'),
    secretDescription: text('secret_description').notNull().default(''),
  },
  (t) => [primaryKey({ columns: [t.worldId, t.id] })],
);

export const events = sqliteTable('events', {
  id: text('id').primaryKey(),
  worldId: text('world_id')
    .notNull()
    .references(() => worlds.id),
  // No FK on actorId: agents.id is no longer unique on its own (composite PK).
  // Application code enforces actor existence within the right world.
  actorId: text('actor_id').notNull(),
  kind: text('kind').notNull(),
  payload: text('payload', { mode: 'json' }).notNull(),
  witnesses: text('witnesses', { mode: 'json' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  narrations: text('narrations', { mode: 'json' }),
});

export const worldSnapshots = sqliteTable('world_snapshots', {
  worldId: text('world_id')
    .primaryKey()
    .references(() => worlds.id),
  snapshotJson: text('snapshot_json').notNull(),
  takenAt: integer('taken_at', { mode: 'timestamp_ms' }).notNull(),
});

export const monsterTemplates = sqliteTable(
  'monster_templates',
  {
    id: text('id').notNull(),
    worldId: text('world_id')
      .notNull()
      .references(() => worlds.id),
    templateKey: text('template_key').notNull(),
    label: text('label').notNull(),
    labelPrefixInstructions: text('label_prefix_instructions'),
    shortDescription: text('short_description').notNull(),
    longDescription: text('long_description').notNull(),
    hpMin: integer('hp_min').notNull(),
    hpMax: integer('hp_max').notNull(),
    damageMin: integer('damage_min').notNull().default(1),
    damageMax: integer('damage_max').notNull().default(1),
    defenseMin: integer('defense_min').notNull().default(0),
    defenseMax: integer('defense_max').notNull().default(0),
    mood: text('mood'),
    startingItemsJson: text('starting_items_json').notNull().default('[]'),
    tags: text('tags').notNull().default('[]'),
  },
  (t) => [primaryKey({ columns: [t.worldId, t.id] })],
);

export const locationSpawnTriggers = sqliteTable(
  'location_spawn_triggers',
  {
    id: text('id').notNull(),
    worldId: text('world_id')
      .notNull()
      .references(() => worlds.id),
    locationId: text('location_id').notNull(),
    templateId: text('template_id').notNull(),
    kind: text('kind').notNull(),
    paramsJson: text('params_json'),
    count: integer('count').notNull().default(1),
    oneShot: integer('one_shot', { mode: 'boolean' }).notNull().default(false),
    fireOnInitialPublish: integer('fire_on_initial_publish', { mode: 'boolean' })
      .notNull()
      .default(false),
  },
  (t) => [primaryKey({ columns: [t.worldId, t.id] })],
);

export const worldLore = sqliteTable('world_lore', {
  worldId: text('world_id')
    .primaryKey()
    .references(() => worlds.id),
  worldOverview: text('world_overview').notNull().default(''),
  storySoFar: text('story_so_far').notNull().default(''),
});

export const tagLore = sqliteTable(
  'tag_lore',
  {
    id: text('id').notNull(),
    worldId: text('world_id')
      .notNull()
      .references(() => worlds.id),
    tag: text('tag').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.worldId, t.id] }),
    uniqueIndex('tag_lore_world_tag_unique').on(t.worldId, t.tag),
  ],
);
