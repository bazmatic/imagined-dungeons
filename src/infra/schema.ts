import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const worlds = sqliteTable('worlds', {
  id: text('id').primaryKey(),
  label: text('label').notNull(),
});

export const locations = sqliteTable('locations', {
  id: text('id').primaryKey(),
  worldId: text('world_id')
    .notNull()
    .references(() => worlds.id),
  label: text('label').notNull(),
  shortDescription: text('short_description').notNull(),
  longDescription: text('long_description').notNull(),
});

export const exits = sqliteTable('exits', {
  id: text('id').primaryKey(),
  worldId: text('world_id')
    .notNull()
    .references(() => worlds.id),
  fromLocationId: text('from_location_id')
    .notNull()
    .references(() => locations.id),
  toLocationId: text('to_location_id')
    .notNull()
    .references(() => locations.id),
  direction: text('direction').notNull(),
  label: text('label').notNull(),
  locked: integer('locked', { mode: 'boolean' }).notNull(),
  lockedByItemId: text('locked_by_item_id'),
});

export const items = sqliteTable('items', {
  id: text('id').primaryKey(),
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
});

export const agents = sqliteTable('agents', {
  id: text('id').primaryKey(),
  worldId: text('world_id')
    .notNull()
    .references(() => worlds.id),
  label: text('label').notNull(),
  shortDescription: text('short_description').notNull(),
  longDescription: text('long_description').notNull(),
  locationId: text('location_id')
    .notNull()
    .references(() => locations.id),
  hp: integer('hp').notNull(),
  damage: integer('damage').notNull(),
  defense: integer('defense').notNull(),
  capacity: integer('capacity').notNull(),
  mood: text('mood'),
  goal: text('goal'),
  autonomous: integer('autonomous', { mode: 'boolean' }).notNull(),
});

export const events = sqliteTable('events', {
  id: text('id').primaryKey(),
  worldId: text('world_id')
    .notNull()
    .references(() => worlds.id),
  actorId: text('actor_id')
    .notNull()
    .references(() => agents.id),
  kind: text('kind').notNull(),
  payload: text('payload', { mode: 'json' }).notNull(),
  witnesses: text('witnesses', { mode: 'json' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  narrations: text('narrations', { mode: 'json' }),
});
