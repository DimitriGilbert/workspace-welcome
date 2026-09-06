/**
 * Meadow's widget kinds (master plan §3.3, §5 T2/T3-meadow).
 *
 * The eager glob in `widgets/registry.ts` picks this module up and merges
 * its `widgetDefs` into the validated registry — theme waves never edit
 * the shared registry file, and duplicate ids throw at module evaluation.
 *
 * Dashboard kinds (T2): the masthead row (greeting + counts + search +
 * commands), the attention band (the design's honey pill strip), the
 * recency project tile (the design's five-tier bento tile, fed by the
 * `"projects"` flow's ladder rungs), and the context panel (the design's
 * right rail: report + workspace digests).
 *
 * Project-page kinds (T3): the identity header, the report-at-a-glance
 * strip, and the soft tabbed sections composing the git/, note, list/
 * parts and the shared IdeationPanel.
 */
import type { WidgetDef } from "@/widgets/registry";

import { MeadowAttention } from "./meadow-attention";
import { MeadowContext } from "./meadow-context";
import { MeadowHeader } from "./meadow-header";
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
    id: "meadow-context",
    title: "Workspace context",
    component: MeadowContext,
    requires: ["workspace", "report"],
    defaultSize: "12x12",
  },
  {
    id: "meadow-project-header",
    title: "Project identity",
    component: MeadowProjectHeader,
    requires: ["project"],
    defaultSize: "12x1",
  },
  {
    id: "meadow-project-stats",
    title: "Report at a glance",
    component: MeadowProjectStats,
    requires: ["project", "report"],
    defaultSize: "12x1",
  },
  {
    id: "meadow-project-sections",
    title: "Project sections",
    component: MeadowProjectSections,
    requires: ["project", "report"],
    defaultSize: "12x7",
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
