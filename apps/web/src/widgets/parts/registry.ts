/**
 * The parts registry wrappers (master plan §3.5): every part above becomes
 * a stamped `PartDef` via `definePart` — `id` for the probe/docs identity,
 * and `min` taken VERBATIM from the ui export (`MIN_CONTENT`) where the
 * part's smallest ui child declares one. Never restate px here: the ui
 * component's export is the single source of truth, and `definePart`
 * stamps `data-part-min-w/h` from whatever value lands in `min`.
 *
 * Parts with no meaningful px floor (gates, forms/dialog chrome, wrappers
 * that fill their box) omit `min` — the widget registry's `min` rung is the
 * authored cell floor that clamps placement, this is only the advisory
 * part-level marker the harness validates.
 */
import { MIN_CONTENT as LED_MIN_CONTENT } from "@workspace-welcome/ui/components/led";
import { MIN_CONTENT as PULSE_STRIP_MIN_CONTENT } from "@workspace-welcome/ui/components/pulse-strip";

import { definePart } from "@/lib/widget/part";

import { AttentionList } from "./attention-list";
import { FormAddRoot } from "./form/add-root";
import { FormCloneScript } from "./form/clone-script";
import { FormCreateProject } from "./form/create-project";
import { FormReportRun } from "./form/report-run";
import { BranchSwitcher } from "./git/branch-switcher";
import { GitActionsToolbar } from "./git/actions-toolbar";
import { ProjectLed } from "./led-project";
import { ArtifactsList } from "./list/artifacts";
import { CommitsList } from "./list/commits";
import { FilesList } from "./list/files";
import { NoteEditor } from "./note-editor";
import { ProjectPulse } from "./project-pulse";
import { ReportGate } from "./report-gate";

/** The report status gate (§3.5 merged API + behavior matrix). */
export const ReportGatePart = definePart({ id: "report-gate", component: ReportGate });

/** The triage surface (attentionProjects rows/strip). */
export const AttentionListPart = definePart({
  id: "attention-list",
  component: AttentionList,
});

/** One project's activity sparkline (pulseCells → PulseStrip). */
export const ProjectPulsePart = definePart({
  id: "project-pulse",
  min: PULSE_STRIP_MIN_CONTENT,
  component: ProjectPulse,
});

/** The "where I left off" note editor (useProject().note). */
export const NoteEditorPart = definePart({ id: "note-editor", component: NoteEditor });

/** The 5-tone project lamp (ledState → Led). */
export const ProjectLedPart = definePart({
  id: "led-project",
  min: LED_MIN_CONTENT,
  component: ProjectLed,
});

/** Interactive git: branch switcher + fetch/pull/push toolbar (useProject().git). */
export const BranchSwitcherPart = definePart({
  id: "branch-switcher",
  component: BranchSwitcher,
});
export const GitActionsToolbarPart = definePart({
  id: "git-actions-toolbar",
  component: GitActionsToolbar,
});

/** Leaf list wrappers: FileBrowser, ArtifactsPanel, commit history views. */
export const FilesListPart = definePart({ id: "files-list", component: FilesList });
export const ArtifactsListPart = definePart({
  id: "artifacts-list",
  component: ArtifactsList,
});
export const CommitsListPart = definePart({ id: "commits-list", component: CommitsList });

/** Token-styled form dialogs over `@/lib/forms` flows. */
export const FormCreateProjectPart = definePart({
  id: "form-create-project",
  component: FormCreateProject,
});
export const FormAddRootPart = definePart({ id: "form-add-root", component: FormAddRoot });
export const FormCloneScriptPart = definePart({
  id: "form-clone-script",
  component: FormCloneScript,
});
export const FormReportRunPart = definePart({
  id: "form-report-run",
  component: FormReportRun,
});
