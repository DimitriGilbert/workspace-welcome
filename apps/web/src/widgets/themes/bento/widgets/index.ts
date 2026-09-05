/**
 * Bento's widget kinds (master plan §3.3, §5 T2-bento).
 *
 * The eager glob in `widgets/registry.ts` picks this module up and merges
 * its `widgetDefs` into the validated registry — theme waves never edit
 * the shared registry file, and duplicate ids throw at module evaluation.
 *
 * Seven dashboard kinds port the design's surfaces widget-for-widget:
 * the vitals band (`bento-health` / `bento-activity` / `bento-stacks`),
 * the signals row (`bento-attention` / `bento-signals`), the tabbed
 * snitch-report band (`bento-pulse`), and the recency-sized mosaic tile
 * (`bento-project-tile`, stamped per project by the "projects" flow).
 */
import type { WidgetDef } from "@/widgets/registry";

import { BentoActivity, BentoHealth, BentoStacks } from "./vitals";
import { BentoAttention, BentoSignals } from "./signals";
import { BentoPulse } from "./pulse";
import { BentoProjectTile } from "./project-tile";

export const widgetDefs: readonly WidgetDef[] = [
  {
    id: "bento-health",
    title: "Workspace health",
    component: BentoHealth,
    requires: ["workspace"],
    defaultSize: "3x3",
    min: "1x1",
    hosts: ["gauge", "stat"],
  },
  {
    id: "bento-activity",
    title: "Activity",
    component: BentoActivity,
    requires: ["workspace"],
    defaultSize: "6x3",
    min: "1x1",
    hosts: ["chart", "stat", "animated-number"],
  },
  {
    id: "bento-stacks",
    title: "Stack mix",
    component: BentoStacks,
    requires: ["workspace"],
    defaultSize: "3x3",
    min: "1x1",
    hosts: ["donut", "h-bars", "seg-bar", "stat"],
  },
  {
    id: "bento-attention",
    title: "Needs attention",
    component: BentoAttention,
    requires: ["workspace"],
    defaultSize: "8x3",
    min: "1x1",
    hosts: ["attention-list", "animated-number", "chip"],
  },
  {
    id: "bento-signals",
    title: "Signal mix",
    component: BentoSignals,
    requires: ["workspace"],
    defaultSize: "4x3",
    min: "1x1",
    hosts: ["seg-bar", "stat", "h-bars"],
  },
  {
    id: "bento-pulse",
    title: "Workspace pulse",
    component: BentoPulse,
    requires: ["workspace", "report"],
    defaultSize: "12x3",
    min: "1x1",
    hosts: [
      "report-gate",
      "view-carousel",
      "chart",
      "donut",
      "h-bars",
      "seg-bar",
      "kv-list",
      "stat",
    ],
  },
  {
    id: "bento-project-tile",
    title: "Bento project tile",
    component: BentoProjectTile,
    requires: ["workspace", "report"],
    defaultSize: "2x2",
    min: "1x1",
    hosts: [
      "led-project",
      "git-glyphs",
      "score-ring",
      "severity-dots",
      "chip",
      "view-carousel",
      "chart",
      "h-bars",
      "kv-list",
    ],
  },
];
