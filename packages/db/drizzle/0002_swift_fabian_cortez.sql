CREATE TABLE `forge_feed_items` (
	`kind` text NOT NULL,
	`repo_slug` text NOT NULL,
	`number` integer NOT NULL,
	`title` text NOT NULL,
	`url` text NOT NULL,
	`updated_at` text,
	`labels_json` text NOT NULL,
	`is_draft` integer DEFAULT false NOT NULL,
	PRIMARY KEY(`kind`, `repo_slug`, `number`)
);
