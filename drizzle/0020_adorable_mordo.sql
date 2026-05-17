CREATE TABLE `npc_decisions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`world_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`snapshot` text NOT NULL,
	`raw_prompt` text NOT NULL,
	FOREIGN KEY (`world_id`) REFERENCES `worlds`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `npc_decisions_world_agent_idx` ON `npc_decisions` (`world_id`,`agent_id`,`created_at`);