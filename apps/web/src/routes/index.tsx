import { Link, createFileRoute } from "@tanstack/react-router";

import { RenderLayout } from "@/widgets/runtime/render-layout";
import { SchemeStylesheets, useWidgetPrefs } from "@/widgets/theme-prefs";
import { themeCustomCssHref } from "@/widgets/themes";
import {
  DEFAULT_THEME_ID,
  firstThemePreset,
  getThemePreset,
} from "@/widgets/themes";

/**
 * `/` IS the widget system (owner order: single entrypoint over the preset
 * registry — the old projects dashboard is gone; every project surface lives
 * on the boards). The registry is an eager glob over the themes'
 * `preset.ts` modules, so a new preset appears in the picker and on this
 * page with no edit here.
 *
 * The page renders the SAVED preset (`ww.prefs.v1`, read after mount by
 * `WidgetPrefsProvider`); with nothing saved — and on the server, which
 * cannot read the storage — it renders `DEFAULT_THEME_ID`, so a saved
 * selection swaps in one paint after hydration. `/app/<slug>` stays the
 * explicit-URL form; the header's theme picker keeps both in sync.
 *
 * The active color scheme is the saved preset's scheme (`?scheme=` forcing
 * is an `/app` deep-link/harness concern; the saved selection is the
 * entrypoint's contract). Scheme stylesheets ride the head via
 * `SchemeStylesheets`; `RenderLayout` stamps the scope and hosts the picker.
 */
export const Route = createFileRoute("/")({
  component: EntrypointPage,
});

function EntrypointPage() {
  const prefs = useWidgetPrefs();
  const preset =
    prefs.savedPreset() ??
    getThemePreset(DEFAULT_THEME_ID) ??
    firstThemePreset();
  if (preset === null) {
    return <NoThemesRegistered />;
  }
  const scheme = prefs.savedScheme(preset);
  const customCssHref = themeCustomCssHref(preset.id);
  return (
    <>
      {customCssHref !== null && (
        // React 19 hoists precedence stylesheets into the head; the preset's
        // optional chrome skin must ride along on `/` exactly like /app/*.
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
        <span className="font-mono">widgets/themes/*/preset.ts</span> module
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
