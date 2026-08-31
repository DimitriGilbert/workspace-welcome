import type { scaffoldOptionLists } from "../scaffold-options";

/**
 * Normalized input for the AGENTS.md generator.
 *
 * Field types reuse the wizard vocabularies from scaffold-options wherever
 * that list is closed and stable (native, runtime, packageManager, addons,
 * examples). Fields where historical bts.jsonc files drift from the current
 * wizard (frontend, backend, api, auth, payments, database, orm, dbSetup,
 * deploys) are typed as plain strings: bts.jsonc written by older CLI
 * versions legitimately contains values the wizard no longer offers (api
 * "orpc", database "none", backend "convex"), and the stack mapping renders
 * unknown values honestly instead of dropping them.
 */
export interface AgentsMdConfig {
  readonly projectName: string;
  /** Web frontends (bts.jsonc "frontend" minus native entries). */
  readonly frontends: readonly string[];
  readonly native: NativeFrontend;
  readonly backend: string;
  readonly runtime: Runtime;
  readonly api: string;
  readonly auth: string;
  readonly payments: string;
  readonly database: string;
  readonly orm: string;
  readonly dbSetup: string;
  readonly packageManager: PackageManager;
  readonly webDeploy: string;
  readonly serverDeploy: string;
  readonly addons: readonly Addon[];
  readonly examples: readonly Example[];
}

/** The subset of a parsed bts.jsonc the generator reads. */
export interface BtsJsoncConfig {
  /** The scaffolding command; carries the project name with its original casing. Empty when absent. */
  readonly reproducibleCommand: string;
  readonly frontend: readonly string[];
  readonly backend: string;
  readonly runtime: string;
  readonly api: string;
  readonly auth: string;
  readonly payments: string;
  readonly database: string;
  readonly orm: string;
  readonly dbSetup: string;
  readonly packageManager: string;
  readonly webDeploy: string;
  readonly serverDeploy: string;
  readonly addons: readonly string[];
  readonly examples: readonly string[];
}

export type NativeFrontend = (typeof scaffoldOptionLists.native)[number];
export type Runtime = (typeof scaffoldOptionLists.runtime)[number];
export type PackageManager = (typeof scaffoldOptionLists.packageManager)[number];
export type Addon = (typeof scaffoldOptionLists.addons)[number];
export type Example = Exclude<(typeof scaffoldOptionLists.examples)[number], "none">;
