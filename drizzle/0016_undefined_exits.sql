PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_exits` (
	`id` text NOT NULL,
	`world_id` text NOT NULL,
	`from_location_id` text NOT NULL,
	`to_location_id` text,
	`direction` text NOT NULL,
	`label` text NOT NULL,
	`locked` integer NOT NULL,
	`locked_by_item_id` text,
	PRIMARY KEY(`world_id`, `id`),
	FOREIGN KEY (`world_id`) REFERENCES `worlds`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_exits`("id", "world_id", "from_location_id", "to_location_id", "direction", "label", "locked", "locked_by_item_id") SELECT "id", "world_id", "from_location_id", "to_location_id", "direction", "label", "locked", "locked_by_item_id" FROM `exits`;
--> statement-breakpoint
DROP TABLE `exits`;
--> statement-breakpoint
ALTER TABLE `__new_exits` RENAME TO `exits`;
--> statement-breakpoint
PRAGMA foreign_keys=ON;
