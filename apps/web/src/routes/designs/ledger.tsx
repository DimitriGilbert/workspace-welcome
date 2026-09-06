import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";

import { Button } from "@workspace-welcome/ui/components/button";
import { Skeleton } from "@workspace-welcome/ui/components/skeleton";
import type { Project } from "@workspace-welcome/api/lib/types";
import type { ScaffoldJobSnapshot } from "@workspace-welcome/api/lib/scaffold";

import { useTRPC } from "@/utils/trpc";
import { AddRootSheet } from "@/components/add-root-sheet";
import { CloneScriptSheet } from "@/components/clone-script-sheet";
import { CreateProjectSheet } from "@/components/create-project-sheet";
import { ReportSheet } from "@/components/report-sheet";
import { LedgerAppendix } from "@/components/designs/ledger/ledger-appendix";
import { LedgerAttention } from "@/components/designs/ledger/ledger-attention";
import type { AttentionEntry } from "@/components/designs/ledger/ledger-attention";
import { LedgerFigures } from "@/components/designs/ledger/ledger-figures";
import { LedgerIndex } from "@/components/designs/ledger/ledger-index";
import type { LedgerGroup } from "@/components/designs/ledger/ledger-index";
import { LedgerMasthead } from "@/components/designs/ledger/ledger-masthead";
import "@/components/designs/ledger/ledger.css";
import { relativeTime } from "@/lib/format";
import { freshness, tierFromFreshness } from "@/lib/recency";
import { matchProject } from "@/lib/search";

type ScaffoldResult = NonNullable<ScaffoldJobSnapshot["result"]>;

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const WEEKS_SHOWN = 12;

export const Route = createFileRoute("/designs/ledger")({
  component: LedgerPage,
});

function LedgerPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const scan = useQuery(trpc.projects.scan.queryOptions());
  const roots = useQuery(trpc.roots.list.queryOptions());

  const [addRootOpen, setAddRootOpen] = useState(false);
  const [cloneOpen, setCloneOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  // Keyboard-first search, same contract as the dashboard: "/" focuses the
  // field, Escape clears and blurs it. Keystrokes inside other editable
  // elements are ignored so sheets and forms keep their typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      const typing =
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        (el instanceof HTMLElement && el.isContentEditable);

      if (e.key === "/" && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      } else if (e.key === "Escape" && el === searchRef.current) {
        setQuery("");
        searchRef.current?.blur();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const projects = scan.data?.projects ?? [];
  const rootsList = roots.data ?? [];
  const rootErrors = scan.data?.rootErrors ?? [];

  // The filter narrows one set that every section reads, so the masthead,
  // figures, attention panel and index all agree on what is being shown.
  const visible = useMemo(
    () => projects.filter((p) => matchProject(p, query)),
    [projects, query],
  );
  const filtering = query.trim().length > 0;

  // The ledger rhythm: pinned entries first, then "in rotation" (fresh and
  // recent tiers), then the archive (stale and cold). Folio numbers run
  // continuously across the whole index.
  const groups = useMemo<LedgerGroup[]>(() => {
    const pinned: Project[] = [];
    const rotating: Project[] = [];
    const archive: Project[] = [];
    for (const p of visible) {
      if (p.pinned) {
        pinned.push(p);
        continue;
      }
      const tier = tierFromFreshness(freshness(p.updatedAt, p.lastOpenedAt));
      if (tier === "fresh" || tier === "recent") rotating.push(p);
      else archive.push(p);
    }
    const byUpdatedDesc = (a: Project, b: Project) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    pinned.sort(byUpdatedDesc);
    rotating.sort(byUpdatedDesc);
    archive.sort(byUpdatedDesc);

    let n = 0;
    const tag = (list: Project[]) =>
      list.map((project) => {
        n += 1;
        return { project, folio: String(n).padStart(2, "0") };
      });

    return [
      { key: "pinned", title: "Pinned", entries: tag(pinned), dim: false },
      { key: "rotating", title: "In rotation", entries: tag(rotating), dim: false },
      { key: "archive", title: "Archive", entries: tag(archive), dim: true },
    ].filter((g) => g.entries.length > 0);
  }, [visible]);

  const figures = useMemo(
    () => ({
      entries: visible.length,
      pinned: visible.filter((p) => p.pinned).length,
      dirty: visible.reduce((sum, p) => sum + (p.git.dirtyCount ?? 0), 0),
      unpushed: visible.reduce((sum, p) => sum + Math.max(0, p.git.ahead ?? 0), 0),
    }),
    [visible],
  );

  // Weekly activity comb: rolling 7-day buckets over updatedAt, oldest first.
  const weekly = useMemo(() => {
    const weeks = Array.from({ length: WEEKS_SHOWN }, () => 0);
    const now = Date.now();
    for (const p of visible) {
      const age = Math.max(0, now - new Date(p.updatedAt).getTime());
      const bucket = Math.floor(age / WEEK_MS);
      if (bucket < WEEKS_SHOWN) weeks[WEEKS_SHOWN - 1 - bucket] += 1;
    }
    return weeks;
  }, [visible]);

  const stacks = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of visible) {
      const label = p.stack?.label ?? "Undetected";
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    const sorted = [...counts.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    if (sorted.length <= 6) return sorted;
    const top = sorted.slice(0, 5);
    const rest = sorted.slice(5).reduce((sum, s) => sum + s.count, 0);
    return [...top, { label: "Other", count: rest }];
  }, [visible]);

  const severity = useMemo(
    () => ({
      critical: visible.filter((p) => p.alerts.some((a) => a.severity === "critical")).length,
      warning: visible.filter((p) => p.alerts.some((a) => a.severity === "warning")).length,
      info: visible.filter((p) => p.alerts.some((a) => a.severity === "info")).length,
    }),
    [visible],
  );

  // Errors and warns surface here; info-level notes live on the index rows.
  const attention = useMemo<AttentionEntry[]>(() => {
    const entries: AttentionEntry[] = [];
    for (const project of visible) {
      for (const alert of project.alerts) {
        if (alert.severity === "critical" || alert.severity === "warning") {
          entries.push({
            project,
            code: alert.code,
            severity: alert.severity,
            message: alert.message,
          });
        }
      }
    }
    const severityRank = (s: AttentionEntry["severity"]) => (s === "critical" ? 0 : 1);
    entries.sort((a, b) => {
      const bySeverity = severityRank(a.severity) - severityRank(b.severity);
      if (bySeverity !== 0) return bySeverity;
      return (
        new Date(b.project.updatedAt).getTime() -
        new Date(a.project.updatedAt).getTime()
      );
    });
    return entries;
  }, [visible]);

  const rootCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of projects) {
      counts.set(p.rootId, (counts.get(p.rootId) ?? 0) + 1);
    }
    return counts;
  }, [projects]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: trpc.projects.scan.queryKey() });
  };

  // The sheet closes itself on success; this side owns the toast and the
  // scan refresh that makes the new project appear in the index.
  const handleCreateSuccess = (result: ScaffoldResult) => {
    const segments = result.projectDirectory.split("/").filter(Boolean);
    toast.success(
      `Created ${segments.at(-1) ?? result.projectDirectory} in ${formatElapsed(result.elapsedTimeMs)}`,
      { description: result.reproducibleCommand },
    );
    refresh();
  };

  const hasRoots = rootsList.length > 0;
  const loading = scan.isPending;

  const edition =
    scan.data && scan.dataUpdatedAt > 0 && roots.isSuccess
      ? {
          entries: projects.length,
          roots: rootsList.length,
          scanned: relativeTime(new Date(scan.dataUpdatedAt).toISOString()),
        }
      : null;

  return (
    <div className="ledger-scope">
      <LedgerMasthead
        query={query}
        onQueryChange={setQuery}
        searchRef={searchRef}
        onRefresh={refresh}
        refreshing={scan.isFetching}
        edition={edition}
        attentionCount={scan.data ? attention.length : null}
      />

      <main className="ledger-shell flex flex-col gap-10 pb-12">
        {loading ? (
          <LoadingLedger />
        ) : scan.isError ? (
          <ScanErrorPanel message={scan.error.message} onRetry={refresh} />
        ) : projects.length === 0 ? (
          <EmptyLedger hasRoots={hasRoots} onAddRoot={() => setAddRootOpen(true)} />
        ) : visible.length === 0 ? (
          <NoMatchPanel query={query} onClear={() => setQuery("")} />
        ) : (
          <>
            <LedgerAttention entries={attention} />

            <div className="ledger-spread">
              <div className="ledger-area-figures">
                <LedgerFigures
                  figures={figures}
                  weekly={weekly}
                  stacks={stacks}
                  severity={severity}
                />
              </div>

              <div className="ledger-area-index">
                <LedgerIndex
                  groups={groups}
                  total={projects.length}
                  shown={visible.length}
                  filtering={filtering}
                />
              </div>

              <div className="ledger-area-appendix">
                <LedgerAppendix
                  roots={rootsList}
                  rootCounts={rootCounts}
                  rootErrors={rootErrors}
                  canClone={visible.length > 0}
                  canReport={hasRoots}
                  onAddRoot={() => setAddRootOpen(true)}
                  onCreate={() => setCreateOpen(true)}
                  onClone={() => setCloneOpen(true)}
                  onReport={() => setReportOpen(true)}
                />
              </div>
            </div>
          </>
        )}
      </main>

      <footer className="ledger-shell pb-10">
        <div className="ledger-hairline-t flex flex-wrap items-center justify-between gap-2 pt-4">
          <p className="ledger-serif text-sm italic text-muted-foreground">
            Workspace Welcome, a local workspace dashboard
          </p>
          <Link
            to="/designs"
            className="font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            Design concepts
          </Link>
        </div>
      </footer>

      <AddRootSheet open={addRootOpen} onOpenChange={setAddRootOpen} />
      <ReportSheet open={reportOpen} onOpenChange={setReportOpen} />
      <CloneScriptSheet
        // The picker respects the active filter, so you can narrow the index
        // first and then select-all within the filter.
        projects={visible}
        open={cloneOpen}
        onOpenChange={setCloneOpen}
      />
      <CreateProjectSheet
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={handleCreateSuccess}
        onError={(message) => toast.error(message)}
        onRequestAddRoot={() => {
          setCreateOpen(false);
          setAddRootOpen(true);
        }}
      />
    </div>
  );
}

/** Skeleton of the final spread: figures rail, index rows, appendix band. */
function LoadingLedger() {
  const rowWidths = ["22%", "34%", "28%", "31%", "25%", "30%", "27%", "33%", "24%", "29%"];
  return (
    <div className="ledger-spread">
      <div className="ledger-area-figures flex flex-col gap-4">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-16 w-28" />
        <Skeleton className="h-10 w-20" />
        <Skeleton className="h-10 w-24" />
        <Skeleton className="h-10 w-16" />
        <Skeleton className="h-14 w-full" />
      </div>
      <div className="ledger-area-index flex flex-col">
        {rowWidths.map((width, i) => (
          <div key={i} className="ledger-skel-row">
            <Skeleton className="h-3" style={{ width }} />
          </div>
        ))}
      </div>
      <div className="ledger-area-appendix flex flex-col gap-4">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-5/6" />
      </div>
    </div>
  );
}

function ScanErrorPanel({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col items-start gap-4 py-14">
      <h2 className="ledger-serif text-3xl font-medium tracking-tight">
        The scan could not be completed.
      </h2>
      <p className="max-w-xl font-mono text-xs break-words text-muted-foreground">
        {message}
      </p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Retry the scan
      </Button>
    </div>
  );
}

function EmptyLedger({
  hasRoots,
  onAddRoot,
}: {
  hasRoots: boolean;
  onAddRoot: () => void;
}) {
  return (
    <div className="flex flex-col items-start gap-5 py-14">
      <p className="ledger-serif tabular-nums leading-none font-medium" style={{ fontSize: "7rem" }}>
        0
      </p>
      <h2 className="ledger-serif text-3xl font-medium tracking-tight">
        {hasRoots ? "No projects were found." : "The ledger is empty."}
      </h2>
      <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
        {hasRoots
          ? "None of the registered roots contain a recognizable project yet. Add another directory, or create a project to open the index."
          : "Add a directory where your projects live; the scanner will walk it and open the index."}
      </p>
      <Button onClick={onAddRoot}>Add a directory</Button>
    </div>
  );
}

function NoMatchPanel({
  query,
  onClear,
}: {
  query: string;
  onClear: () => void;
}) {
  return (
    <div className="flex flex-col items-start gap-3 py-14">
      <h2 className="ledger-serif text-2xl font-medium tracking-tight">
        No entries match.
      </h2>
      <p className="font-mono text-xs text-muted-foreground">
        Nothing in the index matches &ldquo;{query}&rdquo;.
      </p>
      <Button variant="outline" size="sm" onClick={onClear}>
        Clear the filter
      </Button>
    </div>
  );
}

// Same shape as the create-project sheet's progress clock, so the toast's
// elapsed time matches what the user just watched tick up.
function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes > 0
    ? `${minutes}m ${String(rest).padStart(2, "0")}s`
    : `${rest}s`;
}
