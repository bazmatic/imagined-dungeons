ALTER TABLE `worlds` ADD `cover_image_url` text;
--> statement-breakpoint
ALTER TABLE `locations` ADD `tags` text DEFAULT '[]' NOT NULL;
