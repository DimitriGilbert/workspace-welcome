/**
 * The parts barrel — the ONLY import surface for `components/themes/*` (and
 * every other consumer): raw components + prop types from the part files,
 * plus the `definePart`-wrapped registry parts (suffixed `*Part`) whose
 * rendered roots carry `data-part` / `data-part-min-*` stamps. Themes must
 * never deep-import into this directory; the barrel is grep-enforced. The
 * one data hook a theme legitimately needs (the forge census, for the
 * ledger's conditional column) rides here too — themes never touch
 * `@/lib/queries` directly (themes-deps invariant).
 */

export { ReportGate } from "./report-gate";
export type { ReportGateProps, ReportGateMode } from "./report-gate";
export { AttentionList } from "./attention-list";
export type { AttentionListProps } from "./attention-list";
export { ProjectPulse } from "./project-pulse";
export type { ProjectPulseProps } from "./project-pulse";
export { NoteEditor } from "./note-editor";
export type { NoteEditorProps } from "./note-editor";
export { ProjectLed } from "./led-project";
export type { ProjectLedProps } from "./led-project";
export { ForgeChips, useForgeCensus, FORGE_PAGE_LIMIT, TRUNCATED_COUNT } from "./forge-chips";
export type { ForgeChipsProps } from "./forge-chips";

export { BranchSwitcher } from "./git/branch-switcher";
export { GitActionsToolbar } from "./git/actions-toolbar";

export { FilesList } from "./list/files";
export type { FilesListProps } from "./list/files";
export { ArtifactsList } from "./list/artifacts";
export { CommitsList } from "./list/commits";
export type { CommitsListProps, CommitsView } from "./list/commits";

export { FormCreateProject } from "./form/create-project";
export type { FormCreateProjectProps } from "./form/create-project";
export { FormAddRoot } from "./form/add-root";
export type { FormAddRootProps } from "./form/add-root";
export { FormCloneScript } from "./form/clone-script";
export { FormReportRun } from "./form/report-run";

export * from "./registry";
