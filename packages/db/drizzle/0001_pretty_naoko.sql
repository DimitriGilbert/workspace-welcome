CREATE TABLE `forge_issues` (
	`repo_id` integer NOT NULL,
	`number` integer NOT NULL,
	`title` text NOT NULL,
	`state` text NOT NULL,
	`author` text,
	`labels_json` text NOT NULL,
	`comment_count` integer,
	`updated_at` text,
	`url` text NOT NULL,
	PRIMARY KEY(`repo_id`, `number`),
	FOREIGN KEY (`repo_id`) REFERENCES `forge_repos`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `forge_project_links` (
	`project_path` text PRIMARY KEY NOT NULL,
	`repo_id` integer NOT NULL,
	`remote_url` text NOT NULL,
	FOREIGN KEY (`repo_id`) REFERENCES `forge_repos`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `forge_pulls` (
	`repo_id` integer NOT NULL,
	`number` integer NOT NULL,
	`title` text NOT NULL,
	`state` text NOT NULL,
	`author` text,
	`is_draft` integer NOT NULL,
	`review_decision` text,
	`labels_json` text NOT NULL,
	`updated_at` text,
	`url` text NOT NULL,
	PRIMARY KEY(`repo_id`, `number`),
	FOREIGN KEY (`repo_id`) REFERENCES `forge_repos`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `forge_repos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`host` text NOT NULL,
	`slug` text NOT NULL,
	`last_synced_at` text,
	`last_sync_status` text DEFAULT 'never' NOT NULL,
	`last_sync_error` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `forge_repos_kind_host_slug_unique` ON `forge_repos` (`kind`,`host`,`slug`);