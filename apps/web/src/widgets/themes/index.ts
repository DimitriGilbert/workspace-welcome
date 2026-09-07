/**
 * Theme preset registry (master plan §3.6).
 *
 * Every theme ships `widgets/themes/<slug>/preset.ts` default-exporting one
 * `ThemePreset`. Presets are plain data, globbed eagerly so they are available
 * during SSR with no async boundary — the resolved page stays pure data end
 * to end. Duplicate preset ids throw at module evaluation: two presets with
 * one slug would silently shadow each other in the URL space.
 *
 * An empty (or not-yet-populated) themes directory is a valid state — the
 * glob matches nothing and every `/app/$theme` slug renders the honest
 * "theme not found" state. Real presets land with the T1 theme wave; the
 * routes already handle both worlds.
 */
import type { ComponentType } from "react";

import type { PageLayout } from "../runtime/layout-types";
import type { ConsoleView } from "../runtime/render-layout";

/**
 * One color scheme a preset ships (owner order: a preset may carry more than
 * one color scheme, light AND dark). The scheme's CSS file re-declares the
 * theme's full token manifest under
 * `[data-ww-theme="<slug>"][data-ww-scheme="<id>"]`, so activating a scheme
 * is one attribute flip on the theme scope — instant, no reload.
 */
export interface ThemeScheme {
  /** Stable persistence key (`ww.prefs.v1` schemes map + `?scheme=` param). */
  id: string;
  /** Picker label. */
  label: string;
  /** Which app-level color scheme the scheme renders in (next-themes sync). */
  appearance: "light" | "dark";
  /**
   * CSS file stem inside the theme directory, without `.css` — e.g. `"nightfall"`
   * for `scheme-nightfall.css`. Omitted = the theme's `tokens.css` (the
   * bundled default every preset already ships).
   */
  css?: string;
}

/**
 * The contract every `<slug>/preset.ts` must default-export. A theme authors
 * exactly two pages: `dashboard` for `/app/<slug>` and `project` for
 * `/app/<slug>/project/<path>`.
 */
export interface ThemePreset {
  id: string;
  label: string;
  dashboard: PageLayout;
  project: PageLayout;
  /**
   * The color schemes the preset ships, in picker order; the FIRST entry is
   * the default (what the scope renders when nothing is saved). Every entry
   * must have its CSS file present — a declaration without the file fails at
   * module evaluation, like a duplicate preset id.
   */
  schemes: readonly ThemeScheme[];
  /**
   * The dashboard's digit-switchable console views (keys 1..N, `Escape`
   * restores the first). `ConsoleView.regions` names `dashboard` regions the
   * view shows — a view without `regions` shows the whole board. Omit when
   * the theme declares no views; the routes pass this straight to
   * `RenderLayout`.
   */
  consoleViews?: readonly ConsoleView[];
  /**
   * The theme's page-level command register, rendered at the right edge of
   * the COMMON page header (owner mod 1: the workspace verbs — sync clock,
   * Actions, Rescan, Settings — are header chrome, not canvas content).
   * Omit when a theme replaces the whole header with its own chrome (bento).
   * Runs inside the page's provider stack, so workspace hooks resolve; the
   * component owns its layout (the header gives it the right-aligned slot).
   */
  headerCommand?: ComponentType;
}

const presetModules = import.meta.glob<{ default: ThemePreset }>(
  "./*/preset.ts",
  { eager: true },
);

/**
 * Optional per-theme chrome skin (`<slug>/custom.css`), resolved to its Vite
 * URL. Additive skin only — never layout or visibility — and omitted from the
 * page head by `?bare=1`.
 */
const customCssModules = import.meta.glob<string>("./**/custom.css", {
  eager: true,
  query: "?url",
  import: "default",
});

/**
 * Scheme stylesheets (`<slug>/scheme-<id>.css`), resolved to Vite URLs.
 * Unlike `tokens.css` (side-effect-imported by each preset, always bundled),
 * scheme files are linked per page so every shipped scheme is present in the
 * CSSOM at once — switching flips `data-ww-scheme` on the scope, no fetch.
 */
const schemeCssModules = import.meta.glob<string>("./**/scheme-*.css", {
  eager: true,
  query: "?url",
  import: "default",
});

/**
 * Validate each preset's scheme declarations against the globbed stylesheet
 * URLs (and the tokens.css default) so a preset referencing a missing file
 * fails loudly at module evaluation instead of silently losing a scheme.
 */
function buildPresetRegistry(): ReadonlyMap<string, ThemePreset> {
  const presets = new Map<string, ThemePreset>();
  for (const [file, mod] of Object.entries(presetModules)) {
    const preset = mod.default;
    if (presets.has(preset.id)) {
      throw new Error(
        `Duplicate theme preset id "${preset.id}" — ${file} conflicts with an already-registered preset`,
      );
    }
    if (preset.schemes.length === 0) {
      throw new Error(
        `Theme preset "${preset.id}" (${file}) declares no color schemes — at least the tokens.css default is required`,
      );
    }
    const seen = new Set<string>();
    for (const scheme of preset.schemes) {
      if (seen.has(scheme.id)) {
        throw new Error(
          `Duplicate scheme id "${scheme.id}" in theme preset "${preset.id}" (${file})`,
        );
      }
      seen.add(scheme.id);
      if (scheme.css !== undefined) {
        if (schemeCssModules[`./${preset.id}/scheme-${scheme.css}.css`] === undefined) {
          throw new Error(
            `Theme preset "${preset.id}" (${file}) declares scheme "${scheme.id}" but ./themes/${preset.id}/scheme-${scheme.css}.css does not exist`,
          );
        }
      }
    }
    presets.set(preset.id, preset);
  }
  return presets;
}

/** All registered theme presets, keyed by slug (= `ThemePreset.id`). */
export const themePresets: ReadonlyMap<string, ThemePreset> =
  buildPresetRegistry();

/** Look up a preset by URL slug; `null` = unregistered (route renders not-found). */
export function getThemePreset(id: string): ThemePreset | null {
  return themePresets.get(id) ?? null;
}

/**
 * Vite URL of the theme's `custom.css`, or `null` when the theme ships none.
 * Route shells include it in the page head unless `?bare=1` strips it.
 */
export function themeCustomCssHref(id: string): string | null {
  return customCssModules[`./${id}/custom.css`] ?? null;
}

/** The preset's default scheme — the first declared. */
export function defaultThemeScheme(preset: ThemePreset): ThemeScheme {
  return preset.schemes[0];
}

/**
 * Resolve a scheme id (saved preference or `?scheme=` param) against a
 * preset's declared schemes; anything unknown falls back to the default.
 */
export function resolveThemeScheme(
  preset: ThemePreset,
  schemeId: string | null | undefined,
): ThemeScheme {
  return preset.schemes.find((scheme) => scheme.id === schemeId) ?? preset.schemes[0];
}

/**
 * Vite URL of a scheme's stylesheet — non-null only for dedicated
 * `scheme-*.css` files. The tokens.css default needs no link: the preset's
 * `import "./tokens.css"` keeps it permanently in the bundle.
 */
export function themeSchemeCssHref(
  presetId: string,
  scheme: ThemeScheme,
): string | null {
  if (scheme.css === undefined) return null;
  return schemeCssModules[`./${presetId}/scheme-${scheme.css}.css`] ?? null;
}

/** Every scheme stylesheet URL a preset can activate (linked per page). */
export function themeSchemeHrefs(preset: ThemePreset): string[] {
  const hrefs: string[] = [];
  for (const scheme of preset.schemes) {
    const href = themeSchemeCssHref(preset.id, scheme);
    if (href !== null) hrefs.push(href);
  }
  return hrefs;
}

/**
 * The entrypoint's fallback preset (`/` with nothing saved, `/app` without a
 * slug) — one source of truth for the owner-flippable default.
 */
export const DEFAULT_THEME_ID = "mission-control";

/** The first registered preset — the honest fallback when the default id is
 * ever unregistered (the registry is never empty while themes ship). */
export function firstThemePreset(): ThemePreset | null {
  for (const preset of themePresets.values()) return preset;
  return null;
}
