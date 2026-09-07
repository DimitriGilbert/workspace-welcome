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
    // The bar's honest floor is TWO rows: the brand/action row plus the
    // palette search (the phone preset override `2x2` — the design's
    // <1024px header stacks all three rows). A one-row 2-col placement
    // clips the wrapped stack; anything wider than two columns fits.
    min: "2x2",
  },
  {
    id: "bento-mosaic-header",
    title: "Projects",
    component: BentoMosaicHeader,
    requires: ["workspace"],
    defaultSize: "12x1",
    // The size legend is a nowrap, fixed-shape key (~291px) — the widget's
    // honest cell floor; narrower placements overflow (lab part-min).
    min: "3x3",
  },
  {
    id: "bento-health",
    title: "Workspace health",
    component: BentoHealth,
    requires: ["workspace"],
    defaultSize: "3x3",
    // The gauge is a fixed 170px ring — it cannot compress into one column.
    min: "2x1",
  },
  {
    id: "bento-activity",
    title: "Activity",
    component: BentoActivity,
    requires: ["workspace"],
    defaultSize: "6x3",
    // A 16-week area chart (axes fold away below 200px) — one column cannot
    // hold the chart or the header line.
    min: "2x1",
  },
  {
    id: "bento-stacks",
    title: "Stack mix",
    component: BentoStacks,
    requires: ["workspace"],
    defaultSize: "3x3",
    // The donut is a fixed 112px ring — one column (104px) clips it.
    min: "2x1",
  },
  {
    id: "bento-attention",
    title: "Needs attention",
    component: BentoAttention,
    requires: ["workspace"],
    defaultSize: "8x3",
    // The hero row (30px roll number + mono captions) and the list rows
    // (w-32 name + glyphs + mono numerals, ~240px) are fixed-content —
    // two-column placements clip them.
    min: "3x3",
  },
  {
    id: "bento-signals",
    title: "Signals",
    component: BentoSignals,
    requires: ["workspace"],
    defaultSize: "4x3",
    // List rows carry a fixed w-24 name + numeral pair (~200px) — one
    // column clips them.
    min: "2x1",
  },
  {
    id: "bento-pulse",
    title: "Workspace pulse",
    component: BentoPulse,
    requires: ["workspace", "report"],
    defaultSize: "12x3",
    // The loading skeleton row is a fixed w-64 (~296px with chrome) — below
    // three columns it clips.
    min: "3x3",
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
