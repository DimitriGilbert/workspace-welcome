import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * `/app` is dead (owner order: "THESE MUST NOT BE ACCESSIBLE BY THERE" —
 * `/` is THE app). The path survives only as a permanent redirect to the
 * entrypoint; nothing under `/app` renders.
 */
export const Route = createFileRoute("/app/")({
  beforeLoad: () => {
    throw redirect({ to: "/", replace: true });
  },
});
