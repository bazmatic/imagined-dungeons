ALTER TABLE `monster_templates` ADD `label_prefix_instructions` text;
--> statement-breakpoint
ALTER TABLE `monster_templates` ADD `hp_min` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `monster_templates` ADD `hp_max` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
UPDATE `monster_templates` SET `hp_min` = `hp`, `hp_max` = `hp`;
--> statement-breakpoint
ALTER TABLE `monster_templates` DROP COLUMN `hp`;
