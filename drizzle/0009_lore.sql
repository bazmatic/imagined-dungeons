CREATE TABLE `tag_lore` (
	`id` text NOT NULL,
	`world_id` text NOT NULL,
	`tag` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	PRIMARY KEY(`world_id`, `id`),
	FOREIGN KEY (`world_id`) REFERENCES `worlds`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tag_lore_world_tag_unique` ON `tag_lore` (`world_id`,`tag`);--> statement-breakpoint
CREATE TABLE `world_lore` (
	`world_id` text PRIMARY KEY NOT NULL,
	`world_overview` text DEFAULT '' NOT NULL,
	`story_so_far` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`world_id`) REFERENCES `worlds`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `agents` ADD `tags` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `items` ADD `tags` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `monster_templates` ADD `tags` text DEFAULT '[]' NOT NULL;