import { createFileRoute, redirect } from "@tanstack/react-router";

import { themeSearchSchema } from "../-theme-shell";

/**
 * `/app/<slug>/project/<path…>` is dead (owner order: `/` is THE app) — it
 * survives as a permanent redirect to the top-level project route
 * `/project/<path…>`, carrying the theme slug as `?preset=` (persisted on
 * mount by the target page) plus the `?scheme=`/`?bare=` deep-link params.
 * Nothing under `/app` renders.
 */
export const Route = createFileRoute("/app/$theme/project/$")({
  validateSearch: themeSearchSchema,
  beforeLoad: ({ params, search }) => {
    throw redirect({
      to: "/project/$",
      params: { _splat: params._splat ?? "" },
      search: { ...search, preset: params.theme },
      replace: true,
    });
  },
});
