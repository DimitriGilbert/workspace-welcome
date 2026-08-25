import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  getScaffoldJob,
  scaffoldInputSchema,
  ScaffoldJobRunningError,
  startScaffoldJob,
} from "../lib/scaffold";
import { publicProcedure, router } from "../index";

/**
 * Scaffold router: kick off a better-t-stack project job and poll its state.
 * One scaffold at a time — a start while another job runs is a BAD_REQUEST;
 * a null job after "running" means the server restarted and lost the
 * in-memory registry.
 */
export const scaffoldRouter = router({
  start: publicProcedure
    .input(scaffoldInputSchema)
    .mutation(({ input }) => {
      try {
        return startScaffoldJob(input);
      } catch (err) {
        if (err instanceof ScaffoldJobRunningError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: err.message });
        }
        throw err;
      }
    }),

  /** Job snapshot for polling; null when the id is unknown or was GC'd. */
  job: publicProcedure
    .input(z.object({ jobId: z.string() }))
    .query(({ input }) => getScaffoldJob(input.jobId)),
});
