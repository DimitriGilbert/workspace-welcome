import { createFileRoute, redirect } from "@tanstack/react-router";

import { themeSearchSchema } from "../-theme-shell";

/**
 * `/app/<slug>` is dead (owner order: `/` is THE app) — it survives as a
 * permanent redirect that CARRIES the selection: the target `/?preset=<slug>`
 * persists the slug as the saved preset on mount (registered slugs only;
 * unknown ones are dropped by the prefs store) and renders the board. The
 * `__lab` slug forwards to the lab bench's new top-level home instead —
 * nothing under `/app` resolves to a rendered page.
 */
export const Route = createFileRoute("/app/$theme/")({
  validateSearch: themeSearchSchema,
  beforeLoad: ({ params, search }) => {
    if (params.theme === "__lab") {
      throw redirect({ to: "/__lab", search: true, replace: true });
    }
    throw redirect({
      to: "/",
      search: { ...search, preset: params.theme },
      replace: true,
    });
  },
});
