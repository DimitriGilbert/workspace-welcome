/**
 * use-console-keys — the keyboard console (master plan §5 W4).
 *
 * One window-level keydown listener implementing the console contract:
 *
 * - `/` focuses the page's filter input (`data-console-filter`) — unless the
 *   keystroke originates inside an editable element, so typing a slash in a
 *   field never yanks focus.
 * - `1`–`9` switches to the Nth view of {@link ConsoleKeysOptions.views}
 *   (no-op beyond the registered views). Views are a page concern — the hook
 *   only routes the keystrokes to `onViewChange`.
 * - `Escape` restores: while the filter input has focus it clears the one
 *   WorkspaceContext filter (`setFilter("")` — every widget narrows together)
 *   and blurs; otherwise, when a non-default view is active it restores the
 *   default (first) view.
 *
 * Consumes `WorkspaceContext.filter` directly (the hook must run inside the
 * page provider stack — render-layout mounts it there). Modifier chords and
 * repeated keys are ignored so browser shortcuts stay intact.
 */
import { useEffect } from "react";

import { useWorkspace } from "../contexts/workspace-context";

export interface ConsoleKeysOptions {
  /** View ids in 1..N order. Omit when the page has no views. */
  views?: readonly string[];
  /** Currently active view id (controlled by the caller). */
  activeView?: string | null;
  /** The view `Escape` restores. Defaults to the first registered view. */
  defaultView?: string | null;
  /** View switch callback (digit keys). */
  onViewChange?: (id: string) => void;
  /** Selector for the filter input. Default `[data-console-filter]`. */
  filterSelector?: string;
}

const DEFAULT_FILTER_SELECTOR = "[data-console-filter]";

function isEditable(element: Element | null): boolean {
  if (element === null) return false;
  const tag = element.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    (element instanceof HTMLElement && element.isContentEditable)
  );
}

export function useConsoleKeys(options: ConsoleKeysOptions = {}): void {
  const { views, activeView, defaultView, onViewChange, filterSelector = DEFAULT_FILTER_SELECTOR } = options;
  const { setFilter } = useWorkspace();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target instanceof Element ? event.target : null;
      const filterInput = document.querySelector<HTMLInputElement>(filterSelector);

      if (event.key === "Escape") {
        const filterFocused = document.activeElement !== null && document.activeElement === filterInput;
        if (filterFocused) {
          event.preventDefault();
          setFilter("");
          filterInput?.blur();
          return;
        }
        const fallback = defaultView ?? views?.[0] ?? null;
        if (fallback !== null && fallback !== undefined && activeView !== fallback) {
          event.preventDefault();
          onViewChange?.(fallback);
        }
        return;
      }

      // Every other console key is ignored while typing in a field.
      if (isEditable(target)) return;

      if (event.key === "/") {
        if (filterInput !== null) {
          event.preventDefault();
          filterInput.focus();
          filterInput.select();
        }
        return;
      }

      if (views === undefined || onViewChange === undefined) return;
      const index = Number.parseInt(event.key, 10);
      if (!Number.isInteger(index) || index < 1 || index > views.length) return;
      const id = views[index - 1];
      if (id === undefined || id === activeView) return;
      event.preventDefault();
      onViewChange(id);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [activeView, defaultView, filterSelector, onViewChange, setFilter, views]);
}
