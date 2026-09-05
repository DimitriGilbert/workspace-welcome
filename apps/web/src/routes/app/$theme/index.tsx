import { createFileRoute } from "@tanstack/react-router";

import { ThemeNotFound, themeSearchSchema } from "../-theme-shell";
import { RenderLayout } from "@/widgets/runtime/render-layout";
import { themeCustomCssHref, getThemePreset } from "@/widgets/themes";

/**
 * A theme's dashboard page: `/app/<slug>`. The slug must resolve to a
 * registered theme preset whose `dashboard` layout defines the page; an
 * unknown slug renders the explicit not-found state.
 *
 * M3 wiring (master plan §5): the renderer-pending slot is gone — the page
 * mounts the REAL provider stack and board via `RenderLayout`, whose
 * `PageProviders` builder composes Settings > Workspace > Report{scan,
 * roots[0]} from the preset's `context` (§3.4), then turns the layout into
 * a live, draggable board. The preset's `consoleViews` (M3/D8 exception)
 * feed `RenderLayout` so `use-console-keys` can switch them with digit keys
 * and restore the first with `Escape`. `?bare=1` still drops `custom.css`
 * from the head.
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
  const customCssHref = bare !== undefined ? null : themeCustomCssHref(preset.id);
  return (
    <>
      {customCssHref !== null && (
        // React 19 hoists `precedence` stylesheets into the document head on
        // the server and the client; unmounting it (a bare toggle) removes it.
        <link
          rel="stylesheet"
          href={customCssHref}
          precedence="ww-theme-custom-css"
        />
      )}
      <RenderLayout
        theme={preset.id}
        preset={preset.dashboard}
        page="dashboard"
        headerLabel={preset.label}
        consoleViews={preset.consoleViews}
      />
    </>
  );
}
