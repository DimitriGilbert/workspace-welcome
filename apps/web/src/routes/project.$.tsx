import { useEffect, useRef } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { ProjectKnownGate, themeSearchSchema } from "./-theme-shell";
import { RenderLayout } from "@/components/widgets/render-layout";
import { SchemeStylesheets, useWidgetPrefs } from "@/lib/contexts/theme-prefs";
import {
  DEFAULT_THEME_ID,
  firstThemePreset,
  getThemePreset,
  resolveThemeScheme,
  themeCustomCssHref,
} from "@/components/themes";

/**
 * The top-level project page: `/project/<path…>` (owner order: `/app` is
 * dead — `/` is THE app, and the project readout is a first-class top-level
 * surface). The splat is the project path without its leading "/" (the same
 * URL-safe encoding the legacy routes used), rejoined here.
 *
 * The page renders the SAVED preset's project board; `?preset=<slug>` (the
 * `/app/<slug>/project/…` redirect's cargo) persists the slug on mount and
 * is honored directly for the SSR paint, so a redirected deep link lands on
 * the right board with no default-theme flash. `?scheme=<id>` forces a
 * color scheme, `?bare=1` drops `custom.css` — the same deep-link contract
 * the entrypoint carries. The known-project gate is unchanged: a path the
 * scanner doesn't know never mounts the provider stack.
 */
export const Route = createFileRoute("/project/$")({
  validateSearch: themeSearchSchema,
  component: ProjectPage,
});

function ProjectPage() {
  const { _splat } = Route.useParams();
  const { bare, scheme: schemeParam, preset: presetParam } = Route.useSearch();
  const prefs = useWidgetPrefs();

  // The redirect hop's cargo: persist the requested preset (registry-validated
  // inside the store) ONCE per distinct slug — the store's setter always
  // produces a fresh state object, so an unguarded dependency would loop
  // (React #185).
  const appliedPreset = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (presetParam === undefined || appliedPreset.current === presetParam) return;
    appliedPreset.current = presetParam;
    prefs.setSavedPreset(presetParam);
  }, [presetParam, prefs]);

  // An explicit `?preset=` wins over the saved selection — it is the dead
  // `/app/<slug>` contract (that URL always rendered ITS theme) — then the
  // saved preset, then the registry default.
  const preset =
    (presetParam !== undefined ? getThemePreset(presetParam) : null) ??
    prefs.savedPreset() ??
    getThemePreset(DEFAULT_THEME_ID) ??
    firstThemePreset();
  if (preset === null) {
    return <NoThemesForProject />;
  }
  const projectPath = `/${_splat ?? ""}`;
  const scheme = resolveThemeScheme(
    preset,
    schemeParam ?? (prefs.hydrated ? prefs.prefs.schemes?.[preset.id] : undefined),
  );
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
      <SchemeStylesheets preset={preset} />
      <ProjectKnownGate theme={preset.id} path={projectPath}>
        <RenderLayout
          theme={preset.id}
          preset={preset.project}
          page="project"
          projectPath={projectPath}
          headerLabel={preset.label}
          scheme={scheme}
        />
      </ProjectKnownGate>
    </>
  );
}

/** No preset is registered — the honest empty state, never a blank board. */
function NoThemesForProject() {
  return (
    <div className="mx-auto flex min-h-svh w-full max-w-2xl flex-col justify-center gap-3 px-5 py-6 sm:px-8">
      <h1 className="text-sm font-semibold tracking-tight">No themes registered</h1>
      <p className="text-xs leading-relaxed text-muted-foreground">
        The preset registry is empty — a project page needs a theme preset to
        render its board.
      </p>
    </div>
  );
}
