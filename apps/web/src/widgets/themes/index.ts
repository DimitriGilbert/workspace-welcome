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
import type { PageLayout } from "../runtime/layout-types";

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

function buildPresetRegistry(): ReadonlyMap<string, ThemePreset> {
  const presets = new Map<string, ThemePreset>();
  for (const [file, mod] of Object.entries(presetModules)) {
    const preset = mod.default;
    if (presets.has(preset.id)) {
      throw new Error(
        `Duplicate theme preset id "${preset.id}" — ${file} conflicts with an already-registered preset`,
      );
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
