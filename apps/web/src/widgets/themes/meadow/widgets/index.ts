/**
 * Meadow's widget kinds (master plan §3.3, §5 T2-meadow).
 *
 * The eager glob in `widgets/registry.ts` picks this module up and merges
 * its `widgetDefs` into the validated registry — theme waves never edit
 * the shared registry file, and duplicate ids throw at module evaluation.
 *
 * Dashboard kinds (the project-page kinds land at T3): the masthead row
 * (greeting + counts + search + commands), the attention band (strip
 * density over the AttentionList part), and the context panel (report +
 * workspace digests in the design's resizable two-panel composition).
 */
import type { WidgetDef } from "@/widgets/registry";

import { MeadowAttention } from "./meadow-attention";
import { MeadowContext } from "./meadow-context";
import { MeadowHeader } from "./meadow-header";

export const widgetDefs: readonly WidgetDef[] = [
  {
    id: "meadow-header",
    title: "Meadow masthead",
    component: MeadowHeader,
    requires: ["workspace"],
    defaultSize: "12x1",
    // No min floor: the kind authors honest content at every ladder rung
    // (the lab's ladder catalog places every kind at every rung).
    hosts: ["form-add-root", "form-clone-script", "form-create-project"],
  },
  {
    id: "meadow-attention",
    title: "Needs care",
    component: MeadowAttention,
    requires: ["workspace"],
    defaultSize: "12x1",
    hosts: ["attention-list"],
  },
  {
    id: "meadow-context",
    title: "Workspace context",
    component: MeadowContext,
    requires: ["workspace", "report"],
    defaultSize: "12x6",
    hosts: ["chart", "h-bars", "report-gate", "seg-bar"],
  },
];
