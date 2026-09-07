/**
 * Meadow's widget kinds (master plan §3.3, §5 T2/T3-meadow; T2 reworked per
 * the owner's verdict — the context rail is gone, every digest is its own
 * kind).
 *
 * The eager glob in `widgets/registry.ts` picks this module up and merges
 * its `widgetDefs` into the validated registry — theme waves never edit
 * the shared registry file, and duplicate ids throw at module evaluation.
 *
 * Dashboard kinds: the masthead row (greeting + counts + search +
 * commands), the attention band (the design's honey pill strip), the
 * bento-of-projects (the recency mosaic as ONE chrome-framed kind running
 * the shared `"projects"` flow generator internally — owner order: no
 * free-floating project tiles on the canvas), and the five workspace
 * digests (report / momentum / rhythm / stacks / directories) — the only
 * non-project content, packed in the last 1/3 rail.
 *
 * Project-page kinds (T3, reworked per the owner's bento order): the
 * chrome-framed tabbed body at two-thirds width, with the identity card and
 * the report-at-a-glance card (stats + language donut) packed in the
 * right-hand rail.
 */
import type { WidgetDef } from "@/widgets/registry";

import { MeadowAttention } from "./meadow-attention";
import { MeadowHeader } from "./meadow-header";
import {
  MeadowDirectoriesDigest,
  MeadowMomentumDigest,
  MeadowReportDigest,
  MeadowRhythmDigest,
  MeadowStacksDigest,
} from "./digests";
import { MeadowProjectBento } from "./project-bento";
import { MeadowProjectHeader } from "./project-header";
import { MeadowProjectSections } from "./project-sections";
import { MeadowProjectStats } from "./project-stats";
import { MeadowProjectTile } from "./tile";

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
    // The digest chip caps at max-w-56 (~128px of real content) — one column
    // (104px) clips it.
    min: "2x1",
  },
  {
    id: "meadow-project-tile",
    title: "Meadow project tile",
    component: MeadowProjectTile,
    requires: ["workspace"],
    defaultSize: "2x2",
    min: "1x1",
  },
  {
    id: "meadow-project-bento",
    title: "Project bento",
    component: MeadowProjectBento,
    requires: ["workspace"],
    defaultSize: "8x13",
    // The mosaic fills its shell exactly (fractional rows); below the 2x2
    // rung there is no honest mosaic, so the ladder floor keeps the lab's
    // catalog off the nonsense rungs.
    min: "2x2",
  },
  {
    id: "meadow-report",
    title: "Workspace report",
    component: MeadowReportDigest,
    requires: ["workspace", "report"],
    defaultSize: "12x3",
  },
  {
    id: "meadow-momentum",
    title: "Momentum · 4 wks",
    component: MeadowMomentumDigest,
    requires: ["workspace"],
    defaultSize: "12x1",
  },
  {
    id: "meadow-rhythm",
    title: "Rhythm",
    component: MeadowRhythmDigest,
    requires: ["workspace"],
    defaultSize: "12x1",
  },
  {
    id: "meadow-stacks",
    title: "Stacks",
    component: MeadowStacksDigest,
    requires: ["workspace"],
    defaultSize: "12x1",
  },
  {
    id: "meadow-directories",
    title: "Directories",
    component: MeadowDirectoriesDigest,
    requires: ["workspace"],
    defaultSize: "12x1",
  },
  {
    id: "meadow-project-header",
    title: "Project identity",
    component: MeadowProjectHeader,
    requires: ["project"],
    defaultSize: "4x3",
  },
  {
    id: "meadow-project-stats",
    title: "Report at a glance",
    component: MeadowProjectStats,
    requires: ["project", "report"],
    defaultSize: "4x4",
  },
  {
    id: "meadow-project-sections",
    title: "Project sections",
    component: MeadowProjectSections,
    requires: ["project", "report"],
    defaultSize: "8x7",
    hosts: [
      "branch-switcher",
      "git-actions-toolbar",
      "note-editor",
      "commits-list",
      "files-list",
      "artifacts-list",
    ],
  },
];
