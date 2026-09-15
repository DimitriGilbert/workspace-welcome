import { publicProcedure, router } from "../index";

import { artifactsRouter } from "./artifacts";
import { cloneRouter } from "./clone";
import { filesRouter } from "./files";
import { forgeRouter } from "./forge";
import { ideRouter } from "./ide";
import { ideationRouter } from "./ideation";
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
  artifacts: artifactsRouter,
  ide: ideRouter,
  ideation: ideationRouter,
  scaffold: scaffoldRouter,
  clone: cloneRouter,
  forge: forgeRouter,
});

export type AppRouter = typeof appRouter;
