import { createFileRoute } from "@tanstack/react-router";

import { ThemeNotFound, ThemePageShell, themeSearchSchema } from "../-theme-shell";
import { getThemePreset } from "@/widgets/themes";

/**
 * A theme's project page: `/app/<slug>/project/<path…>`. The splat is the
 * project path (rejoined with its leading "/" by the project provider at the
 * integration phase); the preset's `project` layout defines the page. Same
 * shape as the dashboard: slug resolves or the explicit not-found state
 * renders.
 */
export const Route = createFileRoute("/app/$theme/project/$")({
  validateSearch: themeSearchSchema,
  component: ThemeProjectPage,
});

function ThemeProjectPage() {
  const { theme } = Route.useParams();
  const { bare } = Route.useSearch();
  const preset = getThemePreset(theme);
  if (preset === null) {
    return <ThemeNotFound slug={theme} />;
  }
  return <ThemePageShell preset={preset} page="project" bare={bare !== undefined} />;
}
