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
