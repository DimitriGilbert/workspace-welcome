/**
 * ThemePicker — the system header's preset + color-scheme controls (owner
 * order: a small theme picker — preset list + scheme toggle — living in the
 * system header, working on every theme).
 *
 * Rendered by `RenderLayout`'s page header on presets that ride the common
 * header (`headerCommand` declared); presets that replace the header with
 * their own chrome (bento, meadow — no `headerCommand`) host the same
 * picker in that chrome — ONE picker per page, never both. The lab, whose
 * slug is not a registered preset, renders none. Both picks are
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
 *
 * A third control rides along: the "Reset layout" ghost icon button. It
 * clears THIS theme's saved board arrangements (`ww.board.v1` pages under
 * `${theme}:`) and drops the live board's session so the authored preset
 * re-packs immediately — an honest, simple Undo (restore the storage
 * snapshot + re-seed the board), last-write-wins if the board was edited
 * in between.
 */
import { useEffect, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { RotateCcw } from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";

import { Button } from "@workspace-welcome/ui/components/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace-welcome/ui/components/select";

import { getThemePreset, themePresets } from "@/components/themes";
import type { ThemeScheme } from "@/components/themes";
import { useWidgetPrefs } from "@/lib/contexts/theme-prefs";
import {
  dropPagesWithPrefix,
  readSavedBoards,
  writeSavedBoards,
} from "@/lib/widget/board-persist";
import { clearPageSession } from "@/lib/widget/grid-session";

import { reapplySavedBoard } from "./use-board-persistence";

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

  /** Clear every saved board arrangement of THIS theme and drop its live
   * sessions — the authored pack re-packs on the session emits. The mounted
   * board's page id is read from the DOM (`data-widget-board`), the one
   * ground truth for which board this picker's page actually mounts. */
  const onResetLayout = (): void => {
    const snapshot = readSavedBoards();
    const { boards, droppedPageIds } = dropPagesWithPrefix(snapshot, theme);
    if (droppedPageIds.length === 0) {
      // Nothing saved — no destructive toast for a no-op, just the fact.
      toast.info("No saved layout", {
        description: "Nothing to reset — this theme has no saved arrangement yet.",
      });
      return;
    }
    writeSavedBoards(boards);
    // Reset is theme-wide but the session store is page-scoped module
    // memory: clearing only the mounted page would leave the sibling page's
    // stale session rendering the pre-reset arrangement over SPA navigation
    // and re-saving it on its next edit ("dashboard" | "project" are the
    // only page contexts, so both are cleared; absent ones are no-ops).
    clearPageSession(`${theme}:dashboard`);
    clearPageSession(`${theme}:project`);
    const mountedPageId =
      document
        .querySelector("[data-widget-board]")
        ?.getAttribute("data-widget-board") ?? null;
    // The picker also renders on chrome hosts whose board may be another
    // theme's (or unmounted) — only the Undo re-seeds THIS theme's board.
    const pageId =
      mountedPageId !== null && mountedPageId.startsWith(`${theme}:`)
        ? mountedPageId
        : null;
    toast.success("Layout reset", {
      description: "Saved arrangements cleared — the authored board is back.",
      action: {
        label: "Undo",
        onClick: () => {
          writeSavedBoards(snapshot);
          if (pageId === null) return;
          // The page id's suffix names the preset page ("dashboard" |
          // "project") — its layout carries the format generation the re-seed
          // must reconcile against.
          const layout =
            pageId.slice(theme.length + 1) === "project"
              ? preset.project
              : preset.dashboard;
          reapplySavedBoard(pageId, layout.version);
        },
      },
    });
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
      {/* An action button, deliberately NOT a SelectItem: the selects are
          controlled value-pickers, sentinel entries would fight their value
          contract. Ghost icon size matches the h-7 triggers. */}
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Reset layout"
        title="Reset layout"
        onClick={onResetLayout}
      >
        <RotateCcw />
      </Button>
    </div>
  );
}
