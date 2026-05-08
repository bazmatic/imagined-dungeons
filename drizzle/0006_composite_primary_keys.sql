PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_agents` (
	`id` text NOT NULL,
	`world_id` text NOT NULL,
	`label` text NOT NULL,
	`short_description` text NOT NULL,
	`long_description` text NOT NULL,
	`location_id` text NOT NULL,
	`hp` integer NOT NULL,
	`damage` integer NOT NULL,
	`defense` integer NOT NULL,
	`capacity` integer NOT NULL,
	`mood` text,
	`short_term_intent` text,
	`goal` text,
	`autonomous` integer NOT NULL,
	`awake` integer NOT NULL,
	PRIMARY KEY(`world_id`, `id`),
	FOREIGN KEY (`world_id`) REFERENCES `worlds`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_agents`("id", "world_id", "label", "short_description", "long_description", "location_id", "hp", "damage", "defense", "capacity", "mood", "short_term_intent", "goal", "autonomous", "awake") SELECT "id", "world_id", "label", "short_description", "long_description", "location_id", "hp", "damage", "defense", "capacity", "mood", "short_term_intent", "goal", "autonomous", "awake" FROM `agents`;--> statement-breakpoint
DROP TABLE `agents`;--> statement-breakpoint
ALTER TABLE `__new_agents` RENAME TO `agents`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_events` (
	`id` text PRIMARY KEY NOT NULL,
	`world_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`kind` text NOT NULL,
	`payload` text NOT NULL,
	`witnesses` text NOT NULL,
	`created_at` integer NOT NULL,
	`narrations` text,
	FOREIGN KEY (`world_id`) REFERENCES `worlds`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_events`("id", "world_id", "actor_id", "kind", "payload", "witnesses", "created_at", "narrations") SELECT "id", "world_id", "actor_id", "kind", "payload", "witnesses", "created_at", "narrations" FROM `events`;--> statement-breakpoint
DROP TABLE `events`;--> statement-breakpoint
ALTER TABLE `__new_events` RENAME TO `events`;--> statement-breakpoint
CREATE TABLE `__new_exits` (
	`id` text NOT NULL,
	`world_id` text NOT NULL,
	`from_location_id` text NOT NULL,
	`to_location_id` text NOT NULL,
	`direction` text NOT NULL,
	`label` text NOT NULL,
	`locked` integer NOT NULL,
	`locked_by_item_id` text,
	PRIMARY KEY(`world_id`, `id`),
	FOREIGN KEY (`world_id`) REFERENCES `worlds`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_exits`("id", "world_id", "from_location_id", "to_location_id", "direction", "label", "locked", "locked_by_item_id") SELECT "id", "world_id", "from_location_id", "to_location_id", "direction", "label", "locked", "locked_by_item_id" FROM `exits`;--> statement-breakpoint
DROP TABLE `exits`;--> statement-breakpoint
ALTER TABLE `__new_exits` RENAME TO `exits`;--> statement-breakpoint
CREATE TABLE `__new_items` (
	`id` text NOT NULL,
	`world_id` text NOT NULL,
	`label` text NOT NULL,
	`short_description` text NOT NULL,
	`long_description` text NOT NULL,
	`owner_kind` text NOT NULL,
	`owner_id` text NOT NULL,
	`weight` integer NOT NULL,
	`hidden` integer NOT NULL,
	PRIMARY KEY(`world_id`, `id`),
	FOREIGN KEY (`world_id`) REFERENCES `worlds`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_items`("id", "world_id", "label", "short_description", "long_description", "owner_kind", "owner_id", "weight", "hidden") SELECT "id", "world_id", "label", "short_description", "long_description", "owner_kind", "owner_id", "weight", "hidden" FROM `items`;--> statement-breakpoint
DROP TABLE `items`;--> statement-breakpoint
ALTER TABLE `__new_items` RENAME TO `items`;--> statement-breakpoint
CREATE TABLE `__new_locations` (
	`id` text NOT NULL,
	`world_id` text NOT NULL,
	`label` text NOT NULL,
	`short_description` text NOT NULL,
	`long_description` text NOT NULL,
	PRIMARY KEY(`world_id`, `id`),
	FOREIGN KEY (`world_id`) REFERENCES `worlds`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_locations`("id", "world_id", "label", "short_description", "long_description") SELECT "id", "world_id", "label", "short_description", "long_description" FROM `locations`;--> statement-breakpoint
DROP TABLE `locations`;--> statement-breakpoint
ALTER TABLE `__new_locations` RENAME TO `locations`;