import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

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
    toLocationId: text('to_location_id').notNull(),
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
