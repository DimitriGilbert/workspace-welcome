import { useMemo } from "react";
import { CircleDot, GitPullRequest } from "lucide-react";

import type { Project } from "@workspace-welcome/api/lib/types";
import { Chip } from "@workspace-welcome/ui/components/chip";

import { relativeTime } from "@/lib/format";
import { useForgeOverviewMap } from "@/lib/queries/forge";

/**
 * ForgeChips — one project's cached open-issue / open-PR counts from the
 * forge overview. The overview is a pure database read, so the chips are a
 * cache rendering only: no snapshot for the path ⇒ nothing at all (never a
 * fake zero) — the server drops never-synced links (`fetchedAt` null), and
 * the guard below repeats that belt-and-braces. A truncated snapshot shows
 * the page-limit floor ("50+") instead of a false exact count. Tooltips
 * carry the count and the sync age.
 */

/**
 * The count shown when the snapshot hit the server's page limit — mirrors
 * `PAGE_LIMIT` in `packages/api/src/lib/forge/constants.ts`; only the
 * boolean flag crosses the wire, so the floor numeral rides the client.
 */
const TRUNCATED_COUNT = "50+";

export interface ForgeChipsProps {
  project: Project;
}

export function ForgeChips({ project }: ForgeChipsProps) {
  const overview = useForgeOverviewMap();
  const entry = overview.get(project.path);
  if (entry === undefined || entry.fetchedAt === null) return null;

  const synced =
    entry.fetchedAt === null ? "" : ` · synced ${relativeTime(entry.fetchedAt)}`;

  return (
    <span className="inline-flex items-center gap-1.5">
      <Chip
        tone="info"
        title={
          entry.truncated
            ? `${TRUNCATED_COUNT} open issues — a list hit the page limit${synced}`
            : `${entry.openIssues} open issues${synced}`
        }
      >
        <CircleDot aria-hidden className="size-3" />
        {entry.truncated ? TRUNCATED_COUNT : entry.openIssues}
      </Chip>
      <Chip
        tone="info"
        title={
          entry.truncated
            ? `${TRUNCATED_COUNT} open pull requests — a list hit the page limit${synced}`
            : `${entry.openPulls} open pull requests${synced}`
        }
      >
        <GitPullRequest aria-hidden className="size-3" />
        {entry.truncated ? TRUNCATED_COUNT : entry.openPulls}
      </Chip>
    </span>
  );
}

/**
 * The fleet ledger's column census (the note-column idiom): true only when
 * at least one listed project has a cached snapshot — no data, no column.
 * Lives on the part rather than in `lib/queries/` because themes reach
 * forge data through the parts barrel; the query path itself never crosses
 * into a theme (themes-deps invariant).
 */
export function useForgeCensus(projects: Project[]): boolean {
  const overview = useForgeOverviewMap();
  return useMemo(
    () => projects.some((project) => overview.has(project.path)),
    [overview, projects],
  );
}
