import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * `/` cutover (master plan §5 K5): the widget system at `/app` is the
 * dashboard. The legacy dashboard this route used to render is preserved
 * in git history (revert this file to before the K5 commit to restore it).
 */
export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/app/mission-control" });
  },
});
