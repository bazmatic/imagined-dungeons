CREATE TABLE `world_snapshots` (
	`world_id` text PRIMARY KEY NOT NULL,
	`snapshot_json` text NOT NULL,
	`taken_at` integer NOT NULL,
	FOREIGN KEY (`world_id`) REFERENCES `worlds`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `worlds` ADD `kind` text DEFAULT 'live' NOT NULL;--> statement-breakpoint
ALTER TABLE `worlds` ADD `parent_draft_id` text;--> statement-breakpoint
ALTER TABLE `worlds` ADD `display_name` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `worlds` ADD `player_agent_id` text;