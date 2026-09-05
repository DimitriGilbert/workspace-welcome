import { createFileRoute } from "@tanstack/react-router";

import { SelfTestPanel } from "@/widgets/lab/self-test";

/**
 * TEMPORARY dev-only route for the M2 harness self-test (master plan §3.8,
 * M2.8): `/app/__check` mounts the known-bad fixture panel so
 * `node scripts/widget-check/run.mjs --suite self-test` can prove every
 * probe detects what it exists to detect. DELETED at W4, when the panel
 * folds into `/app/__lab` — the end state is exactly two dev routes. Nothing
 * production-facing may ever link here.
 *
 * The file name uses the generator's `[...]` escape: a bare `__check.tsx`
 * parses as a PATHLESS route (leading-underscore convention) and the URL
 * segment disappears — the brackets keep the literal `/app/__check` path
 * the plan freezes.
 */
export const Route = createFileRoute("/app/__check")({
  component: SelfTestPanel,
});
