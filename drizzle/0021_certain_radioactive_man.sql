ALTER TABLE `events` ADD `tick_id` integer;--> statement-breakpoint
ALTER TABLE `events` ADD `location_label` text;--> statement-breakpoint
ALTER TABLE `worlds` ADD `tick_count` integer DEFAULT 0 NOT NULL;