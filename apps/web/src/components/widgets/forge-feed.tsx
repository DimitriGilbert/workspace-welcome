/**
 * ForgeFeed — the dashboard's "My issues & pull requests" board (core widget
 * kind, plan §Phase 9b).
 *
 * The signed-in account's open issues + pull requests across EVERY GitHub
 * repository (workspace or not) over the pure-DB `forge.feed` query — the
 * cross-repo sibling of the project page's `ProjectForge`. Repo attribution
 * (`owner/repo`) rides every row because cross-repo is the point. The ONLY
 * sync affordance is the explicit Sync button wired to the `forge.syncFeed`
 * mutation (rate-limit discipline lives server-side — the client never
 * auto-syncs). Being a CORE kind it composes only ui-package components and
 * token vocabulary — no theme chrome — exactly like its sibling
 * `project-forge`.
 *
 * Honesty rules (mirroring ProjectForge, held verbatim): rows render ONLY
 * what the cache serves — never fabricated content. `status "never"` renders
 * the Sync CTA, never a fake empty list. `status "failed"` WITHOUT a
 * `fetchedAt` (no fetch ever succeeded) renders the alert-tone retry state;
 * WITH a `fetchedAt` (a later sync failed) it renders the last good snapshot
 * plus a failure hint line carrying `error`. An empty-but-synced feed says
 * so honestly, and a list that hit the server's page limit says so with the
 * shared "50+" vocabulary — never a false exact count.
 */
import { CircleAlert, CircleDot, GitPullRequest, RefreshCw } from "lucide-react";
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
import { dateTooltip, relativeTime } from "@/lib/format";
import { useForgeFeedQuery, useForgeFeedSyncMutation } from "@/lib/queries/forge";
import type { ForgeFeedItem } from "@/lib/queries/forge";

import type { RegisteredWidgetProps } from "./registry";

/** One feed row — the cross-repo attribution line is the point, so the muted
 * metadata carries `owner/repo` where the project board carries the author. */
function FeedRow({ item }: { item: ForgeFeedItem }) {
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      title={item.title}
      className="flex min-w-0 items-start gap-2 px-3 py-1.5 transition-colors hover:bg-muted/50"
    >
      {item.kind === "pr" ? (
        <GitPullRequest aria-hidden className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
      ) : (
        <CircleDot aria-hidden className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
      )}
      <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
        #{item.number}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium leading-tight">{item.title}</span>
        <span className="flex min-w-0 items-center gap-1.5 text-[10px] leading-4 text-muted-foreground">
          <span className="max-w-full truncate" title={item.repoSlug}>
            {item.repoSlug}
          </span>
          {item.kind === "pr" && item.isDraft ? (
            <Chip tone="neutral" className="px-1.5 py-0 text-[10px]">draft</Chip>
          ) : null}
          {item.labels.length > 0 ? (
            <span className="truncate" title={item.labels.join(" · ")}>
              {item.labels.join(" · ")}
            </span>
          ) : null}
        </span>
      </span>
      <span
        className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground"
        title={dateTooltip(item.updatedAt)}
      >
        {relativeTime(item.updatedAt)}
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

export function ForgeFeed(_props: RegisteredWidgetProps) {
  const feed = useForgeFeedQuery();
  const sync = useForgeFeedSyncMutation();
  const data = feed.data ?? null;

  const syncNow = () => {
    sync.mutate({});
  };

  if (feed.isError) {
    return (
      <div className="flex h-full min-h-0 w-full items-center px-3">
        <p role="alert" className="text-xs leading-relaxed text-(--sev-critical)">
          {feed.error?.message ?? "forge feed unavailable"}
        </p>
      </div>
    );
  }

  if (data === null) {
    return <QuietEmpty>Reading the forge cache…</QuietEmpty>;
  }

  if (data.status === "never") {
    return (
      <Empty className="h-full">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <GitPullRequest aria-hidden />
          </EmptyMedia>
          <EmptyTitle>Never synced</EmptyTitle>
          <EmptyDescription>
            Fetch your open issues and pull requests across every GitHub repository.
          </EmptyDescription>
        </EmptyHeader>
        <Button size="sm" variant="outline" disabled={sync.isPending} onClick={syncNow}>
          <RefreshCw aria-hidden className={cn("size-3.5", sync.isPending && "animate-spin")} />
          {sync.isPending ? "Syncing…" : "Sync now"}
        </Button>
      </Empty>
    );
  }

  // A failure with nothing to show for it — no fetch ever succeeded, so the
  // retry CTA carries the error verbatim, never a fabricated empty list.
  if (data.status === "failed" && data.fetchedAt === null) {
    return (
      <Empty className="h-full">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CircleAlert aria-hidden />
          </EmptyMedia>
          <EmptyTitle className="text-(--sev-critical)">Sync failed</EmptyTitle>
          <EmptyDescription
            className="line-clamp-2 break-words text-(--sev-critical)"
            title={data.error ?? undefined}
          >
            {data.error ?? "unknown error"}
          </EmptyDescription>
        </EmptyHeader>
        <Button size="sm" variant="outline" disabled={sync.isPending} onClick={syncNow}>
          <RefreshCw aria-hidden className={cn("size-3.5", sync.isPending && "animate-spin")} />
          {sync.isPending ? "Syncing…" : "Retry"}
        </Button>
      </Empty>
    );
  }

  const issuesCount = data.items.filter((item) => item.kind === "issue").length;
  const pullsCount = data.items.length - issuesCount;
  const issuesText = issuesCount >= FORGE_PAGE_LIMIT
    ? TRUNCATED_COUNT
    : String(issuesCount);
  const pullsText = pullsCount >= FORGE_PAGE_LIMIT
    ? TRUNCATED_COUNT
    : String(pullsCount);
  const failed = data.status === "failed";

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="flex min-w-0 shrink-0 items-center gap-2 px-3 pt-2">
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
                title="Feed older than the sync TTL — Sync fetches fresh data"
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
          title={data.error ?? undefined}
        >
          <CircleAlert aria-hidden className="size-3 shrink-0" />
          <span className="truncate">
            Last sync failed: {data.error ?? "unknown error"}
          </span>
        </p>
      ) : null}
      <ScrollArea className="min-h-0 flex-1">
        <div className="pb-2">
          {data.items.length === 0 ? (
            <p className="px-3 pb-1 pt-2 text-[10px] text-muted-foreground">
              Nothing open authored by you.
            </p>
          ) : (
            data.items.map((item) => (
              <FeedRow key={`${item.repoSlug}#${item.number}`} item={item} />
            ))
          )}
        </div>
      </ScrollArea>
      {data.truncated ? (
        <p className="shrink-0 border-t border-border px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
          {TRUNCATED_COUNT} shown — a list hit the page limit
        </p>
      ) : null}
    </div>
  );
}
