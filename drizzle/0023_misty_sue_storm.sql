CREATE TABLE `entity_traces` (
	`id` text PRIMARY KEY NOT NULL,
	`world_id` text NOT NULL,
	`entity_kind` text NOT NULL,
	`entity_id` text NOT NULL,
	`effect` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`world_id`) REFERENCES `worlds`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `entity_traces_entity_idx` ON `entity_traces` (`world_id`,`entity_kind`,`entity_id`,`created_at`);