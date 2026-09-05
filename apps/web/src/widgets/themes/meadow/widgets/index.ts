/**
 * Meadow's widget kinds (master plan §3.3, §5 T1-meadow).
 *
 * The eager glob in `widgets/registry.ts` picks this module up and merges
 * its `widgetDefs` into the validated registry — theme waves never edit
 * the shared registry file, and duplicate ids throw at module evaluation.
 *
 * T1 ships no kinds yet: meadow's dashboard compositions land at T2 and
 * the project-page kinds at T3. An empty export keeps the module a valid
 * `ThemeWidgetModule` so the glob merge stays total.
 */
import type { WidgetDef } from "@/widgets/registry";

export const widgetDefs: readonly WidgetDef[] = [];
