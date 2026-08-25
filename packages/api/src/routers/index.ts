import { publicProcedure, router } from "../index";

import { filesRouter } from "./files";
import { ideRouter } from "./ide";
import { projectsRouter } from "./projects";
import { reportsRouter } from "./reports";
import { rootsRouter } from "./roots";
import { scaffoldRouter } from "./scaffold";
import { settingsRouter } from "./settings";

export const appRouter = router({
  // Kept from the scaffold so the existing client wiring stays valid.
  healthCheck: publicProcedure.query(() => {
    return "OK";
  }),
  roots: rootsRouter,
  projects: projectsRouter,
  settings: settingsRouter,
  reports: reportsRouter,
  files: filesRouter,
  ide: ideRouter,
  scaffold: scaffoldRouter,
});

export type AppRouter = typeof appRouter;
