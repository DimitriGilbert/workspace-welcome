import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * The theme `/app` forwards to. Owner-flippable at the G1 gate — this one
 * line is the whole switch.
 */
const DEFAULT_THEME = "mission-control";

/**
 * `/app` is a pure alias: it always forwards to the default theme's
 * dashboard so the URL carries an explicit theme slug.
 */
export const Route = createFileRoute("/app/")({
  beforeLoad: () => {
    throw redirect({
      to: "/app/$theme",
      params: { theme: DEFAULT_THEME },
      replace: true,
    });
  },
});
