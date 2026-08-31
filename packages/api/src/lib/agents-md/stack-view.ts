import type { PackageManager } from "./types";
import type { AgentsMdConfig } from "./types";

/**
 * Maps an AgentsMdConfig onto the sections of the generated file. Command
 * names and package layout mirror what create-better-t-stack actually
 * writes (verified against 3.40.5's updateRootPackageJson /
 * getPackageManagerConfig / getDbScriptSupport / getLocalD1Owner and
 * scaffolded fixtures);
 * anything the config does not select is omitted, never emitted as a
 * placeholder.
 */

export interface PackageRow {
  readonly path: string;
  readonly name: string;
  readonly purpose: string;
}

export interface StackView {
  readonly description: string;
  readonly packageManagerLine: string;
  readonly workspaceIntro: string;
  readonly packageRows: readonly PackageRow[];
  /** Rendered "Commands" bullets (without the leading "- "). */
  readonly commands: readonly string[];
  /** `<packageManager> run`, used by the verification-gate directive. */
  readonly runCmd: string;
  readonly catalogHint: string;
  /** Extra working-agreement bullets contributed by selected addons. */
  readonly extraAgreements: readonly string[];
}

const SPLIT_BACKENDS: Readonly<Record<string, string>> = {
  hono: "Hono",
  express: "Express",
  fastify: "Fastify",
  elysia: "Elysia",
};

/** Backends rendered as a separate service even though they are not apps/server splits. */
const OTHER_BACKENDS: Readonly<Record<string, string>> = {
  convex: "Convex",
};

function splitServerLabel(backend: string): string | null {
  return label(SPLIT_BACKENDS, backend);
}

function otherBackendLabel(backend: string): string | null {
  if (splitServerLabel(backend) !== null) return null;
  const known = OTHER_BACKENDS[backend];
  if (known !== undefined) return known;
  // Historical unknown backends render as themselves; "self" and "none"
  // are handled by their own description branches.
  return backend === "self" || backend === "none" ? null : `\`${backend}\``;
}

const WEB_FRONTENDS: Readonly<Record<string, string>> = {
  "tanstack-start": "TanStack Start",
  "tanstack-router": "TanStack Router (SPA)",
  next: "Next.js",
  nuxt: "Nuxt",
  svelte: "SvelteKit",
  solid: "SolidStart",
  astro: "Astro",
};

const NATIVE_STYLES: Readonly<Record<string, string>> = {
  "native-bare": "bare Expo",
  "native-uniwind": "Uniwind styling",
  "native-unistyles": "Unistyles styling",
};

const DATABASES: Readonly<Record<string, string>> = {
  sqlite: "SQLite",
  postgres: "PostgreSQL",
  mysql: "MySQL",
  mongodb: "MongoDB",
};

function label(labels: Readonly<Record<string, string>>, value: string): string | null {
  return labels[value] ?? null;
}

function rawLabel(labels: Readonly<Record<string, string>>, value: string): string | null {
  const known = labels[value];
  if (known !== undefined) return known;
  // Unknown historical values (api "orpc", database "none", backend
  // "convex", …) are rendered as themselves instead of being dropped.
  return value === "none" ? null : `\`${value}\``;
}

/** "a" or "an" for an interpolated name, ignoring `` ` ``-quoting. */
function article(name: string): "a" | "an" {
  return /^[aeiou]/i.test(name.replace(/`/g, "")) ? "an" : "a";
}

function joinAnd(parts: readonly string[]): string {
  if (parts.length === 1) return parts[0] ?? "";
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  const head = parts.slice(0, -1).join(", ");
  const last = parts[parts.length - 1] ?? "";
  return `${head}, and ${last}`;
}

/** `pnpm dev` / `npm run dev` / `bun dev` — the root-script shortcut form. */
function quickCommand(pm: PackageManager, script: string): string {
  return pm === "npm" ? `npm run ${script}` : `${pm} ${script}`;
}

/** `pnpm --filter web dev` / `npm run dev -w web` / `bun run --filter web dev`. */
function perPackageCommand(pm: PackageManager, name: string, script: string): string {
  switch (pm) {
    case "pnpm":
      return `pnpm --filter ${name} ${script}`;
    case "npm":
      return `npm run ${script} -w ${name}`;
    case "bun":
      return `bun run --filter ${name} ${script}`;
  }
}

/** `pnpm turbo run <task>` / `npx nx run-many …` / `bunx vp …` — local bins. */
function execCommand(pm: PackageManager, bin: string, args: string): string {
  const runner = pm === "pnpm" ? "pnpm" : pm === "npm" ? "npx" : "bunx";
  return `${runner} ${bin} ${args}`;
}

function crossPackageCommand(config: AgentsMdConfig): string {
  if (config.addons.includes("turborepo")) return execCommand(config.packageManager, "turbo", "run <task>");
  if (config.addons.includes("nx")) return execCommand(config.packageManager, "nx", "run-many -t <task>");
  if (config.addons.includes("vite-plus")) return execCommand(config.packageManager, "vp", "run -r <task>");
  switch (config.packageManager) {
    case "pnpm":
      return "pnpm -r <script>";
    case "npm":
      return "npm run <script> --workspaces";
    case "bun":
      return "bun run --filter '*' <script>";
  }
}

function buildDescription(config: AgentsMdConfig): string {
  const web = config.frontends
    .map((frontend) => rawLabel(WEB_FRONTENDS, frontend) ?? `\`${frontend}\``)
    .join(" + ");
  const api = rawLabel({ trpc: "tRPC", orpc: "oRPC" }, config.api);
  const parts: string[] = [];

  if (splitServerLabel(config.backend) !== null) {
    const server = splitServerLabel(config.backend) ?? "";
    const runtime = label({ node: "Node", bun: "Bun" }, config.runtime);
    const app = web !== "" ? `${web} web app` : "app";
    parts.push(
      `${app} with ${article(server)} ${server} API server${runtime === null ? "" : ` on ${runtime}`}`,
    );
  } else if (config.backend === "self") {
    const routes = api !== null ? `${api}-backed server routes` : "server routes";
    parts.push(`fullstack ${web} app (${routes} inside the app)`);
  } else {
    const other = otherBackendLabel(config.backend);
    if (other !== null) {
      parts.push(`${web !== "" ? web : "web"} app with ${article(other)} ${other} backend`);
    } else {
      parts.push(`${web !== "" ? web : "web"} app (frontend-only, no server)`);
    }
  }

  if (config.native !== "none") {
    const style = label(NATIVE_STYLES, config.native) ?? config.native;
    parts.push(`an Expo/React Native app (${style})`);
  }
  if (api !== null && config.backend !== "self") {
    parts.push(
      splitServerLabel(config.backend) !== null
        ? `a shared ${api} API`
        : `${article(api)} ${api} API`,
    );
  }
  const database = hasDatabase(config)
    ? rawLabel({ drizzle: "Drizzle", prisma: "Prisma" }, config.orm)
    : null;
  if (database !== null) {
    parts.push(`${database} ORM on ${rawLabel(DATABASES, config.database) ?? config.database}`);
  }
  const auth = rawLabel({ "better-auth": "Better Auth" }, config.auth);
  if (auth !== null) parts.push(`${auth} authentication`);
  if (config.payments === "polar") parts.push("Polar payments");

  return `\`${config.projectName}\` is a TypeScript monorepo — ${joinAnd(parts)}.`;
}

function hasDatabase(config: AgentsMdConfig): boolean {
  return config.database !== "none" && config.orm !== "none";
}

function buildPackageRows(config: AgentsMdConfig): PackageRow[] {
  const web = config.frontends
    .map((frontend) => rawLabel(WEB_FRONTENDS, frontend) ?? `\`${frontend}\``)
    .join(" + ");
  const api = rawLabel({ trpc: "tRPC", orpc: "oRPC" }, config.api);
  const server = splitServerLabel(config.backend);
  const otherBackend = otherBackendLabel(config.backend);
  const pmName = config.projectName;
  const rows: PackageRow[] = [];

  if (web !== "") {
    const purpose =
      config.backend === "self"
        ? `Fullstack ${web} app: UI, server routes${api === null ? "" : `, ${api} API`}`
        : server !== null || otherBackend !== null
          ? `${web} web client`
          : `${web} web app`;
    rows.push({ path: "apps/web", name: "web", purpose });
  }
  if (config.native !== "none") {
    const style = label(NATIVE_STYLES, config.native) ?? config.native;
    rows.push({ path: "apps/native", name: "native", purpose: `Expo/React Native app (${style})` });
  }
  if (server !== null) {
    const runtime = label({ node: "Node", bun: "Bun" }, config.runtime);
    rows.push({
      path: "apps/server",
      name: "server",
      purpose: `${server} API server${runtime === null ? "" : ` (${runtime})`}`,
    });
  }
  if (otherBackend !== null) {
    rows.push({
      path: "packages/backend",
      name: `@${pmName}/backend`,
      purpose: `${otherBackend} backend`,
    });
  }
  if (config.addons.includes("electrobun")) {
    rows.push({ path: "apps/desktop", name: "desktop", purpose: "Electrobun desktop shell" });
  }
  if (config.addons.includes("starlight")) {
    rows.push({ path: "apps/docs", name: "docs", purpose: "Astro Starlight docs site" });
  }
  if (config.addons.includes("fumadocs")) {
    rows.push({ path: "apps/fumadocs", name: "fumadocs", purpose: "Fumadocs docs site" });
  }
  if (config.addons.includes("wxt")) {
    rows.push({ path: "apps/extension", name: "extension", purpose: "Browser extension (WXT)" });
  }
  if (config.addons.includes("opentui")) {
    rows.push({ path: "apps/tui", name: "tui", purpose: "Terminal UI (OpenTUI)" });
  }
  if (api !== null) {
    rows.push({ path: "packages/api", name: `@${pmName}/api`, purpose: `${api} routers and client` });
  }
  if (hasDatabase(config)) {
    const orm = rawLabel({ drizzle: "Drizzle", prisma: "Prisma" }, config.orm) ?? config.orm;
    const database = rawLabel(DATABASES, config.database) ?? config.database;
    rows.push({ path: "packages/db", name: `@${pmName}/db`, purpose: `${orm} schema + migrations (${database})` });
  }
  if (config.backend !== "none" && (config.auth !== "none" || config.payments === "polar")) {
    const purposes: string[] = [];
    const auth = rawLabel({ "better-auth": "Better Auth" }, config.auth);
    if (auth !== null) purposes.push(auth);
    if (config.payments === "polar") purposes.push("Polar payments");
    rows.push({ path: "packages/auth", name: `@${pmName}/auth`, purpose: purposes.join(" + ") });
  }
  const infraTargets = [config.webDeploy, config.serverDeploy].filter(
    (deploy) => deploy === "cloudflare" || deploy === "prisma",
  );
  if (infraTargets.length > 0) {
    rows.push({
      path: "packages/infra",
      name: `@${pmName}/infra`,
      purpose: `Alchemy deploy infrastructure (${infraTargets
        .map((target) => (target === "cloudflare" ? "Cloudflare" : "Prisma"))
        .join("/")})`,
    });
  }
  rows.push({ path: "packages/ui", name: `@${pmName}/ui`, purpose: "Shared UI components (Tailwind CSS v4)" });
  rows.push({ path: "packages/env", name: `@${pmName}/env`, purpose: "Typed environment validation" });
  rows.push({ path: "packages/config", name: `@${pmName}/config`, purpose: "Shared tsconfig and build config" });
  return rows;
}

function lintCommand(config: AgentsMdConfig): string | null {
  const quick = config.packageManager;
  const parts: string[] = [];
  if (config.addons.includes("biome")) {
    parts.push(`\`${quickCommand(quick, "check")}\` runs Biome lint + format (writes fixes)`);
  }
  if (config.addons.includes("ultracite")) {
    parts.push(
      `\`${quickCommand(quick, "check")}\` runs Ultracite checks, \`${quickCommand(quick, "fix")}\` auto-fixes`,
    );
  }
  if (config.addons.includes("oxlint")) {
    parts.push(`\`${quickCommand(quick, "check")}\` runs oxlint + oxfmt (writes fixes)`);
  }
  if (config.addons.includes("vite-plus")) {
    parts.push(
      `\`${quickCommand(quick, "lint")}\`, \`${quickCommand(quick, "format")}\`, and \`${quickCommand(quick, "check")}\` come from Vite Plus`,
    );
  }
  if (parts.length === 0) return null;
  return `Lint & format: ${parts.join("; ")}`;
}

/**
 * Which root `db:*` scripts exist — mirrors 3.40.5's getDbScriptSupport,
 * including its precedence: d1 + Alchemy (`serverDeploy === "cloudflare"`, or
 * a self backend with `webDeploy === "cloudflare"`) keeps only `db:generate`
 * (and `db:migrate` for Prisma); other setups get the full set.
 */
interface DbScriptSupport {
  readonly hasScripts: boolean;
  readonly hasPush: boolean;
  readonly hasGenerate: boolean;
  readonly hasMigrate: boolean;
  readonly hasStudio: boolean;
}

function dbScriptSupport(config: AgentsMdConfig): DbScriptSupport {
  const isD1Alchemy =
    config.dbSetup === "d1" &&
    (config.serverDeploy === "cloudflare" ||
      (config.backend === "self" && config.webDeploy === "cloudflare"));
  const hasScripts =
    config.backend !== "convex" &&
    config.backend !== "none" &&
    config.database !== "none" &&
    config.orm !== "none" &&
    config.orm !== "mongoose";
  return {
    hasScripts,
    hasPush: hasScripts && !isD1Alchemy,
    hasGenerate: hasScripts,
    hasMigrate:
      hasScripts && (config.orm === "prisma" || (config.orm === "drizzle" && !isD1Alchemy)),
    hasStudio: hasScripts && !isD1Alchemy,
  };
}

/** Frontends whose dev server owns local D1 through wrangler (bts getLocalD1Owner). */
const WRANGLER_LOCAL_D1_FRONTENDS: readonly string[] = ["next", "svelte", "solid"];

/**
 * bts's getLocalD1Owner === "wrangler": self backend on Cloudflare D1 with a
 * next/svelte/solid frontend gets a root `db:migrate:local` script; nuxt and
 * astro hand local D1 to the Alchemy provider instead, other frontends get
 * neither.
 */
function hasWranglerLocalD1(config: AgentsMdConfig): boolean {
  return (
    config.backend === "self" &&
    config.dbSetup === "d1" &&
    config.webDeploy === "cloudflare" &&
    WRANGLER_LOCAL_D1_FRONTENDS.some((frontend) => config.frontends.includes(frontend))
  );
}

function databaseCommand(config: AgentsMdConfig): string | null {
  const support = dbScriptSupport(config);
  if (!support.hasScripts) return null;
  const quick = config.packageManager;
  const parts = [
    support.hasPush ? `\`${quickCommand(quick, "db:push")}\` pushes the schema` : null,
    support.hasGenerate ? `\`${quickCommand(quick, "db:generate")}\` regenerates the client` : null,
    support.hasMigrate ? `\`${quickCommand(quick, "db:migrate")}\` applies migrations` : null,
    support.hasStudio ? `\`${quickCommand(quick, "db:studio")}\` opens the data browser` : null,
  ].filter((part): part is string => part !== null);
  if (config.database === "sqlite" && config.dbSetup !== "d1") {
    parts.push(`\`${quickCommand(quick, "db:local")}\` starts a local database`);
  }
  if (hasWranglerLocalD1(config)) {
    parts.push(`\`${quickCommand(quick, "db:migrate:local")}\` migrates the local D1 database`);
  }
  if (config.dbSetup === "docker") {
    parts.push(`\`${quickCommand(quick, "db:start")}\` / \`db:stop\` manage the local container`);
  }
  return `Database (\`packages/db\`): ${parts.join(", ")}`;
}

function deployCommands(config: AgentsMdConfig): string[] {
  const deploys = [config.webDeploy, config.serverDeploy];
  const lines: string[] = [];
  if (deploys.includes("docker")) {
    lines.push(
      `Docker Compose: \`${quickCommand(config.packageManager, "docker:build")}\`, \`docker:up\`, \`docker:logs\`, \`docker:down\``,
    );
  }
  // Root deploy scripts differ by target (3.40.5 updateRootPackageJson):
  // vercel writes `deploy*` plus `env:preview`/`env:production`; Alchemy
  // targets (cloudflare/prisma) write `deploy*` plus `destroy`.
  const hasVercel = deploys.includes("vercel");
  const hasAlchemy = deploys.some((deploy) => deploy === "cloudflare" || deploy === "prisma");
  if (hasVercel || hasAlchemy) {
    const groups = [
      "`deploy*`",
      hasVercel ? "`env:*`" : null,
      hasAlchemy ? "`destroy`" : null,
    ].filter((group): group is string => group !== null);
    lines.push(
      `Deployments: ${groups.join(" / ")} scripts in the root package.json — inspect them before running`,
    );
  }
  return lines;
}

function hooksCommand(config: AgentsMdConfig): string | null {
  if (config.addons.includes("husky")) {
    return `Git hooks: \`${quickCommand(config.packageManager, "prepare")}\` initializes Husky`;
  }
  if (config.addons.includes("lefthook")) {
    return "Git hooks: Lefthook runs on commit (see `lefthook.yml`)";
  }
  if (config.addons.includes("vite-plus")) {
    return `Git hooks: \`${quickCommand(config.packageManager, "hooks:setup")}\` enables Vite Plus commit hooks`;
  }
  return null;
}

function buildCommands(config: AgentsMdConfig): string[] {
  const pm = config.packageManager;
  const quick = pm;
  const commands: string[] = [];

  const devTargets: string[] = [`\`${quickCommand(quick, "dev")}\` (all apps)`];
  if (config.frontends.length > 0) devTargets.push(`\`${quickCommand(quick, "dev:web")}\` (web only)`);
  if (SPLIT_BACKENDS[config.backend] !== undefined) {
    devTargets.push(`\`${quickCommand(quick, "dev:server")}\` (API)`);
  }
  if (config.native !== "none") devTargets.push(`\`${quickCommand(quick, "dev:native")}\` (native)`);
  if (config.addons.includes("electrobun")) {
    devTargets.push(`\`${quickCommand(quick, "dev:desktop")}\` (desktop)`);
  }
  if (config.addons.includes("opentui")) devTargets.push(`\`${quickCommand(quick, "dev:tui")}\` (TUI)`);
  commands.push(`Dev: ${devTargets.join(", ")}`);

  commands.push(
    `Build & typecheck: \`${quickCommand(quick, "build")}\`, \`${pm} run check-types\``,
  );

  const database = databaseCommand(config);
  if (database !== null) commands.push(database);

  if (config.addons.includes("tauri")) {
    commands.push(
      `Desktop (Tauri): \`cd apps/web && ${quickCommand(quick, "desktop:dev")}\` / \`desktop:build\``,
    );
  }
  if (config.addons.includes("starlight") || config.addons.includes("fumadocs")) {
    const docs = [
      config.addons.includes("starlight")
        ? `\`${perPackageCommand(pm, "docs", "dev")}\` (Starlight)`
        : null,
      config.addons.includes("fumadocs")
        ? `\`${perPackageCommand(pm, "fumadocs", "dev")}\` (Fumadocs)`
        : null,
    ].filter((entry): entry is string => entry !== null);
    commands.push(`Docs sites: ${docs.join(", ")}`);
  }

  const lint = lintCommand(config);
  if (lint !== null) commands.push(lint);
  const hooks = hooksCommand(config);
  if (hooks !== null) commands.push(hooks);
  commands.push(...deployCommands(config));

  commands.push(
    `Per package: \`${perPackageCommand(pm, "<name>", "<script>")}\` — e.g. \`${perPackageCommand(pm, "web", "dev")}\`; across packages: \`${crossPackageCommand(config)}\``,
  );
  return commands;
}

function buildCatalogHint(pm: PackageManager): string {
  switch (pm) {
    case "pnpm":
      return "Check the `pnpm-workspace.yaml` catalog and existing `package.json` files before adding a dependency, and use `catalog:` references when available";
    case "bun":
      return "Check the `workspaces.catalog` in the root `package.json` and existing `package.json` files before adding a dependency, and use `catalog:` references when available";
    case "npm":
      return "Check existing `package.json` files before adding a dependency — this repo keeps no dependency catalog";
  }
}

function buildWorkspaceIntro(config: AgentsMdConfig): string {
  const runner = config.addons.includes("turborepo")
    ? "Turborepo"
    : config.addons.includes("nx")
      ? "Nx"
      : config.addons.includes("vite-plus")
        ? "Vite Plus"
        : null;
  const base = `${config.packageManager} workspaces monorepo`;
  return runner === null ? `${base}.` : `${base}, with ${runner} running cross-package tasks.`;
}

function buildExtraAgreements(config: AgentsMdConfig): string[] {
  const extras: string[] = [];
  if (config.addons.includes("skills")) {
    extras.push(
      "Project agent skills live in `.agents/skills` — load the relevant one before working with an unfamiliar library.",
    );
  }
  return extras;
}

export function buildStackView(config: AgentsMdConfig): StackView {
  return {
    description: buildDescription(config),
    packageManagerLine:
      `Use \`${config.packageManager}\` for all package operations — never a different package manager or another project's lockfile. ` +
      "Run commands and git operations from the repo root.",
    workspaceIntro: buildWorkspaceIntro(config),
    packageRows: buildPackageRows(config),
    commands: buildCommands(config),
    runCmd: `${config.packageManager} run`,
    catalogHint: buildCatalogHint(config.packageManager),
    extraAgreements: buildExtraAgreements(config),
  };
}
