import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { LabPage } from "@/widgets/lab/lab-page";

/**
 * Dev-only widget-lab route (master plan §3.2, §5 W4): `/app/__lab`.
 *
 * The file name uses the generator's `[...]` escape: a bare `__lab.tsx`
 * parses as a PATHLESS route (leading-underscore convention) and the URL
 * segment would disappear — the brackets keep the literal `/app/__lab` path
 * the plan freezes. This route REPLACES the temporary M2 `/app/__check`
 * (deleted): the harness self-test panel now lives here behind
 * `?self-test=1`, keeping the end state at exactly two dev routes.
 *
 * Dev-only by convention, the same way M2's `__check` was: nothing
 * production-facing links here, and the route dies with the legacy cleanup
 * — it stays servable in built previews because the harness suites
 * (`--suite lab`, `--suite self-test`) run against the deployed service,
 * which serves the production build.
 */
const searchSchema = z.object({
  "self-test": z.union([z.literal(1), z.literal("1")]).optional().catch(undefined),
});

export const Route = createFileRoute("/app/__lab")({
  validateSearch: searchSchema,
  component: LabRoute,
});

function LabRoute() {
  const selfTest = Route.useSearch()["self-test"];
  return <LabPage selfTest={selfTest !== undefined} />;
}
