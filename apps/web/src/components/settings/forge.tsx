/**
 * SettingsForge — the Forge register (plan §Phase 10b): every mapped
 * project↔repo link with its cached open counts and last-sync bookkeeping,
 * read from the pure-DB `forge.repos` query. The register is the honest
 * bookkeeping surface — never-synced and failed links are listed, the
 * status chip carries `lastSyncError` in its tooltip, and a count at the
 * server's page limit renders the shared "50+" floor, never a false exact
 * count. Two explicit doors to a live fetch, both server-guarded: the
 * per-row Sync (`forge.sync` for that row's path) and the header's Sync all
 * (`forge.syncAll`, force:false) — the fleet run whose success invalidation
 * settles every forge query at once. A fleet run that skipped synced-
 * recently repos (min-interval skips carry no `reason`) surfaces the
 * confirm-free "Force sync all" affordance.
 */
import { CircleDot, GitPullRequest, RefreshCw } from "lucide-react";

import { Button } from "@workspace-welcome/ui/components/button";
import { Chip } from "@workspace-welcome/ui/components/chip";
import { Skeleton } from "@workspace-welcome/ui/components/skeleton";
import { cn } from "@workspace-welcome/ui/lib/utils";

import { FORGE_PAGE_LIMIT, TRUNCATED_COUNT } from "@/components/parts";
import { WidgetShell } from "@/components/widgets/widget-shell";
import { dateTooltip, relativeTime } from "@/lib/format";
import {
  useForgeReposQuery,
  useRepoSyncMutation,
  useSyncAllMutation,
} from "@/lib/queries/forge";
import type { ForgeRepoLinkEntry } from "@/lib/queries/forge";

/**
 * The shared truncation vocabulary: a stored count at the server's page
 * limit means "at least this many", so it renders the "50+" floor — same
 * rule as the chips, the project board, and the feed.
 */
function countText(count: number): string {
  return count >= FORGE_PAGE_LIMIT ? TRUNCATED_COUNT : String(count);
}

/** The trailing path segment — the row's project label; the full path rides
 * the label's tooltip (the settings idiom for paths). */
function projectBaseName(path: string): string {
  const base = path.slice(path.lastIndexOf("/") + 1);
  return base.length > 0 ? base : path;
}

/** The last-sync status chip: ok carries the sync age (exact date in the
 * tooltip), failed carries `lastSyncError` in its tooltip, anything else is
 * the honest never-synced neutral. */
function StatusChip({ repo }: { repo: ForgeRepoLinkEntry }) {
  if (repo.lastSyncStatus === "failed") {
    return (
      <Chip tone="critical" title={repo.lastSyncError ?? "unknown error"}>
        failed
      </Chip>
    );
  }
  if (repo.lastSyncStatus === "ok") {
    return (
      <Chip tone="positive" title={dateTooltip(repo.lastSyncedAt)}>
        synced {relativeTime(repo.lastSyncedAt)}
      </Chip>
    );
  }
  return <Chip tone="neutral">never synced</Chip>;
}

interface RepoRowProps {
  repo: ForgeRepoLinkEntry;
  /** This row's sync is the in-flight one (the spinner). */
  busy: boolean;
  onSync: () => void;
  /** Any sync is in flight — rows wait their turn (the queue is sequential). */
  disabled: boolean;
}

/** One mapped repo — the tracked-directory row idiom: identity lines left,
 * status + cached counts + the row's Sync action right; the meta cluster
 * wraps under the identity once the row gets too narrow to keep both, so
 * the slug never yields to ellipsis first. */
function RepoRow({ repo, busy, onSync, disabled }: RepoRowProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5 border px-2 py-1.5">
      <div className="flex min-w-0 flex-col">
        <span className="truncate font-mono text-xs" title={repo.remoteUrl}>
          {repo.repoRef.slug}
        </span>
        <span
          className="truncate text-xs text-muted-foreground"
          title={repo.projectPath}
        >
          {projectBaseName(repo.projectPath)}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <StatusChip repo={repo} />
        <span
          className="inline-flex items-center gap-0.5 font-mono text-[10px] tabular-nums text-muted-foreground"
          title="open issues"
        >
          <CircleDot aria-hidden className="size-2.5" />
          {countText(repo.openIssues)}
        </span>
        <span
          className="inline-flex items-center gap-0.5 font-mono text-[10px] tabular-nums text-muted-foreground"
          title="open pull requests"
        >
          <GitPullRequest aria-hidden className="size-2.5" />
          {countText(repo.openPulls)}
        </span>
        <Button size="xs" variant="outline" disabled={disabled} onClick={onSync}>
          <RefreshCw aria-hidden className={cn("size-3", busy && "animate-spin")} />
          Sync
        </Button>
      </div>
    </div>
  );
}

export function SettingsForge() {
  const repos = useForgeReposQuery();
  const syncAll = useSyncAllMutation();
  const repoSync = useRepoSyncMutation();

  // A completed fleet run that left repos inside their min-interval: those
  // skips carry NO `reason` (the pre-attempt no-remote / unsupported-host
  // skips do), so this is exactly the "synced within the last 5 min" shape.
  const minIntervalSkipped =
    syncAll.data?.results.some(
      (r) => r.status === "skipped" && r.reason === undefined,
    ) ?? false;

  return (
    <WidgetShell
      title="Forge"
      className="border bg-card"
      action={
        <Button
          size="sm"
          disabled={syncAll.isPending}
          onClick={() => syncAll.mutate({ force: false })}
        >
          <RefreshCw
            aria-hidden
            className={cn("size-3.5", syncAll.isPending && "animate-spin")}
          />
          {syncAll.isPending ? "Syncing all…" : "Sync all"}
        </Button>
      }
    >
      <div className="flex flex-col gap-3 px-3 pb-3 pt-1">
        <p className="text-xs leading-relaxed text-muted-foreground">
          Workspace projects mapped to GitHub repositories — cached open
          counts and last-sync bookkeeping. Sync all sweeps every project and
          your feed, sequentially.
        </p>
        {repos.isError ? (
          <p
            role="alert"
            className="text-xs leading-relaxed text-(--sev-critical)"
          >
            {repos.error?.message ?? "forge cache unavailable"}
          </p>
        ) : repos.isPending ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-3/4" />
          </div>
        ) : repos.data.repos.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No forge repos yet — sync a project from its page or Sync all to
            discover them.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {repos.data.repos.map((repo) => (
              <RepoRow
                key={repo.projectPath}
                repo={repo}
                busy={
                  repoSync.isPending &&
                  repoSync.variables?.path === repo.projectPath
                }
                disabled={repoSync.isPending || syncAll.isPending}
                onSync={() => repoSync.mutate({ path: repo.projectPath })}
              />
            ))}
          </div>
        )}
        {minIntervalSkipped ? (
          <p className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
            Some repos skipped — synced within the last 5 min.
            <Button
              variant="link"
              size="xs"
              className="h-auto px-0 text-xs"
              disabled={syncAll.isPending}
              onClick={() => syncAll.mutate({ force: true })}
            >
              Force sync all
            </Button>
            to override.
          </p>
        ) : null}
      </div>
    </WidgetShell>
  );
}
