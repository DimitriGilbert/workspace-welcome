import { publicProcedure, router } from "../index";

import { projectsRouter } from "./projects";
import { rootsRouter } from "./roots";
import { settingsRouter } from "./settings";

export const appRouter = router({
  // Kept from the scaffold so the existing client wiring stays valid.
  healthCheck: publicProcedure.query(() => {
    return "OK";
  }),
  roots: rootsRouter,
  projects: projectsRouter,
  settings: settingsRouter,
});

export type AppRouter = typeof appRouter;
