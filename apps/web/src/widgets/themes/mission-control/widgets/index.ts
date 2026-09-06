/**
 * Mission Control's widget kinds (master plan §3.3, §5 T1/T2).
 *
 * The eager glob in `widgets/registry.ts` picks this module up and merges
 * its `widgetDefs` into the validated registry — theme waves never edit
 * the shared registry file, and duplicate ids throw at module evaluation.
 *
 * T2 dashboard port (widget-for-widget from `components/designs/
 * mission-control/` + `routes/designs/mission-control/index.tsx`): ids are
 * prefixed `mc-` so parallel theme waves can never collide in the merged
 * registry.
 *
 * T3 project-page port: the state band (git controls + facts + last commit
 * + history), the commit pulse, the note, and the files/artifacts/ideation
 * console — ported from `routes/designs/mission-control/project.$.tsx`.
 * The report channels (`mc-report-*`, T2) are reused on the project page:
 * they read `ReportContext`, which the project stack provides per-project
 * (`{ kind: "repo", path }`).
 */
import type { WidgetDef } from "@/widgets/registry";

import { McActivityHeatmap, McAlertsDonut, McDirtyLeaders, McStackMix } from "./analytics";
import { McCommandBar } from "./command-bar";
import { McFleetLedger } from "./fleet-ledger";
import { McProjectConsole, McProjectNote } from "./project-console";
import { McProjectCommits } from "./project-commits";
import { McProjectPulse } from "./project-pulse";
import { McProjectStateBand } from "./project-state-band";
import { McReportActivity } from "./report-activity";
import { McReportAi } from "./report-ai";
import { McReportCode } from "./report-code";
import { McReportHealth } from "./report-health";
import { McRoots } from "./roots-panel";
import { McTriage } from "./triage-board";
import { McVitals } from "./vitals";

export const widgetDefs: readonly WidgetDef[] = [
  {
    id: "mc-vitals",
    title: "Fleet vitals",
    component: McVitals,
    requires: ["workspace"],
    defaultSize: "2x2",
    min: "1x1",
    hosts: [],
  },
  {
    id: "mc-command-bar",
    title: "Command bar",
    component: McCommandBar,
    requires: ["workspace"],
    defaultSize: "2x1",
    min: "1x1",
    hosts: [],
  },
  {
    id: "mc-triage",
    title: "Triage",
    component: McTriage,
    requires: ["workspace"],
    defaultSize: "2x2",
    min: "1x1",
    hosts: ["pulse-strip"],
  },
  {
    id: "mc-fleet-ledger",
    title: "Fleet ledger",
    component: McFleetLedger,
    requires: ["workspace"],
    defaultSize: "2x3",
    min: "1x1",
    hosts: ["data-table", "led-project", "pulse-strip", "severity-dots"],
  },
  {
    id: "mc-report-activity",
    title: "Activity",
    component: McReportActivity,
    requires: ["workspace", "report"],
    defaultSize: "2x2",
    min: "1x1",
    hosts: ["report-gate", "chart", "data-table", "stat"],
  },
  {
    id: "mc-report-ai",
    title: "AI usage",
    component: McReportAi,
    requires: ["workspace", "report"],
    defaultSize: "2x2",
    min: "1x1",
    hosts: ["report-gate", "stat"],
  },
  {
    id: "mc-report-health",
    title: "Health",
    component: McReportHealth,
    requires: ["workspace", "report"],
    defaultSize: "2x2",
    min: "1x1",
    hosts: ["report-gate", "data-table", "stat"],
  },
  {
    id: "mc-report-code",
    title: "Code",
    component: McReportCode,
    requires: ["workspace", "report"],
    defaultSize: "2x2",
    min: "1x1",
    hosts: ["report-gate", "donut", "stat"],
  },
  {
    id: "mc-activity-heatmap",
    title: "Activity",
    component: McActivityHeatmap,
    requires: ["workspace"],
    defaultSize: "2x2",
    min: "1x1",
    hosts: ["heatmap", "stat"],
  },
  {
    id: "mc-alerts-donut",
    title: "Alerts",
    component: McAlertsDonut,
    requires: ["workspace"],
    defaultSize: "2x2",
    min: "1x1",
    hosts: ["donut", "stat"],
  },
  {
    id: "mc-stack-mix",
    title: "Stack mix",
    component: McStackMix,
    requires: ["workspace"],
    defaultSize: "2x2",
    min: "1x1",
    hosts: ["donut", "stat"],
  },
  {
    id: "mc-dirty-leaders",
    title: "Dirty leaders",
    component: McDirtyLeaders,
    requires: ["workspace"],
    defaultSize: "2x1",
    min: "1x1",
    hosts: ["h-bars", "stat"],
  },
  {
    id: "mc-roots",
    title: "Roots",
    component: McRoots,
    requires: ["workspace"],
    defaultSize: "2x1",
    min: "1x1",
    hosts: ["data-table"],
  },
  {
    id: "mc-project-state-band",
    title: "State band",
    component: McProjectStateBand,
    requires: ["project"],
    defaultSize: "4x4",
    min: "1x1",
    hosts: ["git-actions-toolbar", "branch-switcher", "chip"],
  },
  {
    id: "mc-project-pulse",
    title: "Commit pulse",
    component: McProjectPulse,
    requires: ["project"],
    defaultSize: "3x4",
    min: "1x1",
    hosts: ["heatmap", "stat"],
  },
  {
    id: "mc-project-commits",
    title: "Recent commits",
    component: McProjectCommits,
    requires: ["project"],
    defaultSize: "3x4",
    min: "1x1",
    hosts: ["data-table"],
  },
  {
    id: "mc-project-note",
    title: "where i left off",
    component: McProjectNote,
    requires: ["project"],
    defaultSize: "4x3",
    min: "1x1",
    hosts: ["note-editor"],
  },
  {
    id: "mc-project-console",
    title: "Working surface",
    component: McProjectConsole,
    requires: ["project"],
    defaultSize: "6x6",
    min: "1x1",
    hosts: ["files-list", "artifacts-list"],
  },
];
