import { parse } from "jsonc-parser";

import { scaffoldOptionLists } from "../scaffold-options";
import type { Addon, AgentsMdConfig, BtsJsoncConfig, Example, NativeFrontend, PackageManager, Runtime } from "./types";

/** "none" means "no examples" in the normalized config, so it is not stored. */
const EXAMPLE_VALUES: readonly Example[] = ["todo", "ai"];
const ADDON_VALUES: readonly Addon[] = scaffoldOptionLists.addons;

/**
 * bts.jsonc is JSONC with both comments and trailing commas, so JSON.parse
 * is not enough — jsonc-parser (already tiny and dependency-free) handles
 * both. The result is narrowed with plain type guards; jsonc-parser's own
 * `any` return never escapes this function.
 */

/** Thrown when a bts.jsonc file does not contain a JSON object. */
export class BtsJsoncParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BtsJsoncParseError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringOr(record: Record<string, unknown>, key: string, fallback: string): string {
  const value = record[key];
  return typeof value === "string" ? value : fallback;
}

function stringArrayOr(record: Record<string, unknown>, key: string): readonly string[] {
  const value = record[key];
  if (typeof value === "string") return [value];
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

/** Parse the contents of a bts.jsonc file into the raw generator input. */
export function parseBtsJsonc(text: string): BtsJsoncConfig {
  const value: unknown = parse(text);
  if (!isRecord(value)) {
    throw new BtsJsoncParseError("does not contain a JSON object");
  }
  return {
    reproducibleCommand: stringOr(value, "reproducibleCommand", ""),
    frontend: stringArrayOr(value, "frontend"),
    backend: stringOr(value, "backend", "none"),
    runtime: stringOr(value, "runtime", "none"),
    api: stringOr(value, "api", "none"),
    auth: stringOr(value, "auth", "none"),
    payments: stringOr(value, "payments", "none"),
    database: stringOr(value, "database", "none"),
    orm: stringOr(value, "orm", "none"),
    dbSetup: stringOr(value, "dbSetup", "none"),
    packageManager: stringOr(value, "packageManager", "pnpm"),
    webDeploy: stringOr(value, "webDeploy", "none"),
    serverDeploy: stringOr(value, "serverDeploy", "none"),
    addons: stringArrayOr(value, "addons"),
    examples: stringArrayOr(value, "examples"),
  };
}

/** Return the allowed value matching `candidate`, or null. */
function pickValue<T extends string>(allowed: readonly T[], candidate: string): T | null {
  for (const value of allowed) {
    if (value === candidate) return value;
  }
  return null;
}

function filterValues<T extends string>(allowed: readonly T[], candidates: readonly string[]): T[] {
  const picked: T[] = [];
  for (const candidate of candidates) {
    const value = pickValue(allowed, candidate);
    if (value !== null) picked.push(value);
  }
  return picked;
}

/**
 * Build the normalized generator config from a parsed bts.jsonc.
 *
 * Legacy or out-of-vocabulary values (api "orpc", backend "convex", …) pass
 * through as plain strings; closed wizard vocabularies fall back to their
 * default ("none", package manager "pnpm" per the Phase 1 contradiction
 * resolutions). Addons the generator does not know are dropped.
 */
export function agentsMdConfigFromBtsJsonc(
  config: BtsJsoncConfig,
  projectName: string,
): AgentsMdConfig {
  const nativeCandidate = config.frontend.find((entry) => entry.startsWith("native-"));
  const native: NativeFrontend =
    nativeCandidate === undefined ? "none" : (pickValue(scaffoldOptionLists.native, nativeCandidate) ?? "none");
  const runtime: Runtime = pickValue(scaffoldOptionLists.runtime, config.runtime) ?? "none";
  const packageManager: PackageManager =
    pickValue(scaffoldOptionLists.packageManager, config.packageManager) ?? "pnpm";
  return {
    projectName,
    frontends: config.frontend.filter((entry) => !entry.startsWith("native-")),
    native,
    backend: config.backend,
    runtime,
    api: config.api,
    auth: config.auth,
    payments: config.payments,
    database: config.database,
    orm: config.orm,
    dbSetup: config.dbSetup,
    packageManager,
    webDeploy: config.webDeploy,
    serverDeploy: config.serverDeploy,
    addons: filterValues(ADDON_VALUES, config.addons),
    examples: filterValues(EXAMPLE_VALUES, config.examples),
  };
}
