/**
 * Shared, container-independent form flows for the dashboard: everything a
 * redesign needs to render the create-project wizard (scaffold or clone
 * tab), or the add-directory form outside the default sheets (dialogs,
 * expanding blocks, block replacement) — field/page definitions, the
 * useFormedible wiring with validation and submit, the scaffold and clone
 * job tracking, and the add-root success handling. The sheets in
 * `@/components` remain the default containers and consume this module.
 */

export {
  CreateProjectFlow,
  JobError,
  ScaffoldFormBody,
  ScaffoldJobView,
  buildScaffoldFormFields,
  SCAFFOLD_FORM_PAGES,
  formatElapsed,
  useScaffoldForm,
  useScaffoldJob,
} from "./create-project";
export type {
  CreateProjectFlowProps,
  ScaffoldFormValues,
  ScaffoldJobViewProps,
  ScaffoldResult,
  UseScaffoldFormOptions,
  UseScaffoldJobOptions,
} from "./create-project";
export {
  CloneFormBody,
  CloneJobView,
  CloneRepositoryFlow,
  buildCloneFormFields,
  useCloneRepositoryForm,
  useCloneRepositoryJob,
} from "./clone-repository";
export type {
  CloneFormValues,
  CloneJobViewProps,
  CloneRepositoryFlowProps,
  CloneResult,
  UseCloneRepositoryFormOptions,
  UseCloneRepositoryJobOptions,
} from "./clone-repository";
export { useAddRoot } from "./add-root";
export type { UseAddRootOptions, UseAddRootResult } from "./add-root";
export { useCloneScript } from "./clone-script";
export type { UseCloneScriptOptions, UseCloneScriptResult } from "./clone-script";
