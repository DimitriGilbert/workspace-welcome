/**
 * Mission Control's widget kinds (master plan §3.3, §5 M3).
 *
 * The eager glob in `widgets/registry.ts` picks this module up and merges
 * its `widgetDefs` into the validated registry — theme waves never edit the
 * shared registry file, and duplicate ids throw at module evaluation.
 */
import type { WidgetDef } from "@/widgets/registry";

import { VitalsSkeleton } from "./vitals-skeleton";

export const widgetDefs: readonly WidgetDef[] = [
  {
    id: "vitals-skeleton",
    title: "Fleet vitals",
    component: VitalsSkeleton,
    requires: ["workspace"],
    defaultSize: "3x3",
    // min stays at the 1x1 default: the kind authors real content at every
    // ladder rung (single Stat at 1x1), and the lab's ladder catalog places
    // every registered widget at every rung — any higher floor would fail
    // validate-layout there.
    hosts: ["stat", "vitals-band"],
  },
];
