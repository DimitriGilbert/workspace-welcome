import { createFileRoute } from "@tanstack/react-router";

import { ThemeNotFound, themeSearchSchema } from "../-theme-shell";
import { RenderLayout } from "@/widgets/runtime/render-layout";
import { themeCustomCssHref, getThemePreset } from "@/widgets/themes";

/**
 * A theme's project page: `/app/<slug>/project/<path…>`. The slug must
 * resolve to a registered theme preset whose `project` layout defines the
 * page; an unknown slug renders the explicit not-found state.
 *
 * D8 wiring (master plan §5): the renderer-pending slot is gone — the page
 * mounts the REAL provider stack and board via `RenderLayout`, whose
 * `PageProviders` builder composes Settings > Project{nests Workspace} >
 * Report{repo, path} from the preset's `context` (§3.4). The splat is the
 * project path without its leading "/" (URL-safely encoded); it is rejoined
 * here, exactly as the legacy design routes do. `?bare=1` still drops
 * `custom.css` from the head.
 */
export const Route = createFileRoute("/app/$theme/project/$")({
  validateSearch: themeSearchSchema,
  component: ThemeProjectPage,
});

function ThemeProjectPage() {
  const { theme, _splat } = Route.useParams();
  const { bare } = Route.useSearch();
  const preset = getThemePreset(theme);
  if (preset === null) {
    return <ThemeNotFound slug={theme} />;
  }
  const projectPath = `/${_splat ?? ""}`;
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
        preset={preset.project}
        page="project"
        projectPath={projectPath}
        headerLabel={preset.label}
      />
    </>
  );
}
