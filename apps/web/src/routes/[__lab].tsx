import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { LabPage } from "@/components/lab/lab-page";

/**
 * Dev-only widget-lab route (master plan §3.2, §5 W4): `/__lab`.
 *
 * Moved to the top level (owner order: nothing lives under `/app` — `/` is
 * THE app and the lab is a harness bench, not an app page). The old
 * `/app/__lab` path redirects here through the dead `/app/$theme` alias.
 *
 * The file name uses the generator's `[...]` escape: a bare `__lab.tsx`
 * parses as a PATHLESS route (leading-underscore convention) and the URL
 * segment would disappear — the brackets keep the literal `/__lab` path.
 * The harness self-test panel lives here behind `?self-test=1`. Dev-only by
 * convention: nothing production-facing links here, and the harness suites
 * (`--suite lab`, `--suite self-test`) run against the deployed service,
 * which serves the production build.
 */
const searchSchema = z.object({
  "self-test": z.union([z.literal(1), z.literal("1")]).optional().catch(undefined),
});

export const Route = createFileRoute("/__lab")({
  validateSearch: searchSchema,
  component: LabRoute,
});

function LabRoute() {
  const selfTest = Route.useSearch()["self-test"];
  return <LabPage selfTest={selfTest !== undefined} />;
}
