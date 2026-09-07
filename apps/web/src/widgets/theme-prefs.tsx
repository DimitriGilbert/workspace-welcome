/**
 * Theme prefs — the widget system's saved selection (owner order: the saved
 * preset slug AND the per-preset color scheme survive reloads; next-themes
 * owns the light/dark color scheme itself, this store owns which preset is
 * "mine" and which of a preset's schemes is active).
 *
 * Persistence is localStorage (`ww.prefs.v1`) — the owner-accepted tradeoff
 * is the SSR first paint: the server cannot read the storage, so a hard
 * reload renders the DEFAULT preset/scheme for one paint before the saved
 * selection swaps in on mount (`hydrated`). Nothing is written during SSR,
 * every read is defensive (foreign or corrupted values fall back to the
 * defaults), and writes are atomic best-effort — private-mode quota errors
 * leave the in-memory selection live for the session instead of crashing
 * the board.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { getThemePreset, themeSchemeCssHref } from "./themes";
import type { ThemePreset, ThemeScheme } from "./themes";

/** localStorage key — namespaced, versioned. */
const WIDGET_PREFS_KEY = "ww.prefs.v1";

/** The persisted shape. Unknown keys are preserved; unknown VALUES are not. */
interface WidgetPrefs {
  /** The saved preset slug (`/` renders it; `/app/$theme` ignores it). */
  preset?: string;
  /** Active scheme id per preset slug. */
  schemes?: Record<string, string>;
}

const EMPTY_PREFS: WidgetPrefs = {};

/** Defensive parse: anything that isn't the expected shape reads as empty. */
function parsePrefs(raw: string | null): WidgetPrefs {
  if (raw === null || raw.length === 0) return EMPTY_PREFS;
  try {
    const data: unknown = JSON.parse(raw);
    if (typeof data !== "object" || data === null) return EMPTY_PREFS;
    const prefs: WidgetPrefs = {};
    const record = data as Record<string, unknown>;
    if (typeof record.preset === "string" && record.preset.length > 0) {
      prefs.preset = record.preset;
    }
    if (typeof record.schemes === "object" && record.schemes !== null) {
      const schemes: Record<string, string> = {};
      for (const [slug, id] of Object.entries(record.schemes)) {
        if (typeof id === "string" && id.length > 0) schemes[slug] = id;
      }
      prefs.schemes = schemes;
    }
    return prefs;
  } catch {
    return EMPTY_PREFS;
  }
}

function readStoredPrefs(): WidgetPrefs {
  try {
    return parsePrefs(window.localStorage.getItem(WIDGET_PREFS_KEY));
  } catch {
    return EMPTY_PREFS;
  }
}

function writeStoredPrefs(prefs: WidgetPrefs): void {
  try {
    window.localStorage.setItem(WIDGET_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Private mode / quota — the session selection stays live; nothing to do.
  }
}

export interface WidgetPrefsValue {
  /** The persisted prefs; empty until `hydrated`. */
  prefs: WidgetPrefs;
  /** True once the stored prefs have been read on the client. */
  hydrated: boolean;
  /** The saved preset as a registered ThemePreset, or null (nothing saved /
   * saved slug no longer registered — callers fall back to their default). */
  savedPreset(): ThemePreset | null;
  /** Persist the saved preset slug (registry-validated; unknown ids dropped). */
  setSavedPreset(id: string): void;
  /** The saved (or default) scheme for a preset. */
  savedScheme(preset: ThemePreset): ThemeScheme;
  /** Persist a preset's active scheme id. Resolution falls back to the
   * default for unknown ids, so a stale stored id degrades honestly. */
  setSavedScheme(presetId: string, schemeId: string): void;
}

const WidgetPrefsContext = createContext<WidgetPrefsValue | null>(null);

export function WidgetPrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<WidgetPrefs>(EMPTY_PREFS);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setPrefs(readStoredPrefs());
    setHydrated(true);
  }, []);

  const setSavedPreset = useCallback((id: string) => {
    setPrefs((current) => {
      if (getThemePreset(id) === null) return current;
      const next: WidgetPrefs = { ...current, preset: id };
      writeStoredPrefs(next);
      return next;
    });
  }, []);

  const setSavedScheme = useCallback((presetId: string, schemeId: string) => {
    setPrefs((current) => {
      const next: WidgetPrefs = {
        ...current,
        schemes: { ...current.schemes, [presetId]: schemeId },
      };
      writeStoredPrefs(next);
      return next;
    });
  }, []);

  const value = useMemo<WidgetPrefsValue>(
    () => ({
      prefs,
      hydrated,
      savedPreset: () =>
        hydrated && prefs.preset !== undefined
          ? getThemePreset(prefs.preset)
          : null,
      setSavedPreset,
      savedScheme: (preset: ThemePreset) =>
        resolveSavedScheme(preset, hydrated ? prefs.schemes?.[preset.id] : undefined),
      setSavedScheme,
    }),
    [prefs, hydrated, setSavedPreset, setSavedScheme],
  );

  return (
    <WidgetPrefsContext.Provider value={value}>
      {children}
    </WidgetPrefsContext.Provider>
  );
}

/** Read/write the saved preset + scheme selection. Throws outside the provider. */
export function useWidgetPrefs(): WidgetPrefsValue {
  const ctx = useContext(WidgetPrefsContext);
  if (ctx === null) {
    throw new Error(
      "WidgetPrefsProvider missing — mount it (root document) above the page.",
    );
  }
  return ctx;
}

/**
 * Resolve a saved scheme id against a preset's declared schemes; anything
 * unknown (nothing saved, stale id) falls back to the preset's default.
 */
function resolveSavedScheme(
  preset: ThemePreset,
  schemeId: string | undefined,
): ThemeScheme {
  return preset.schemes.find((scheme) => scheme.id === schemeId) ?? preset.schemes[0];
}

/**
 * Every scheme stylesheet a preset can activate, as React 19 head links.
 * All files stay mounted so switching is one `data-ww-scheme` attribute flip
 * on the theme scope — the stylesheets are already in the CSSOM, no fetch,
 * no reload. `tokens.css` (the default scheme) is deliberately absent: the
 * preset's own `import "./tokens.css"` keeps it permanently bundled.
 */
export function SchemeStylesheets({ preset }: { preset: ThemePreset }) {
  return (
    <>
      {preset.schemes.map((scheme) => {
        const href = themeSchemeCssHref(preset.id, scheme);
        if (href === null) return null;
        return (
          <link
            key={scheme.id}
            rel="stylesheet"
            data-ww-scheme-css={scheme.id}
            precedence="ww-theme-scheme-css"
            href={href}
          />
        );
      })}
    </>
  );
}
