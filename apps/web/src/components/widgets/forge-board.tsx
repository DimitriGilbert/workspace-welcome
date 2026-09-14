/**
 * ProjectForge — the project page's forge board (core widget kind).
 *
 * One repository's cached open issues + pull requests ("snapshot as of last
 * sync" semantics) over the pure-DB `forge.project` query, plus the ONLY
 * sync affordance on the page: an explicit button wired to the `forge.sync`
 * mutation (rate-limit discipline lives server-side — the client never
 * auto-syncs). Being a CORE kind it composes only ui-package components and
 * token vocabulary — no theme chrome — exactly like its sibling
 * `project-tile`.
 *
 * Honesty rules (the Phase 6 semantics, held verbatim): a `ready` project
 * linked by a FAILED FIRST sync has `fetchedAt: null` — its
 * `lastSyncStatus` is `"never"` when the availability probe failed before
 * any fetch, or `"failed"` once a fetch-stage failure was recorded — so the
 * never-synced empty state keys on `fetchedAt === null ||
 * lastSyncStatus === "never"`, never on "empty lists": both failed-first
 * shapes render the Sync CTA instead of a fabricated empty board. A FAILED
 * LATER sync keeps its last good snapshot (`fetchedAt` present) — that
 * renders the data plus a failure hint line carrying `lastSyncError`. Rows
 * render only what is cached; a list that hit the server's page limit says
 * so with the shared "50+" vocabulary — never a false exact count.
 *
 * Phase 10c adds two read-only-over-the-cache affordances: PR review-decision
 * badges (gh's verbatim verdict, lowercased and tone-tinted — tooltip keeps
 * the raw value) and client-side label filters (a toggle chip-row over the
 * CURRENT rows' label union; OR semantics — a row passes when ANY of its
 * labels is active; the header's count band reports the FILTERED set with a
 * "filtered" hint, while the truncation footer keeps deriving from the
 * unfiltered counts).
 */
import {
  CircleAlert,
  CircleDot,
  GitPullRequest,
  MessageSquare,
  RefreshCw,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";

import { Button } from "@workspace-welcome/ui/components/button";
import { Chip } from "@workspace-welcome/ui/components/chip";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace-welcome/ui/components/empty";
import { ScrollArea } from "@workspace-welcome/ui/components/scroll-area";
import type { Tone } from "@workspace-welcome/ui/lib/tokens";
import { cn } from "@workspace-welcome/ui/lib/utils";

import { FORGE_PAGE_LIMIT, TRUNCATED_COUNT } from "@/components/parts";
import { useProject } from "@/lib/contexts/project-context";
import { dateTooltip, relativeTime } from "@/lib/format";
import { useForgeProjectQuery, useForgeSyncMutation } from "@/lib/queries/forge";
import type { ForgeProjectSnapshot } from "@/lib/queries/forge";

import type { RegisteredWidgetProps } from "./registry";

/**
 * gh's UPPERCASE reviewDecision vocabulary → badge text + severity tone
 * (positive / warning / info — the closest established Chip tones). Unknown
 * verdicts (a future gh value) pass through lowercased on the neutral tone —
 * never fabricated, never dropped. The tooltip keeps the raw gh value.
 */
const REVIEW_DECISIONS: Record<string, { text: string; tone: Tone }> = {
  APPROVED: { text: "approved", tone: "positive" },
  CHANGES_REQUESTED: { text: "changes requested", tone: "warning" },
  REVIEW_REQUIRED: { text: "review required", tone: "info" },
};

function reviewBadge(decision: string): { raw: string; text: string; tone: Tone } {
  const known = REVIEW_DECISIONS[decision];
  if (known !== undefined) return { raw: decision, ...known };
  return { raw: decision, text: decision.toLowerCase(), tone: "neutral" };
}

/** One cached row — the issue/pull fields the board renders. */
interface ForgeRowProps {
  number: number;
  title: string;
  url: string;
  author: string | null;
  labels: string[];
  updatedAt: string | null;
  /** Comment count; issues only (null when the forge didn't report one). */
  commentCount: number | null;
  isPull: boolean;
  isDraft: boolean;
  /** gh's UPPERCASE review verdict; null when no review happened (issues always null). */
  reviewDecision: string | null;
}

function ForgeRow({
  number,
  title,
  url,
  author,
  labels,
  updatedAt,
  commentCount,
  isPull,
  isDraft,
  reviewDecision,
}: ForgeRowProps) {
  const review = reviewDecision !== null ? reviewBadge(reviewDecision) : null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={title}
      className="flex min-w-0 items-start gap-2 px-3 py-1.5 transition-colors hover:bg-muted/50"
    >
      {isPull ? (
        <GitPullRequest aria-hidden className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
      ) : (
        <CircleDot aria-hidden className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
      )}
      <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
        #{number}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium leading-tight">{title}</span>
        <span className="flex min-w-0 items-center gap-1.5 text-[10px] leading-4 text-muted-foreground">
          {author !== null ? (
            <span className="max-w-full truncate" title={author}>
              {author}
            </span>
          ) : null}
          {isDraft ? <Chip tone="neutral" className="px-1.5 py-0 text-[10px]">draft</Chip> : null}
          {review !== null ? (
            <Chip tone={review.tone} title={review.raw} className="shrink-0 px-1.5 py-0 text-[10px]">
              {review.text}
            </Chip>
          ) : null}
          {labels.length > 0 ? (
            <span className="truncate" title={labels.join(" · ")}>
              {labels.join(" · ")}
            </span>
          ) : null}
          {commentCount !== null && commentCount > 0 ? (
            <span className="ml-auto inline-flex shrink-0 items-center gap-0.5 tabular-nums">
              <MessageSquare aria-hidden className="size-2.5" />
              {commentCount}
            </span>
          ) : null}
        </span>
      </span>
      <span
        className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground"
        title={dateTooltip(updatedAt)}
      >
        {relativeTime(updatedAt)}
      </span>
    </a>
  );
}

/** A quiet, box-filling empty line — the project-tile empty idiom. */
function QuietEmpty({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full min-h-0 w-full items-center justify-center px-3">
      <p className="text-xs text-muted-foreground">{children}</p>
    </div>
  );
}

function IssueRows({
  issues,
  total,
  filtered,
}: {
  issues: ForgeProjectSnapshot["issues"];
  total: number;
  filtered: boolean;
}) {
  if (issues.length === 0) {
    return (
      <p className="px-3 pb-1 text-[10px] text-muted-foreground">
        {filtered && total > 0 ? "No issues match the label filter." : "No open issues."}
      </p>
    );
  }
  return (
    <>
      {issues.map((issue) => (
        <ForgeRow
          key={issue.number}
          number={issue.number}
          title={issue.title}
          url={issue.url}
          author={issue.author}
          labels={issue.labels}
          updatedAt={issue.updatedAt}
          commentCount={issue.commentCount}
          isPull={false}
          isDraft={false}
          reviewDecision={null}
        />
      ))}
    </>
  );
}

function PullRows({
  pulls,
  total,
  filtered,
}: {
  pulls: ForgeProjectSnapshot["pulls"];
  total: number;
  filtered: boolean;
}) {
  if (pulls.length === 0) {
    return (
      <p className="px-3 pb-1 text-[10px] text-muted-foreground">
        {filtered && total > 0
          ? "No pull requests match the label filter."
          : "No open pull requests."}
      </p>
    );
  }
  return (
    <>
      {pulls.map((pull) => (
        <ForgeRow
          key={pull.number}
          number={pull.number}
          title={pull.title}
          url={pull.url}
          author={pull.author}
          labels={pull.labels}
          updatedAt={pull.updatedAt}
          commentCount={null}
          isPull
          isDraft={pull.isDraft}
          reviewDecision={pull.reviewDecision}
        />
      ))}
    </>
  );
}

function GroupLabel({ children }: { children: string }) {
  return (
    <p className="px-3 pb-1 pt-2 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
      {children}
    </p>
  );
}

/**
 * The synced board — header, label filter row, rows, truncation footer.
 * Owning the filter state here (the component is mounted keyed by the
 * project's path) resets the selection whenever the project changes; the
 * ACTIVE set is derived against the current label union, so a label a later
 * sync dropped can never linger as a dead selection.
 */
function ForgeBoard({
  data,
  syncPending,
  onSync,
}: {
  data: ForgeProjectSnapshot;
  syncPending: boolean;
  onSync: () => void;
}) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const toggleLabel = (label: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }
      return next;
    });
  };

  // The label union + per-label row counts, from the CURRENT cached rows —
  // an empty union honestly means no filter UI at all.
  const labelIndex = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of [...data.issues, ...data.pulls]) {
      for (const label of row.labels) {
        counts.set(label, (counts.get(label) ?? 0) + 1);
      }
    }
    return { labels: [...counts.keys()].sort(), counts };
  }, [data.issues, data.pulls]);

  // Active = selected ∩ current union — vanished labels derive away.
  const activeLabels = useMemo(
    () => labelIndex.labels.filter((label) => selected.has(label)),
    [labelIndex.labels, selected],
  );
  const filterActive = activeLabels.length > 0;

  // OR semantics: a row passes when ANY of its labels is active; no active
  // label → every row.
  const matches = (labels: string[]) => labels.some((label) => selected.has(label));
  const issues = filterActive ? data.issues.filter((row) => matches(row.labels)) : data.issues;
  const pulls = filterActive ? data.pulls.filter((row) => matches(row.labels)) : data.pulls;

  const issuesText = data.issues.length >= FORGE_PAGE_LIMIT
    ? TRUNCATED_COUNT
    : String(data.issues.length);
  const pullsText = data.pulls.length >= FORGE_PAGE_LIMIT
    ? TRUNCATED_COUNT
    : String(data.pulls.length);
  // The truncation footer keeps deriving from the UNFILTERED counts — the
  // page limit was hit by the cached list, never by a filter.
  const truncated =
    data.issues.length >= FORGE_PAGE_LIMIT || data.pulls.length >= FORGE_PAGE_LIMIT;
  const failed = data.lastSyncStatus === "failed";

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="flex min-w-0 shrink-0 items-center gap-2 px-3 pt-2">
        <span className="truncate font-mono text-[10px] text-muted-foreground">
          {data.repoRef?.slug ?? "—"}
        </span>
        <span className="ml-auto inline-flex shrink-0 items-center gap-2 font-mono text-[10px] tabular-nums text-muted-foreground">
          <span className="inline-flex items-center gap-0.5" title="open issues">
            <CircleDot aria-hidden className="size-2.5" />
            {filterActive ? `${issues.length} of ${issuesText}` : issuesText}
          </span>
          <span className="inline-flex items-center gap-0.5" title="open pull requests">
            <GitPullRequest aria-hidden className="size-2.5" />
            {filterActive ? `${pulls.length} of ${pullsText}` : pullsText}
          </span>
          {filterActive ? <span title="Label filter active">filtered</span> : null}
        </span>
      </div>
      <div className="flex min-w-0 shrink-0 items-center gap-2 px-3 pb-1.5 pt-0.5">
        <span className="min-w-0 truncate font-mono text-[10px] text-muted-foreground">
          synced {relativeTime(data.fetchedAt)}
          {data.stale ? (
            <>
              {" · "}
              <span
                className="uppercase tracking-[0.1em] text-(--sev-warning)"
                title="Snapshot older than the sync TTL — Sync fetches fresh data"
              >
                Stale
              </span>
            </>
          ) : null}
        </span>
        <Button
          className="ml-auto"
          size="xs"
          variant="outline"
          disabled={syncPending}
          onClick={onSync}
        >
          <RefreshCw aria-hidden className={cn("size-3", syncPending && "animate-spin")} />
          Sync
        </Button>
      </div>
      {failed ? (
        <p
          className="flex min-w-0 shrink-0 items-center gap-1.5 px-3 pb-1.5 text-[10px] text-(--sev-critical)"
          title={data.lastSyncError ?? undefined}
        >
          <CircleAlert aria-hidden className="size-3 shrink-0" />
          <span className="truncate">
            Last sync failed: {data.lastSyncError ?? "unknown error"}
          </span>
        </p>
      ) : null}
      {labelIndex.labels.length > 0 ? (
        <div className="flex min-w-0 shrink-0 flex-wrap items-center gap-1 px-3 pb-1.5">
          {labelIndex.labels.map((label) => {
            const active = selected.has(label);
            return (
              <button
                key={label}
                type="button"
                aria-pressed={active}
                title={label}
                onClick={() => toggleLabel(label)}
                className={cn(
                  "inline-flex max-w-40 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium leading-4 transition-colors",
                  active
                    ? "border-transparent bg-accent text-accent-foreground"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                <span className="truncate">{label}</span>
                <span className="shrink-0 tabular-nums opacity-70">
                  {labelIndex.counts.get(label) ?? 0}
                </span>
              </button>
            );
          })}
          {filterActive ? (
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              aria-label="Clear the label filter"
              className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
            >
              <X aria-hidden className="size-2.5" />
              clear
            </button>
          ) : null}
        </div>
      ) : null}
      <ScrollArea className="min-h-0 flex-1">
        <div className="pb-2">
          <GroupLabel>Issues</GroupLabel>
          <IssueRows issues={issues} total={data.issues.length} filtered={filterActive} />
          <GroupLabel>Pull requests</GroupLabel>
          <PullRows pulls={pulls} total={data.pulls.length} filtered={filterActive} />
        </div>
      </ScrollArea>
      {truncated ? (
        <p className="shrink-0 border-t border-border px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
          {TRUNCATED_COUNT} shown — a list hit the page limit
        </p>
      ) : null}
    </div>
  );
}

export function ProjectForge(_props: RegisteredWidgetProps) {
  const { path, project } = useProject();
  const remote = project?.git.remote ?? null;
  const snapshot = useForgeProjectQuery(path, remote?.url);
  const sync = useForgeSyncMutation();
  const data = snapshot.data ?? null;

  const syncNow = () => {
    sync.mutate({ path });
  };

  if (snapshot.isError) {
    return (
      <div className="flex h-full min-h-0 w-full items-center px-3">
        <p role="alert" className="text-xs leading-relaxed text-(--sev-critical)">
          {snapshot.error?.message ?? "forge cache unavailable"}
        </p>
      </div>
    );
  }

  // The scan is the remote's source — no project record yet, no mapping.
  if (project === null) {
    return <QuietEmpty>Waiting for the workspace scan…</QuietEmpty>;
  }

  if (remote === null) {
    return <QuietEmpty>No git remote</QuietEmpty>;
  }

  if (data === null) {
    return <QuietEmpty>Reading the forge cache…</QuietEmpty>;
  }

  if (data.status === "unsupported-host") {
    return <QuietEmpty>GitHub only for now — {remote.host} unsupported</QuietEmpty>;
  }

  // Never synced — including the ready-with-failed-first-sync shapes
  // (`fetchedAt: null` with status "never" or "failed"): the Sync CTA,
  // never a fabricated empty board.
  if (data.fetchedAt === null || data.lastSyncStatus === "never") {
    return (
      <Empty className="h-full">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <GitPullRequest aria-hidden />
          </EmptyMedia>
          <EmptyTitle>Never synced</EmptyTitle>
          <EmptyDescription>
            Fetch this repository&apos;s open issues and pull requests from GitHub.
          </EmptyDescription>
        </EmptyHeader>
        <Button size="sm" variant="outline" disabled={sync.isPending} onClick={syncNow}>
          <RefreshCw aria-hidden className={cn("size-3.5", sync.isPending && "animate-spin")} />
          {sync.isPending ? "Syncing…" : "Sync now"}
        </Button>
      </Empty>
    );
  }

  // Keyed by the project path so the label filter resets when the project
  // the page shows changes.
  return <ForgeBoard key={path} data={data} syncPending={sync.isPending} onSync={syncNow} />;
}
