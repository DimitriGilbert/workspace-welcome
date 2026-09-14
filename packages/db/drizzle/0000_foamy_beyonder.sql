CREATE TABLE `app_meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `project_configs` (
	`path` text PRIMARY KEY NOT NULL,
	`artifact_dirs_json` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `project_overrides` (
	`path` text PRIMARY KEY NOT NULL,
	`pinned` integer NOT NULL,
	`note` text NOT NULL,
	`last_opened_at` text,
	`hidden` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `roots` (
	`id` text PRIMARY KEY NOT NULL,
	`path` text NOT NULL,
	`label` text NOT NULL,
	`added_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `roots_path_unique` ON `roots` (`path`);--> statement-breakpoint
CREATE TABLE `settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`editor_command` text NOT NULL,
	`terminal_command` text,
	`snitch_path` text,
	`exclude_globs_json` text NOT NULL,
	`ideation_json` text NOT NULL,
	CONSTRAINT "settings_singleton" CHECK("settings"."id" = 1)
);
