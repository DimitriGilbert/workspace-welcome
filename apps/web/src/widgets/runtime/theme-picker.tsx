/**
 * ThemePicker — the system header's preset + color-scheme controls (owner
 * order: a small theme picker — preset list + scheme toggle — living in the
 * system header, working on every theme).
 *
 * Rendered by `RenderLayout`'s page header on every preset page (the lab,
 * whose slug is not a registered preset, hides it honestly). Both picks are
 * FULLY IN-PLACE: the top-level routes (`/`, `/project/<splat>`) render the
 * SAVED selection from `ww.prefs.v1`, so a pick persists the prefs and
 * strips any `?preset=`/`?scheme=` deep-link params from the URL — the
 * dead `/app/<slug>` navigation contract they out-voted no longer exists,
 * and a leftover param would out-rank the pick on every re-render. The
 * deep links themselves keep working: they are honored for the first paint
 * and persisted on mount before the picker can fight them.
 *
 * Scheme picks persist per preset and sync next-themes' light/dark store so
 * the app chrome (html class, sonner, `dark:` variants) matches the board.
 */
import { useEffect, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { useTheme } from "next-themes";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace-welcome/ui/components/select";

import { getThemePreset, themePresets } from "../../components/themes";
import type { ThemeScheme } from "../../components/themes";
import { useWidgetPrefs } from "../theme-prefs";

export function ThemePicker({
  theme,
  activeScheme,
}: {
  /** The page's theme slug; the picker renders nothing for unregistered
   * slugs (the lab). */
  theme: string;
  /**
   * The scheme the page actually applies (`?scheme=` override resolved by
   * the route). Omitted by per-theme chrome hosts — the picker then displays
   * the saved selection.
   */
  activeScheme?: ThemeScheme;
}) {
  const prefs = useWidgetPrefs();
  const preset = getThemePreset(theme);
  const { theme: colorScheme, setTheme } = useTheme();
  const router = useRouter();

  // Chrome-hosted pickers (bento, meadow) render without the route's
  // activeScheme — they read the THEME SCOPE's actual scheme instead.
  // Without this, a deep-linked scheme (?scheme=paper) fights the picker's
  // saved default (graphite/dark): two pickers pushing opposite appearances
  // into next-themes oscillate the html class tens of times a second (the
  // light-theme chrome flashing). RenderLayout stamps the scope with the
  // active scheme ALWAYS — default included — so the attribute is the
  // complete ground truth of what the board renders; the saved selection is
  // only the fallback for callers that resolve no scheme at all.
  const [scopeSchemeId, setScopeSchemeId] = useState<string | null>(null);
  useEffect(() => {
    if (activeScheme !== undefined) return;
    const el = document.querySelector('[data-ww-theme="' + theme + '"]');
    if (el === null) return;
    const sync = () => setScopeSchemeId(el.getAttribute('data-ww-scheme'));
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(el, { attributes: true, attributeFilter: ['data-ww-scheme'] });
    return () => obs.disconnect();
  }, [theme, activeScheme]);

  // Keep next-themes' color scheme (the html class + its own persistence)
  // aligned with the scheme the board actually renders. Runs only after the
  // stored prefs are read, so a reload never clobbers the saved value with
  // the pre-hydration default.
  const scopeScheme =
    scopeSchemeId === null
      ? null
      : (preset?.schemes.find((candidate) => candidate.id === scopeSchemeId) ?? null);
  const shown =
    activeScheme ?? scopeScheme ?? (preset === null ? null : prefs.savedScheme(preset));

  useEffect(() => {
    if (preset === null || shown === null || !prefs.hydrated) return;
    if (colorScheme !== shown.appearance) setTheme(shown.appearance);
  }, [preset, shown, prefs.hydrated, colorScheme, setTheme]);

  if (preset === null || shown === null) return null;

  /** Drop the deep-link params a pick must own: after a pick they would
   * out-rank the saved prefs on every re-render (the routes resolve
   * `?preset=`/`?scheme=` first). Replace, no history spam. */
  const stripPickParams = (): void => {
    // Replace to the same path minus the params. `href` keeps the typing
    // honest — the picker renders across several routes whose search schema
    // union collapses a reducer to `never`, so no typed reducer exists.
    const url = new URL(window.location.href);
    url.searchParams.delete("preset");
    url.searchParams.delete("scheme");
    void router.navigate({ href: url.pathname + url.search, replace: true });
  };

  const onPresetChange = (value: string | null) => {
    if (value === null || value === preset.id || themePresets.has(value) === false) {
      return;
    }
    // In-place switch: strip the params first, then persist — one batched
    // re-render shows the picked preset from the SAVED selection.
    stripPickParams();
    prefs.setSavedPreset(value);
  };

  const onSchemeChange = (value: string | null) => {
    if (value === null) return;
    const scheme = preset.schemes.find((candidate) => candidate.id === value);
    if (scheme === undefined) return;
    stripPickParams();
    prefs.setSavedScheme(preset.id, scheme.id);
    setTheme(scheme.appearance);
  };

  return (
    <div
      data-theme-picker=""
      className="flex items-center gap-1.5"
    >
      <Select value={preset.id} onValueChange={onPresetChange}>
        <SelectTrigger
          aria-label="Theme preset"
          className="h-7 w-36 text-xs"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {[...themePresets.values()].map((candidate) => (
            <SelectItem key={candidate.id} value={candidate.id}>
              {candidate.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={shown.id} onValueChange={onSchemeChange}>
        <SelectTrigger
          aria-label="Color scheme"
          className="h-7 w-40 text-xs"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {preset.schemes.map((scheme) => (
            <SelectItem key={scheme.id} value={scheme.id}>
              {scheme.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
