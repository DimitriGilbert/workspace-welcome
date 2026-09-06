/**
 * Bento's widget kinds — the design's components ported 1:1
 * (`components/designs/bento/**` is the source; these are the same markup,
 * classes and treatments, fed by the widget system's provider stack).
 *
 * Dashboard: the command bar (`bento-chrome`), the vitals band
 * (`bento-health` / `bento-activity` / `bento-stacks`), the signals row
 * (`bento-attention` / `bento-signals`), the tabbed snitch band
 * (`bento-pulse`), and the recency-sized mosaic tile (`bento-project-tile`).
 *
 * Project page: the glazed nav bar (`bento-project-nav`), the identity +
 * grouped state tiles, the pulse-summary slice, the full repo report band,
 * the files/artifacts/ideation surface, and the commit history band.
 */
import type { WidgetDef } from "@/widgets/registry";

import { BentoActivity, BentoHealth, BentoStacks } from "./vitals";
import { BentoAttention, BentoSignals } from "./signals";
import { BentoPulse } from "./pulse";
import { BentoProjectTile } from "./project-tile";
import { BentoProjectIdentity, BentoProjectNav, BentoProjectState } from "./project-hero";
import { BentoProjectSummary, BentoProjectPulse } from "./project-report";
import { BentoProjectSurface, BentoProjectCommits } from "./project-surface";
import { BentoChrome } from "./chrome";
import { BentoMosaicHeader } from "./mosaic-header";

export const widgetDefs: readonly WidgetDef[] = [
  {
    id: "bento-chrome",
    title: "Bento command bar",
    component: BentoChrome,
    requires: ["workspace"],
    defaultSize: "12x1",
    min: "1x1",
  },
  {
    id: "bento-mosaic-header",
    title: "Projects",
    component: BentoMosaicHeader,
    requires: ["workspace"],
    defaultSize: "12x1",
    min: "1x1",
  },
  {
    id: "bento-health",
    title: "Workspace health",
    component: BentoHealth,
    requires: ["workspace"],
    defaultSize: "3x3",
    min: "1x1",
  },
  {
    id: "bento-activity",
    title: "Activity",
    component: BentoActivity,
    requires: ["workspace"],
    defaultSize: "6x3",
    min: "1x1",
  },
  {
    id: "bento-stacks",
    title: "Stack mix",
    component: BentoStacks,
    requires: ["workspace"],
    defaultSize: "3x3",
    min: "1x1",
  },
  {
    id: "bento-attention",
    title: "Needs attention",
    component: BentoAttention,
    requires: ["workspace"],
    defaultSize: "8x3",
    min: "1x1",
  },
  {
    id: "bento-signals",
    title: "Signal mix",
    component: BentoSignals,
    requires: ["workspace"],
    defaultSize: "4x3",
    min: "1x1",
  },
  {
    id: "bento-pulse",
    title: "Workspace pulse",
    component: BentoPulse,
    requires: ["workspace", "report"],
    defaultSize: "12x3",
    min: "1x1",
  },
  {
    id: "bento-project-tile",
    title: "Bento project tile",
    component: BentoProjectTile,
    requires: ["workspace", "report"],
    defaultSize: "2x2",
    min: "1x1",
  },
  {
    id: "bento-project-nav",
    title: "Project nav",
    component: BentoProjectNav,
    requires: ["project"],
    defaultSize: "12x1",
    min: "1x1",
  },
  {
    id: "bento-project-identity",
    title: "Project identity",
    component: BentoProjectIdentity,
    requires: ["project", "report"],
    defaultSize: "3x4",
    min: "1x1",
  },
  {
    id: "bento-project-state",
    title: "Project state",
    component: BentoProjectState,
    requires: ["project"],
    defaultSize: "5x4",
    min: "1x1",
  },
  {
    id: "bento-project-summary",
    title: "Pulse summary",
    component: BentoProjectSummary,
    requires: ["project", "report"],
    defaultSize: "4x4",
    min: "1x1",
  },
  {
    id: "bento-project-pulse",
    title: "Project pulse",
    component: BentoProjectPulse,
    requires: ["project", "report"],
    defaultSize: "12x5",
    min: "1x1",
  },
  {
    id: "bento-project-surface",
    title: "Working surface",
    component: BentoProjectSurface,
    requires: ["project"],
    defaultSize: "12x5",
    min: "1x1",
  },
  {
    id: "bento-project-commits",
    title: "Commit history",
    component: BentoProjectCommits,
    requires: ["project"],
    defaultSize: "12x4",
    min: "1x1",
  },
];
