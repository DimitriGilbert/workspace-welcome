import { sql } from "drizzle-orm";
import { check, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Relational model for workspace-welcome's persisted user state, per the
 * forge-sqlite plan's data model. Conventions: booleans are stored as
 * 0/1 integers via `integer({ mode: "boolean" })`; timestamps are ISO-8601
 * strings (existing repo convention); `*_json` columns hold JSON arrays or
 * objects (settings is a single row, so arrays-as-JSON there is honest — the
 * relational demand applies to entities, not the settings singleton).
 *
 * Forge tables (forge_repos, forge_project_links, forge_issues,
 * forge_pulls) land in Phase 4b as migration 0002 — intentionally absent now.
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
