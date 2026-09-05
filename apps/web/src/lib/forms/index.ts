/**
 * Shared, container-independent form flows for the dashboard: everything a
 * redesign needs to render the create-project wizard or the add-directory
 * form outside the default sheets (dialogs, expanding blocks, block
 * replacement) — field/page definitions, the useFormedible wiring with
 * validation and submit, the scaffold job tracking, and the add-root
 * success handling. The sheets in `@/components` remain the default
 * containers and consume this module.
 */

export {
  CreateProjectFlow,
  ScaffoldFormBody,
  ScaffoldJobView,
  buildScaffoldFormFields,
  SCAFFOLD_FORM_PAGES,
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
export { useAddRoot } from "./add-root";
export type { UseAddRootOptions, UseAddRootResult } from "./add-root";
