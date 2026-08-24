import { z } from "zod";

import { ensureInstalled, ideStatus, startServer, stopServer } from "../lib/ide";
import { requireKnownProject } from "../lib/known-project";
import { publicProcedure, router } from "../index";

/**
 * IDE router: install-on-demand plus the shared code-server instance
 * (ADRs 0003/0004). The server never builds IDE URLs — the browser may sit on
 * another machine — so `open` returns only the port and the client assembles
 * `http://<window.location.hostname>:<port>/?folder=<abs path>` itself.
 */
export const ideRouter = router({
  /**
   * "Open IDE": validate the project, make sure the binary exists, start the
   * shared server. The first call ever kicks a 100–200 MB download and returns
   * immediately (the mutation must not block on it); the UI keeps polling
   * `status` and deep-links once the port appears. A start failure propagates
   * as a plain Error for the toast.
   */
  open: publicProcedure
    .input(z.object({ path: z.string() }))
    .mutation(async ({ input }) => {
      await requireKnownProject(input.path);
      const install = await ensureInstalled();
      if (install.phase !== "ready") {
        return { status: install.phase, ready: false, port: null };
      }
      const { port } = await startServer();
      return { status: install.phase, ready: true, port };
    }),

  /** Polled by the project page and the Settings IDE card. */
  status: publicProcedure.query(() => ideStatus()),

  /** Stop the shared instance (Settings). */
  stop: publicProcedure.mutation(async () => {
    await stopServer();
    return { ok: true };
  }),
});
