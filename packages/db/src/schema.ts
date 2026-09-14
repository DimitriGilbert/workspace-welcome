import { sql } from "drizzle-orm";
import {
  check,
  integer,
  primaryKey,
  sqliteTable,
  text,
  unique,
} from "drizzle-orm/sqlite-core";

/**
 * Relational model for workspace-welcome's persisted user state, per the
 * forge-sqlite plan's data model. Conventions: booleans are stored as
 * 0/1 integers via `integer({ mode: "boolean" })`; timestamps are ISO-8601
 * strings (existing repo convention); `*_json` columns hold JSON arrays or
 * objects (settings is a single row, so arrays-as-JSON there is honest — the
 * relational demand applies to entities, not the settings singleton).
 *
 * The forge tables cache open issues/PRs "as of last sync" (snapshot
 * semantics — replace, no history); libsql enforces foreign keys by default,
 * so the ON DELETE CASCADE rules below are live.
 */

/** Key/value app metadata: schema_version + one-time import markers. */
export const appMeta = sqliteTable("app_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

/** Registered workspace roots (imported from legacy store.json in Phase 3). */
export const roots = sqliteTable("roots", {
  id: text("id").primaryKey(),
  path: text("path").notNull().unique(),
  label: text("label").notNull(),
  addedAt: text("added_at").notNull(),
});

/** Per-project overrides keyed by absolute path (pinned/hidden/note). */
export const projectOverrides = sqliteTable("project_overrides", {
  path: text("path").primaryKey(),
  pinned: integer("pinned", { mode: "boolean" }).notNull(),
  note: text("note").notNull(),
  lastOpenedAt: text("last_opened_at"),
  hidden: integer("hidden", { mode: "boolean" }).notNull(),
});

/** Singleton settings row (id is pinned to 1 by a CHECK constraint). */
export const settings = sqliteTable(
  "settings",
  {
    id: integer("id").primaryKey(),
    editorCommand: text("editor_command").notNull(),
    terminalCommand: text("terminal_command"),
    snitchPath: text("snitch_path"),
    excludeGlobsJson: text("exclude_globs_json").notNull(),
    ideationJson: text("ideation_json").notNull(),
  },
  (table) => [check("settings_singleton", sql`${table.id} = 1`)],
);

/** Per-project artifact config, imported from legacy per-project JSON files. */
export const projectConfigs = sqliteTable("project_configs", {
  path: text("path").primaryKey(),
  artifactDirsJson: text("artifact_dirs_json").notNull(),
});

/**
 * A forge repository identity + its sync bookkeeping. `host` is the canonical
 * web hostname ("github.com"), not the coarse GitHost classification;
 * UNIQUE(kind, host, slug) is the identity forge_repos is upserted by.
 */
export const forgeRepos = sqliteTable(
  "forge_repos",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    kind: text("kind").notNull(),
    host: text("host").notNull(),
    /** "owner/repo" — the selector both the CLI and the DB key on. */
    slug: text("slug").notNull(),
    lastSyncedAt: text("last_synced_at"),
    /** 'never' | 'ok' | 'failed'. */
    lastSyncStatus: text("last_sync_status").notNull().default("never"),
    lastSyncError: text("last_sync_error"),
  },
  (table) => [
    unique("forge_repos_kind_host_slug_unique").on(
      table.kind,
      table.host,
      table.slug,
    ),
  ],
);

/** Maps one project path to the forge repo its origin remote resolves to. */
export const forgeProjectLinks = sqliteTable("forge_project_links", {
  projectPath: text("project_path").primaryKey(),
  repoId: integer("repo_id")
    .notNull()
    .references(() => forgeRepos.id, { onDelete: "cascade" }),
  remoteUrl: text("remote_url").notNull(),
});

/** Open issues of one repo as of its last sync (replaced wholesale per sync). */
export const forgeIssues = sqliteTable(
  "forge_issues",
  {
    repoId: integer("repo_id")
      .notNull()
      .references(() => forgeRepos.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    title: text("title").notNull(),
    state: text("state").notNull(),
    author: text("author"),
    labelsJson: text("labels_json").notNull(),
    commentCount: integer("comment_count"),
    updatedAt: text("updated_at"),
    url: text("url").notNull(),
  },
  (table) => [primaryKey({ columns: [table.repoId, table.number] })],
);

/** Open pull requests of one repo as of its last sync (same replace rule). */
export const forgePulls = sqliteTable(
  "forge_pulls",
  {
    repoId: integer("repo_id")
      .notNull()
      .references(() => forgeRepos.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    title: text("title").notNull(),
    state: text("state").notNull(),
    author: text("author"),
    isDraft: integer("is_draft", { mode: "boolean" }).notNull(),
    reviewDecision: text("review_decision"),
    labelsJson: text("labels_json").notNull(),
    updatedAt: text("updated_at"),
    url: text("url").notNull(),
  },
  (table) => [primaryKey({ columns: [table.repoId, table.number] })],
);

/**
 * The user-level forge feed cache: the authenticated user's open issues + PRs
 * across ALL GitHub repos (workspace or not), replaced wholesale per feed
 * sync. Deliberately NO foreign key to forge_repos — feed rows come from
 * `gh search` and routinely reference repos no workspace project maps to, so
 * requiring a forge_repos row would make the feed un-persistable for exactly
 * the cross-repo items it exists to surface.
 */
export const forgeFeedItems = sqliteTable(
  "forge_feed_items",
  {
    /** 'issue' | 'pr'. */
    kind: text("kind").notNull(),
    /** "owner/repo" straight from the search row's repository.nameWithOwner. */
    repoSlug: text("repo_slug").notNull(),
    number: integer("number").notNull(),
    title: text("title").notNull(),
    url: text("url").notNull(),
    updatedAt: text("updated_at"),
    labelsJson: text("labels_json").notNull(),
    isDraft: integer("is_draft", { mode: "boolean" }).notNull().default(false),
  },
  (table) => [
    primaryKey({ columns: [table.kind, table.repoSlug, table.number] }),
  ],
);
