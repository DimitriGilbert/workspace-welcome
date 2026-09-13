/**
 * git-snitch period presets — the FULL set the API accepts
 * (`REPORT_PERIODS` in the reports router), declared once as pure data.
 *
 * A leaf module on purpose: themes (bento, meadow) render period pickers
 * and the grep-invariant `themes-deps` forbids theme files from importing
 * query modules — `lib/queries/reports` re-exports this for its consumers,
 * themes import it here.
 */
import type { ReportPeriod } from "@workspace-welcome/api/routers/reports";

/** `All` maps to `undefined` = all history. `label` is the compact register
 * (chips, the header dialog); `longLabel` is the sentence register (sheet
 * dialogs). */
export const REPORT_PERIOD_PRESETS: readonly {
  value: ReportPeriod | undefined;
  label: string;
  longLabel: string;
}[] = [
  { value: undefined, label: "All", longLabel: "All time" },
  { value: "7d", label: "7d", longLabel: "Last 7 days" },
  { value: "14d", label: "14d", longLabel: "Last 2 weeks" },
  { value: "1m", label: "1m", longLabel: "Last month" },
  { value: "3m", label: "3m", longLabel: "Last 3 months" },
  { value: "6m", label: "6m", longLabel: "Last 6 months" },
  { value: "1y", label: "1y", longLabel: "Last year" },
];

/** The label of a period preset value ("All" for undefined). */
export function reportPeriodLabel(period: ReportPeriod | undefined): string {
  return REPORT_PERIOD_PRESETS.find((p) => p.value === period)?.label ?? "All";
}
