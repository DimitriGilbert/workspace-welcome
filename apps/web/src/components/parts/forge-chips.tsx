import { useMemo } from "react";
import { CircleDot, GitPullRequest } from "lucide-react";

import type { Project } from "@workspace-welcome/api/lib/types";
import { Chip } from "@workspace-welcome/ui/components/chip";

import { relativeTime } from "@/lib/format";
import { staleFeedPrs, useForgeFeedQuery, useForgeOverviewMap } from "@/lib/queries/forge";
import type { ForgeOverviewEntry, StalePrRow } from "@/lib/queries/forge";

/**
 * ForgeChips — one project's cached open-issue / open-PR counts from the
 * forge overview. The overview is a pure database read, so the chips are a
 * cache rendering only: no snapshot AND no attributed feed items for the
 * path ⇒ nothing at all (never a fake zero) — the server drops never-synced
 * links (`fetchedAt` null) and slugs the feed cache doesn't hold, and the
 * guard below repeats that belt-and-braces. The zero-drop law: a kind
 * whose count is 0 renders no chip, and both zero ⇒ the part renders
 * nothing at all (a truncated "50+" floor is never zero, so it survives).
 * Entries come in two sources,
 * rendered identically (same chip, same tone — counts deserve visibility):
 * `source: "repo"` is a synced snapshot's totals; `source: "feed"` is the
 * USER's own open items in that repo, attributed by remote slug from the
 * feed cache (plan §Phase 11) — only the tooltip says which. A truncated
 * count shows the page-limit floor ("50+") instead of a false exact number.
 * Tooltips carry the count, the source, and the age.
 */

/**
 * The page-limit floor the client mirrors — the numeric source for the
 * "50+" vocabulary below and the project board's truncation check; only
 * the boolean flag crosses the wire, so the floor rides the client.
 */
export const FORGE_PAGE_LIMIT = 50;

/**
 * The count shown when a snapshot hit the server's page limit — derived from
 * {@link FORGE_PAGE_LIMIT}, which mirrors `PAGE_LIMIT` in
 * `packages/api/src/lib/forge/constants.ts`; consumed by `ForgeChips` and the
 * project page's forge board (one source for the truncation vocabulary).
 */
export const TRUNCATED_COUNT = `${FORGE_PAGE_LIMIT}+`;

/**
 * One chip's tooltip. Repo entries: `<N> open <noun> · synced X ago`. Feed
 * entries must be honest about what they count — the user's own items, not
 * the repo's totals: `<N> of YOUR open <noun> · from your feed · fetched X
 * ago`. Truncation copy is source-independent (the cap law doesn't move):
 * ` — a list hit the page limit` slots in before the source/age tail.
 */
function chipTitle(
  entry: ForgeOverviewEntry,
  count: number,
  noun: "issues" | "pull requests",
): string {
  const feed = entry.source === "feed";
  const head = entry.truncated
    ? `${TRUNCATED_COUNT}${feed ? " of YOUR open" : " open"} ${noun} — a list hit the page limit`
    : `${count}${feed ? " of YOUR open" : " open"} ${noun}`;
  const tail = feed
    ? ` · from your feed · fetched ${relativeTime(entry.fetchedAt)}`
    : ` · synced ${relativeTime(entry.fetchedAt)}`;
  return `${head}${tail}`;
}

export interface ForgeChipsProps {
  project: Project;
}

export function ForgeChips({ project }: ForgeChipsProps) {
  const overview = useForgeOverviewMap();
  const entry = overview.get(project.path);
  if (entry === undefined || entry.fetchedAt === null) return null;

  const showIssues = entry.truncated || entry.openIssues > 0;
  const showPulls = entry.truncated || entry.openPulls > 0;
  if (!showIssues && !showPulls) return null;

  return (
    <span className="inline-flex items-center gap-1.5">
      {showIssues && (
        <Chip
          tone="info"
          title={chipTitle(entry, entry.openIssues, "issues")}
        >
          <CircleDot aria-hidden className="size-3" />
          {entry.truncated ? TRUNCATED_COUNT : entry.openIssues}
        </Chip>
      )}
      {showPulls && (
        <Chip
          tone="info"
          title={chipTitle(entry, entry.openPulls, "pull requests")}
        >
          <GitPullRequest aria-hidden className="size-3" />
          {entry.truncated ? TRUNCATED_COUNT : entry.openPulls}
        </Chip>
      )}
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

/**
 * The triage band's stale-PR rows (plan §Phase 10d): the feed's open PRs
 * past the 30-day law, via `staleFeedPrs` (`lib/queries/forge.ts` — the
 * law and its derivation live there). Rides the parts barrel beside
 * {@link useForgeCensus} because themes never touch `@/lib/queries`
 * (themes-deps invariant); mission-control's `McTriage` is the consumer.
 * Honest absence all the way down: no cached feed, a failed feed query, or
 * no stale PRs ⇒ `[]` — a feed error must never surface in triage, and the
 * band's own alert population renders regardless.
 */
export function useStaleFeedPrs(): StalePrRow[] {
  const feed = useForgeFeedQuery();
  return useMemo(() => staleFeedPrs(feed.data?.items ?? []), [feed.data]);
}
