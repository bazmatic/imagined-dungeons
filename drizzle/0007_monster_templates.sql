CREATE TABLE `location_spawn_triggers` (
	`id` text NOT NULL,
	`world_id` text NOT NULL,
	`location_id` text NOT NULL,
	`template_id` text NOT NULL,
	`kind` text NOT NULL,
	`params_json` text,
	`count` integer DEFAULT 1 NOT NULL,
	`one_shot` integer DEFAULT false NOT NULL,
	`fire_on_initial_publish` integer DEFAULT false NOT NULL,
	PRIMARY KEY(`world_id`, `id`),
	FOREIGN KEY (`world_id`) REFERENCES `worlds`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `monster_templates` (
	`id` text NOT NULL,
	`world_id` text NOT NULL,
	`template_key` text NOT NULL,
	`label` text NOT NULL,
	`short_description` text NOT NULL,
	`long_description` text NOT NULL,
	`hp` integer NOT NULL,
	`mood` text,
	`starting_items_json` text DEFAULT '[]' NOT NULL,
	PRIMARY KEY(`world_id`, `id`),
	FOREIGN KEY (`world_id`) REFERENCES `worlds`(`id`) ON UPDATE no action ON DELETE no action
);
