import { z } from "zod";

/**
 * The browser-safe half of the scaffold configuration: option lists,
 * defaults, and the form schema, with zero Node-only imports so the web
 * client can pull them straight into its bundle. The server-side job runner
 * lives in scaffold.ts, which re-exports everything here.
 */

const optionLists = {
  frontend: [
    "tanstack-start",
    "tanstack-router",
    "next",
    "nuxt",
    "svelte",
    "solid",
    "astro",
  ],
  // Native frontends additionally require Node ^22.13.0 || ^24.3.0 || >=26
  // when the package manager is not bun (this host runs v24.19.0, which
  // satisfies the range).
  native: ["none", "native-bare", "native-uniwind", "native-unistyles"],
  backend: ["self", "hono", "express", "fastify", "elysia"],
  runtime: ["none", "node", "bun"],
  api: ["trpc", "none"],
  auth: ["better-auth", "none"],
  payments: ["none", "polar"],
  database: ["sqlite", "postgres", "mysql", "mongodb"],
  orm: ["drizzle", "prisma"],
  dbSetup: [
    "none",
    "turso",
    "neon",
    "prisma-postgres",
    "planetscale",
    "mongodb-atlas",
    "supabase",
    "d1",
    "docker",
  ],
  packageManager: ["pnpm", "npm", "bun"],
  webDeploy: ["docker", "none", "vercel", "cloudflare", "prisma"],
  serverDeploy: ["none", "docker", "vercel", "cloudflare", "prisma"],
  addons: [
    "pwa",
    "tauri",
    "electrobun",
    "starlight",
    "biome",
    "lefthook",
    "husky",
    "mcp",
    "turborepo",
    "nx",
    "vite-plus",
    "fumadocs",
    "ultracite",
    "oxlint",
    "opentui",
    "wxt",
    "skills",
    "evlog",
  ],
  examples: ["none", "todo", "ai"],
} as const;

type BackendValue = (typeof optionLists)["backend"][number];
type RuntimeValue = (typeof optionLists)["runtime"][number];
type ServerDeployValue = (typeof optionLists)["serverDeploy"][number];
type DatabaseValue = (typeof optionLists)["database"][number];
type DbSetupValue = (typeof optionLists)["dbSetup"][number];
type AddonValue = (typeof optionLists)["addons"][number];
type WebFrontendValue = (typeof optionLists)["frontend"][number];

/**
 * Addon frontend allow-lists, mirroring upstream ADDON_COMPATIBILITY
 * (create-better-t-stack@3.40.5 dist bundle: only pwa, tauri, and electrobun
 * carry lists — tauri/electrobun share desktopWebFrontends; every other addon
 * has none, which upstream treats as "no frontend requirement").
 * react-router is offered by upstream but not by this wizard, so it is
 * omitted from the lists (and from the printed reasons).
 */
const addonFrontends: Readonly<
  Record<"pwa" | "tauri" | "electrobun", readonly WebFrontendValue[]>
> = {
  pwa: ["tanstack-router", "solid", "next"],
  tauri: [
    "tanstack-router",
    "tanstack-start",
    "next",
    "nuxt",
    "svelte",
    "astro",
  ],
  electrobun: [
    "tanstack-router",
    "tanstack-start",
    "next",
    "nuxt",
    "svelte",
    "astro",
  ],
};

/** Upstream TASK_RUNNER_ADDONS: at most one may be selected. */
const taskRunnerAddons: readonly AddonValue[] = [
  "turborepo",
  "nx",
  "vite-plus",
];

/** Upstream STATIC_DESKTOP_ADDONS: static-export desktop shells. */
const staticDesktopAddons: readonly AddonValue[] = ["tauri", "electrobun"];

/** Upstream EVLOG_SERVER_BACKENDS: backends evlog can attach to directly. */
const evlogServerBackends: readonly BackendValue[] = [
  "hono",
  "express",
  "fastify",
  "elysia",
];

/**
 * Upstream EVLOG_FULLSTACK_FRONTENDS: fullstack (self) frontends evlog
 * supports. Upstream DESKTOP_STATIC_EXPORT_FRONTENDS additionally lists
 * react-router, which this wizard does not offer.
 */
const evlogFullstackFrontends: readonly WebFrontendValue[] = [
  "next",
  "tanstack-start",
  "nuxt",
  "svelte",
  "astro",
];
const desktopStaticExportFrontends: readonly WebFrontendValue[] = [
  "next",
  "svelte",
  "astro",
];

/** The choices the addon compatibility rules depend on. */
export interface AddonAvailabilityInput {
  readonly frontend: WebFrontendValue;
  readonly backend: BackendValue;
  readonly webDeploy: (typeof optionLists)["webDeploy"][number];
}

/**
 * The upstream incompatibility reason for `addon` under the given choices, or
 * null when compatible. Mirrors validateAddonCompatibility plus the
 * docker/prisma web-deploy desktop checks of create-better-t-stack@3.40.5;
 * the clerk and convex branches are dropped because this wizard offers
 * neither. Native frontends never appear in an upstream allow-list, so
 * checking the web frontend alone matches upstream's whole-array check.
 */
export function addonIncompatibilityReason(
  addon: AddonValue,
  input: AddonAvailabilityInput,
): string | null {
  if (addon === "evlog") {
    if (evlogServerBackends.includes(input.backend)) return null;
    if (
      input.backend === "self" &&
      evlogFullstackFrontends.includes(input.frontend)
    ) {
      return null;
    }
    return "evlog supports the Hono, Express, Fastify, or Elysia backends, or a fullstack (self) backend with Next.js, TanStack Start, Nuxt, SvelteKit, or Astro.";
  }
  if (input.backend === "self" && staticDesktopAddons.includes(addon)) {
    return `${addon} requires a separate backend or no backend because backend 'self' emits server routes that cannot be bundled as static desktop assets.`;
  }
  if (addon === "pwa" || addon === "tauri" || addon === "electrobun") {
    const allowed = addonFrontends[addon];
    if (!allowed.includes(input.frontend)) {
      return `${addon} addon requires one of these frontends: ${allowed.join(", ")}`;
    }
  }
  if (
    staticDesktopAddons.includes(addon) &&
    desktopStaticExportFrontends.includes(input.frontend)
  ) {
    if (input.webDeploy === "docker") {
      return `'--web-deploy docker' is not compatible with the ${addon} addon on '${input.frontend}' because desktop addons switch the web build to a static export, which the docker image cannot serve. Remove the addon or use the static-serving tanstack-router frontend.`;
    }
    if (input.webDeploy === "prisma") {
      return `'--web-deploy prisma' is not compatible with the ${addon} addon on '${input.frontend}' because desktop addons replace its executable server output with a static export, while Prisma Compute requires an executable server artifact.`;
    }
  }
  return null;
}

/** Human labels and one-line descriptions for the addons multiSelect. */
export const addonChoices: Readonly<
  Record<AddonValue, { readonly label: string; readonly description: string }>
> = {
  pwa: {
    label: "PWA",
    description: "Progressive web app support — manifest, icons, offline.",
  },
  tauri: {
    label: "Tauri",
    description: "Desktop app shell built with Tauri.",
  },
  electrobun: {
    label: "Electrobun",
    description: "Desktop app shell built with Electrobun.",
  },
  starlight: {
    label: "Starlight",
    description: "Documentation site with Astro Starlight.",
  },
  biome: {
    label: "Biome",
    description: "Linting and formatting with Biome.",
  },
  lefthook: {
    label: "Lefthook",
    description: "Git hooks managed by Lefthook.",
  },
  husky: {
    label: "Husky",
    description: "Git hooks managed by Husky.",
  },
  mcp: {
    label: "MCP",
    description: "Model Context Protocol servers for AI coding agents.",
  },
  turborepo: {
    label: "Turborepo",
    description: "Turborepo task runner for the monorepo.",
  },
  nx: {
    label: "Nx",
    description: "Nx task runner for the monorepo.",
  },
  "vite-plus": {
    label: "Vite Plus",
    description: "Vite Plus dev-server and task runner setup.",
  },
  fumadocs: {
    label: "Fumadocs",
    description: "Documentation site with Fumadocs.",
  },
  ultracite: {
    label: "Ultracite",
    description: "Opinionated Biome setup curated by Ultracite.",
  },
  oxlint: {
    label: "Oxlint",
    description: "Fast linting with Oxlint.",
  },
  opentui: {
    label: "OpenTUI",
    description: "Terminal UI scaffolding with OpenTUI.",
  },
  wxt: {
    label: "WXT",
    description: "Browser extension development with WXT.",
  },
  skills: {
    label: "Skills",
    description: "Agent skills setup for AI coding tools.",
  },
  evlog: {
    label: "Evlog",
    description: "Structured event logging for the backend.",
  },
};

/** Exported for the form, which disables other task runners once one is picked. */
export const addonsExclusivity = {
  taskRunners: taskRunnerAddons,
  /** Upstream message for combining more than one task runner. */
  taskRunnerMessage:
    "Cannot combine 'turborepo', 'nx', and 'vite-plus' addons. Choose one task runner.",
} as const;

const dependentLists = {
  /** dbSetup values selectable per database (mirrors upstream compatibility rules). */
  dbSetupByDatabase: {
    sqlite: ["none", "turso", "d1"],
    postgres: [
      "none",
      "neon",
      "prisma-postgres",
      "supabase",
      "planetscale",
      "docker",
    ],
    mysql: ["none", "planetscale", "docker"],
    mongodb: ["none", "mongodb-atlas", "docker"],
  } satisfies Record<DatabaseValue, readonly DbSetupValue[]>,
  runtimeByBackend: {
    self: ["none"],
    hono: ["node", "bun"],
    express: ["node", "bun"],
    fastify: ["node", "bun"],
    elysia: ["node", "bun"],
  } satisfies Record<BackendValue, readonly RuntimeValue[]>,
  serverDeployByBackend: {
    self: ["none"],
    hono: ["docker", "vercel", "cloudflare", "prisma", "none"],
    express: ["docker", "vercel", "cloudflare", "prisma", "none"],
    fastify: ["docker", "vercel", "cloudflare", "prisma", "none"],
    elysia: ["docker", "vercel", "cloudflare", "prisma", "none"],
  } satisfies Record<BackendValue, readonly ServerDeployValue[]>,
  /** Default a dependent option should take when it becomes visible. */
  visibleDefaults: {
    runtime: "node",
    serverDeploy: "docker",
  } satisfies {
    runtime: RuntimeValue;
    serverDeploy: ServerDeployValue;
  },
};

export const scaffoldOptionLists = {
  ...optionLists,
  ...dependentLists,
  /** Which options have value lists dependent on another option's value. */
  dependentOn: {
    dbSetup: "database",
    runtime: "backend",
    serverDeploy: "backend",
  },
} as const;

function databasesForDbSetup(dbSetup: DbSetupValue): readonly DatabaseValue[] {
  const databases: DatabaseValue[] = [];
  for (const [database, setups] of Object.entries(
    scaffoldOptionLists.dbSetupByDatabase,
  ) as [DatabaseValue, readonly DbSetupValue[]][]) {
    if (setups.includes(dbSetup)) databases.push(database);
  }
  return databases;
}

const projectNameSchema = z
  .string()
  .trim()
  .min(1, "Project name is required")
  .max(100, "Project name must be 100 characters or fewer")
  .refine(
    (name) => !/[/\u0000-\u001f]/.test(name) && name !== "." && name !== "..",
    "Project name must be a plain directory name",
  )
  .refine(
    (name) => !name.startsWith(".") && !name.startsWith("-"),
    "Project name cannot start with a dot or a dash",
  )
  .refine(
    (name) => !/[<>:"|?*]/.test(name),
    "Project name cannot contain any of < > : \" | ? *",
  )
  .refine(
    (name) => name.toLowerCase() !== "node_modules",
    "Project name is reserved",
  );

export const scaffoldInputSchema = z
  .object({
    projectName: projectNameSchema,
    root: z.string().startsWith("/"),
    frontend: z.enum(scaffoldOptionLists.frontend),
    native: z.enum(scaffoldOptionLists.native),
    backend: z.enum(scaffoldOptionLists.backend),
    runtime: z.enum(scaffoldOptionLists.runtime),
    api: z.enum(scaffoldOptionLists.api),
    auth: z.enum(scaffoldOptionLists.auth),
    payments: z.enum(scaffoldOptionLists.payments),
    database: z.enum(scaffoldOptionLists.database),
    orm: z.enum(scaffoldOptionLists.orm),
    dbSetup: z.enum(scaffoldOptionLists.dbSetup),
    packageManager: z.enum(scaffoldOptionLists.packageManager),
    git: z.boolean(),
    install: z.boolean(),
    webDeploy: z.enum(scaffoldOptionLists.webDeploy),
    serverDeploy: z.enum(scaffoldOptionLists.serverDeploy),
    addons: z.array(z.enum(scaffoldOptionLists.addons)),
    examples: z.enum(scaffoldOptionLists.examples),
  })
  .superRefine((input, ctx) => {
    if (input.backend === "self" && input.runtime !== "none") {
      ctx.addIssue({
        code: "custom",
        path: ["runtime"],
        message:
          "A fullstack (self) backend runs its own server — runtime must be 'none'",
      });
    }
    if (input.backend === "self" && input.serverDeploy !== "none") {
      ctx.addIssue({
        code: "custom",
        path: ["serverDeploy"],
        message:
          "A fullstack (self) backend has no separate server — serverDeploy must be 'none' (use webDeploy for docker)",
      });
    }
    const databases = databasesForDbSetup(input.dbSetup);
    if (!databases.includes(input.database)) {
      ctx.addIssue({
        code: "custom",
        path: ["dbSetup"],
        message: `dbSetup '${input.dbSetup}' requires database ${databases.join(" or ")}`,
      });
    }
    if (input.database === "mongodb" && input.orm !== "prisma") {
      ctx.addIssue({
        code: "custom",
        path: ["orm"],
        message: "The mongodb database requires the prisma orm",
      });
    }
    // Upstream validateAddonsAgainstFrontends rejects combining task runners
    // verbatim, and validateAddonCompatibility covers each selected addon.
    const taskRunners = input.addons.filter((addon) =>
      taskRunnerAddons.includes(addon),
    );
    if (taskRunners.length > 1) {
      ctx.addIssue({
        code: "custom",
        path: ["addons"],
        message: addonsExclusivity.taskRunnerMessage,
      });
    }
    for (const addon of input.addons) {
      const reason = addonIncompatibilityReason(addon, input);
      if (reason !== null) {
        ctx.addIssue({
          code: "custom",
          path: ["addons"],
          message: `Incompatible addon '${addon}': ${reason}`,
        });
      }
    }
  });

export type ScaffoldInput = z.infer<typeof scaffoldInputSchema>;

export const scaffoldDefaults = {
  frontend: "tanstack-start",
  native: "none",
  backend: "self",
  runtime: "none",
  api: "trpc",
  auth: "better-auth",
  payments: "none",
  database: "sqlite",
  orm: "drizzle",
  dbSetup: "none",
  packageManager: "pnpm",
  git: true,
  install: true,
  webDeploy: "docker",
  serverDeploy: "none",
  addons: ["turborepo"],
  examples: "none",
} satisfies Omit<ScaffoldInput, "projectName" | "root">;
