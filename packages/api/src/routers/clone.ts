import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  CloneJobRunningError,
  getCloneJob,
  startCloneJob,
} from "../lib/clone-job";
import { cloneInputSchema } from "../lib/clone-options";
import { publicProcedure, router } from "../index";

/**
 * Clone router: kick off a git clone into a registered root and poll its
 * state. One clone at a time — a start while another job runs is a
 * BAD_REQUEST; a null job after "running" means the server restarted and
 * lost the in-memory registry.
 */
export const cloneRouter = router({
  start: publicProcedure
    .input(cloneInputSchema)
    .mutation(({ input }) => {
      try {
        return startCloneJob(input);
      } catch (err) {
        if (err instanceof CloneJobRunningError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: err.message });
        }
        throw err;
      }
    }),

  /** Job snapshot for polling; null when the id is unknown or was GC'd. */
  job: publicProcedure
    .input(z.object({ jobId: z.string() }))
    .query(({ input }) => getCloneJob(input.jobId)),
});
