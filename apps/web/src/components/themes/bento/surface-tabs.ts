/**
 * The project page's shared tab state — the seam that lets the nav bar's
 * Files / Artifacts / Ideation tabs drive the working-surface widget's pane
 * (the prototype's tab structure, one selection across two widgets). A
 * window custom event keeps the two widgets decoupled; SSR-safe (events
 * only fire from clicks).
 */

export type SurfaceTab = "files" | "artifacts" | "ideation";

const EVENT = "bento:surface-tab";

/** Select a working-surface pane (and bring it forward). */
export function setSurfaceTab(tab: SurfaceTab): void {
  window.dispatchEvent(new CustomEvent<SurfaceTab>(EVENT, { detail: tab }));
}

/** Subscribe to surface-pane selections. Returns the unsubscribe fn. */
export function onSurfaceTab(listener: (tab: SurfaceTab) => void): () => void {
  const handler = (event: Event): void => {
    const detail = (event as CustomEvent<SurfaceTab>).detail;
    listener(detail);
  };
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
