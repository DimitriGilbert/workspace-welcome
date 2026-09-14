import { defineConfig } from "drizzle-kit";

// Dev-time tooling only: the release ships a bundled server, so runtime
// migrations are the embedded TS modules in src/migrations/, never this
// folder. Dialect "turso" mirrors the proven-working probe config from the
// Phase-1 harvest — the emitted DDL and journal are plain SQLite.
export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "turso",
  dbCredentials: {
    url: process.env.DATABASE_URL || "",
  },
});
