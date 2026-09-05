import { createFileRoute } from "@tanstack/react-router";

import { ThemeNotFound, ThemePageShell, themeSearchSchema } from "../-theme-shell";
import { getThemePreset } from "@/widgets/themes";

/**
 * A theme's dashboard page: `/app/<slug>`. The slug must resolve to a
 * registered theme preset whose `dashboard` layout defines the page; an
 * unknown slug renders the explicit not-found state.
 */
export const Route = createFileRoute("/app/$theme/")({
  validateSearch: themeSearchSchema,
  component: ThemeDashboardPage,
});

function ThemeDashboardPage() {
  const { theme } = Route.useParams();
  const { bare } = Route.useSearch();
  const preset = getThemePreset(theme);
  if (preset === null) {
    return <ThemeNotFound slug={theme} />;
  }
  return <ThemePageShell preset={preset} page="dashboard" bare={bare !== undefined} />;
}
