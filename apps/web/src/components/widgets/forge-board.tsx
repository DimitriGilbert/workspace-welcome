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
 */
import {
  CircleAlert,
  CircleDot,
  GitPullRequest,
  MessageSquare,
  RefreshCw,
} from "lucide-react";
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
import { cn } from "@workspace-welcome/ui/lib/utils";

import { FORGE_PAGE_LIMIT, TRUNCATED_COUNT } from "@/components/parts";
import { useProject } from "@/lib/contexts/project-context";
import { dateTooltip, relativeTime } from "@/lib/format";
import { useForgeProjectQuery, useForgeSyncMutation } from "@/lib/queries/forge";
import type { ForgeProjectSnapshot } from "@/lib/queries/forge";

import type { RegisteredWidgetProps } from "./registry";

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
}: ForgeRowProps) {
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

function IssueRows({ issues }: { issues: ForgeProjectSnapshot["issues"] }) {
  if (issues.length === 0) {
    return <p className="px-3 pb-1 text-[10px] text-muted-foreground">No open issues.</p>;
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
        />
      ))}
    </>
  );
}

function PullRows({ pulls }: { pulls: ForgeProjectSnapshot["pulls"] }) {
  if (pulls.length === 0) {
    return (
      <p className="px-3 pb-1 text-[10px] text-muted-foreground">No open pull requests.</p>
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

  const issuesText = data.issues.length >= FORGE_PAGE_LIMIT
    ? TRUNCATED_COUNT
    : String(data.issues.length);
  const pullsText = data.pulls.length >= FORGE_PAGE_LIMIT
    ? TRUNCATED_COUNT
    : String(data.pulls.length);
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
            {issuesText}
          </span>
          <span className="inline-flex items-center gap-0.5" title="open pull requests">
            <GitPullRequest aria-hidden className="size-2.5" />
            {pullsText}
          </span>
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
          disabled={sync.isPending}
          onClick={syncNow}
        >
          <RefreshCw aria-hidden className={cn("size-3", sync.isPending && "animate-spin")} />
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
      <ScrollArea className="min-h-0 flex-1">
        <div className="pb-2">
          <GroupLabel>Issues</GroupLabel>
          <IssueRows issues={data.issues} />
          <GroupLabel>Pull requests</GroupLabel>
          <PullRows pulls={data.pulls} />
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
