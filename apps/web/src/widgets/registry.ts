/**
 * Widget registry — the layered composition of ruling 2 (master plan §3.3).
 *
 * Two layers merge into one validated map:
 *
 * 1. **Static core** — theme-independent common kinds, imported eagerly from
 *    `widgets/core/` (their home; the map here stays the single static
 *    registry site).
 * 2. **Theme kinds** — every `components/themes/<slug>/widgets/index.ts` is
 *    picked up by an eager `import.meta.glob`, so parallel theme waves never
 *    edit this shared file. A theme module exports its kinds as
 *    `widgetDefs: readonly WidgetDef[]` (see {@link ThemeWidgetModule}).
 *
 * `mergeValidated` throws on duplicate ids — a theme re-registering a core
 * id (or two themes colliding) must fail loudly at module evaluation, not
 * silently shadow an already-authored preset reference.
 *
 * `requires` is the context metadata validate-layout and the renderer's
 * dev-mode assertion check against the page's provider stack (`ContextKey`).
 * `min` is the runtime cell floor the drag controller clamps to; `defaultSize`
 * is what a catalog/inspector places when no explicit size is authored;
 * `hosts` documents the part ids a kind composes (docs + compliance input).
 */
import type { ComponentType } from "react";

import { ProjectTile } from "./core/project-tile";
import type { WidgetNode } from "./runtime/layout-types";
import type { SizeClass } from "./runtime/size-class";

/** A context provider key a widget can require (§3.3 `WidgetDef.requires`). */
export type ContextKey = "workspace" | "project" | "report" | "settings";

/** Props the renderer passes to every registered widget component. */
export interface RegisteredWidgetProps {
  /** The preset node instance (id, authored props, slots). */
  node: WidgetNode;
  /** The current placement footprint, resolved against the size ladder. */
  size: { cols: number; rows: number; sizeClass: SizeClass };
}

/** One registered widget kind. */
export interface WidgetDef {
  /** Registry key — what presets reference in `WidgetNode.widget`. */
  id: string;
  /** Human title; the renderer's shell header + drag announcements. */
  title: string;
  component: ComponentType<RegisteredWidgetProps>;
  /** Provider keys the kind needs mounted above it (§3.4 enforcement (b)). */
  requires: readonly ContextKey[];
  /** Footprint used when placement is not authored. */
  defaultSize: SizeClass;
  /** Authored cell floor — resize never shrinks below it. Default 1x1. */
  min?: SizeClass;
  /** Part ids this kind composes (docs + compliance input). */
  hosts?: readonly string[];
}

/**
 * The contract every `components/themes/<slug>/widgets/index.ts` module must
 * satisfy — eager-globbed by this registry.
 */
export interface ThemeWidgetModule {
  widgetDefs: readonly WidgetDef[];
}

const core: Record<string, WidgetDef> = {
  "project-tile": {
    id: "project-tile",
    title: "Project tile",
    component: ProjectTile,
    requires: ["workspace"],
    defaultSize: "2x2",
    min: "1x1",
    hosts: ["led", "score-chip", "pulse-strip", "git-glyphs", "chip"],
  },
};

/**
 * Merge the core map with the globbed theme modules, rejecting duplicate
 * ids. The file path rides the error so the offending wave is identifiable
 * from the stack trace alone.
 */
export function mergeValidated(
  coreMap: Record<string, WidgetDef>,
  themeModules: Record<string, ThemeWidgetModule>,
): ReadonlyMap<string, WidgetDef> {
  const merged = new Map<string, WidgetDef>(Object.entries(coreMap));
  for (const [file, mod] of Object.entries(themeModules)) {
    for (const def of mod.widgetDefs ?? []) {
      if (merged.has(def.id)) {
        throw new Error(
          `Duplicate widget id "${def.id}" — ${file} conflicts with an already-registered widget`,
        );
      }
      merged.set(def.id, def);
    }
  }
  return merged;
}

const themeWidgetModules = import.meta.glob<ThemeWidgetModule>(
  "../components/themes/*/widgets/index.ts",
  { eager: true },
);

/** Every registered widget kind, keyed by `WidgetDef.id`. */
export const widgetRegistry: ReadonlyMap<string, WidgetDef> = mergeValidated(
  core,
  themeWidgetModules,
);

/** Look up one kind by registry key; `null` = unregistered. */
export function getWidgetDef(id: string): WidgetDef | null {
  return widgetRegistry.get(id) ?? null;
}

/** All registered keys (stable registry order: core first, then themes). */
export function widgetIds(): string[] {
  return [...widgetRegistry.keys()];
}
