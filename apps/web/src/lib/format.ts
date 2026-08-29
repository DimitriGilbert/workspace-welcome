import { formatDistanceToNow, format } from "date-fns";

/** "3 days ago" style — compact relative time for the UI. date-fns hedges
 * ("about 3 weeks ago") which bloats dense tables, so qualifiers are trimmed;
 * exact dates live in the tooltips. */
export function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true })
      .replace(/^about /, "")
      .replace(/^almost /, "")
      .replace(/^over /, "");
  } catch {
    return "—";
  }
}

/** Absolute date like "Jul 14, 2026" for tooltips / detail views. */
export function absoluteDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return format(new Date(iso), "MMM d, yyyy");
  } catch {
    return "—";
  }
}

/** Both relative and absolute, joined for tooltips. */
export function dateTooltip(iso: string | null): string {
  if (!iso) return "";
  return `${relativeTime(iso)} (${absoluteDate(iso)})`;
}
