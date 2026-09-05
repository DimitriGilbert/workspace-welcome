/**
 * PageLayout v1 — the preset format (master plan §3.3).
 *
 * Pure data, JSON-shape by construction: presets reference widgets by registry id and
 * carry only serializable values. `props` is `Record<string, JsonValue>` — never JSX;
 * content variants belong to the widget component, not the layout. Flow regions are
 * code seams registered by `from` key (W2's `widgets/runtime/flows.ts`); generators
 * run INSIDE the provider stack at render time and never call tRPC. The resolved page
 * (flat `WidgetNode[]` with concrete placements) is the exact artifact a future
 * persistence layer would save.
 */
import type { SizeClass } from "./size-class";

/** Any value expressible in JSON — keeps `WidgetNode.props` serializable (never JSX). */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/**
 * One placed widget instance.
 *
 * - `id` — stable instance id, kebab-case (probe + persistence identity).
 * - `widget` — registry key (must resolve in `widgetRegistry` at W4).
 * - `size` — authored footprint as a `SizeClass`; validate-layout asserts it exists
 *   on the ladder or resolves down it.
 * - `at` — optional anchor `{ x, y }` in cells; when omitted the packer places the
 *   node in reading order. Manual drags shadow `at` for the session.
 * - `slots` — authored composite children (settled #3): named groups of child
 *   `WidgetNode`s the composite widget renders in its own fixed internal layout.
 *   Nested shells render with `interactive={false}` — no runtime grid recursion.
 */
export interface WidgetNode {
  id: string;
  widget: string;
  size: SizeClass;
  at?: { x: number; y: number };
  props?: Record<string, JsonValue>;
  slots?: Record<string, WidgetNode[]>;
}

/**
 * A page region: either a static stack of placed widgets or a flow — a generator
 * keyed by `from` (e.g. `"projects"`) that stamps a `template` node per input item.
 * `template.ladders` maps a flow input tier/score band to candidate size classes so
 * themes remap generated footprints without editing the generator.
 */
export type RegionNode =
  | { kind: "stack"; id: string; widgets: WidgetNode[] }
  | {
      kind: "flow";
      id: string;
      from: string;
      template: { widget: string; ladders?: Record<string, SizeClass[]> };
    };

/**
 * A page preset (v1).
 *
 * - `context` — drives the provider stack (§3.4): `"workspace"` mounts
 *   Settings > Workspace > Report(scan); `"project"` mounts
 *   Settings > Project (nests Workspace) > Report(repo).
 * - `report` — `false` omits the ReportProvider entirely (default: on).
 * - `columns` — grid column count per breakpoint (SSR renders desktop first paint).
 * - `cell.h` — theme row-unit density in px (92–104 px observed); definite px row
 *   heights are what keep chart placeholder boxes definite.
 * - `regions` — ordered page regions (stack | flow).
 */
export interface PageLayout {
  version: 1;
  context: "workspace" | "project";
  report?: false;
  columns: { desktop: number; tablet: number; phone: number };
  cell: { h: number };
  regions: RegionNode[];
}
