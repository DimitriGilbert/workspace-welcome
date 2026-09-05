/**
 * Bento's widget kinds (master plan §3.3, §5 T2-bento + T3-bento).
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
 *
 * Six project-page kinds port the design's project page
 * (`components/designs/bento/project-page.tsx`): the overview band's
 * identity tile and GROUPED state tile (git controls + last commit in one
 * tile — the owner-mandated grouping), the per-entry pulse-summary slice
 * and the full tabbed report band (both over the repo-scoped ReportProvider
 * via ReportGate), the tabbed files/artifacts/ideation working surface, and
 * the commit-history band (CommitsList part).
 */
import type { WidgetDef } from "@/widgets/registry";

import { BentoActivity, BentoHealth, BentoStacks } from "./vitals";
import { BentoAttention, BentoSignals } from "./signals";
import { BentoPulse } from "./pulse";
import { BentoProjectTile } from "./project-tile";
import { BentoProjectIdentity, BentoProjectState } from "./project-hero";
import { BentoProjectSummary, BentoProjectPulse } from "./project-report";
import { BentoProjectSurface, BentoProjectCommits } from "./project-surface";

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
  {
    id: "bento-project-identity",
    title: "Project identity",
    component: BentoProjectIdentity,
    requires: ["project", "report"],
    defaultSize: "3x4",
    min: "1x1",
    hosts: ["led-project", "note-editor", "chip", "stat"],
  },
  {
    id: "bento-project-state",
    title: "Project state",
    component: BentoProjectState,
    requires: ["project"],
    defaultSize: "5x4",
    min: "1x1",
    hosts: ["git-actions-toolbar", "branch-switcher", "git-glyphs", "chip"],
  },
  {
    id: "bento-project-summary",
    title: "Pulse summary",
    component: BentoProjectSummary,
    requires: ["project", "report"],
    defaultSize: "4x4",
    min: "1x1",
    hosts: ["report-gate", "stat", "kv-list", "chart", "chip"],
  },
  {
    id: "bento-project-pulse",
    title: "Project pulse",
    component: BentoProjectPulse,
    requires: ["project", "report"],
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
    id: "bento-project-surface",
    title: "Working surface",
    component: BentoProjectSurface,
    requires: ["project"],
    defaultSize: "12x5",
    min: "1x1",
    hosts: ["files-list", "artifacts-list"],
  },
  {
    id: "bento-project-commits",
    title: "Commit history",
    component: BentoProjectCommits,
    requires: ["project"],
    defaultSize: "12x3",
    min: "1x1",
    hosts: ["commits-list"],
  },
];
