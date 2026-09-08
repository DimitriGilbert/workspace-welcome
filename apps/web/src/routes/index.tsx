import { useEffect, useRef } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";

import { themeSearchSchema } from "./-theme-shell";
import { RenderLayout } from "@/components/widgets/render-layout";
import { SchemeStylesheets, useWidgetPrefs } from "@/lib/contexts/theme-prefs";
import { themeCustomCssHref } from "@/components/themes";
import {
  DEFAULT_THEME_ID,
  firstThemePreset,
  getThemePreset,
  resolveThemeScheme,
} from "@/components/themes";

/**
 * `/` IS the widget system (owner order: single entrypoint over the preset
 * registry — the killed `/app` namespace 404s, nothing redirects here). The
 * registry is an
 * eager glob over the themes' `preset.ts` modules, so a new preset appears
 * in the picker and on this page with no edit here.
 *
 * The page renders the SAVED preset (`ww.prefs.v1`, read after mount by
 * `WidgetPrefsProvider`); with nothing saved — and on the server, which
 * cannot read the storage — it renders `DEFAULT_THEME_ID`, so a saved
 * selection swaps in one paint after hydration. `?preset=<slug>` (the dead
 * `/app/<slug>` redirect's cargo) persists the slug on mount and is honored
 * directly for the SSR paint; the header's theme picker keeps the saved
 * selection in sync from there.
 *
 * The active color scheme resolves `?scheme=` (forced, deep-link/harness
 * contract inherited from the dead `/app` routes) > saved > the preset's
 * default. Scheme stylesheets ride the head via `SchemeStylesheets`;
 * `RenderLayout` stamps the scope and hosts the picker.
 */
export const Route = createFileRoute("/")({
  validateSearch: themeSearchSchema,
  component: EntrypointPage,
});

function EntrypointPage() {
  const { bare, scheme: schemeParam, preset: presetParam } = Route.useSearch();
  const prefs = useWidgetPrefs();

  // The `/app/<slug>` redirect hop's cargo: persist the requested preset
  // (registry-validated inside the store) ONCE per distinct slug — the
  // store's setter always produces a fresh state object, so an unguarded
  // dependency would loop (React #185).
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
    return <NoThemesRegistered />;
  }
  const scheme = resolveThemeScheme(
    preset,
    schemeParam ?? (prefs.hydrated ? prefs.prefs.schemes?.[preset.id] : undefined),
  );
  const customCssHref = bare !== undefined ? null : themeCustomCssHref(preset.id);
  return (
    <>
      {customCssHref !== null && (
        // React 19 hoists precedence stylesheets into the head; the preset's
        // optional chrome skin must ride along on `/` exactly like every
        // page kind.
        <link
          rel="stylesheet"
          href={customCssHref}
          precedence="ww-theme-custom-css"
        />
      )}
      <SchemeStylesheets preset={preset} />
      <RenderLayout
        theme={preset.id}
        preset={preset.dashboard}
        page="dashboard"
        headerLabel={preset.label}
        consoleViews={preset.consoleViews}
        scheme={scheme}
      />
    </>
  );
}

/**
 * The registry resolved empty — a build whose themes directory ships no
 * preset modules. Honest
 * state, never a blank board.
 */
function NoThemesRegistered() {
  return (
    <div className="mx-auto flex min-h-svh w-full max-w-2xl flex-col justify-center gap-3 px-5 py-6 sm:px-8">
      <h1 className="text-sm font-semibold tracking-tight">
        No themes registered
      </h1>
      <p className="text-xs leading-relaxed text-muted-foreground">
        The preset registry is empty — no{" "}
        <span className="font-mono">components/themes/*/preset.ts</span> module
        matched. Add a theme preset to render the board.
      </p>
      <Link
        to="/settings"
        className="font-mono text-xs underline underline-offset-2 hover:text-foreground"
      >
        Open settings
      </Link>
    </div>
  );
}
