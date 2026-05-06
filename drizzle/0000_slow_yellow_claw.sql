CREATE TABLE `agents` (
	`id` text PRIMARY KEY NOT NULL,
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
	`goal` text,
	`autonomous` integer NOT NULL,
	FOREIGN KEY (`world_id`) REFERENCES `worlds`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`world_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`kind` text NOT NULL,
	`payload` text NOT NULL,
	`witnesses` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`world_id`) REFERENCES `worlds`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `exits` (
	`id` text PRIMARY KEY NOT NULL,
	`world_id` text NOT NULL,
	`from_location_id` text NOT NULL,
	`to_location_id` text NOT NULL,
	`direction` text NOT NULL,
	`label` text NOT NULL,
	`locked` integer NOT NULL,
	`locked_by_item_id` text,
	FOREIGN KEY (`world_id`) REFERENCES `worlds`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`from_location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `items` (
	`id` text PRIMARY KEY NOT NULL,
	`world_id` text NOT NULL,
	`label` text NOT NULL,
	`short_description` text NOT NULL,
	`long_description` text NOT NULL,
	`owner_kind` text NOT NULL,
	`owner_id` text NOT NULL,
	`weight` integer NOT NULL,
	`hidden` integer NOT NULL,
	FOREIGN KEY (`world_id`) REFERENCES `worlds`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `locations` (
	`id` text PRIMARY KEY NOT NULL,
	`world_id` text NOT NULL,
	`label` text NOT NULL,
	`short_description` text NOT NULL,
	`long_description` text NOT NULL,
	FOREIGN KEY (`world_id`) REFERENCES `worlds`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `worlds` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL
);
