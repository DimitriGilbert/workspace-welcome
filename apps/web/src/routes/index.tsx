import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { FolderPlus, RefreshCw } from "lucide-react";

import { Button } from "@workspace-welcome/ui/components/button";
import { Skeleton } from "@workspace-welcome/ui/components/skeleton";

import { useTRPC } from "@/utils/trpc";
import { ProjectCard } from "@/components/project-card";
import { ProjectSheet } from "@/components/project-sheet";
import {
  SummaryCards,
  computeStats,
} from "@/components/summary-cards";
import { NeedsAttention } from "@/components/needs-attention";
import { EmptyState } from "@/components/empty-state";
import { AddRootSheet } from "@/components/add-root-sheet";
import type { Project } from "@workspace-welcome/api/lib/types";

export const Route = createFileRoute("/")({
  component: HomeComponent,
});

function HomeComponent() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const scan = useQuery(trpc.projects.scan.queryOptions());
  const roots = useQuery(trpc.roots.list.queryOptions());

  const [selected, setSelected] = useState<Project | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [addRootOpen, setAddRootOpen] = useState(false);

  const projects = scan.data?.projects ?? [];
  const stats = useMemo(() => computeStats(projects), [projects]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: trpc.projects.scan.queryKey() });
  };

  const openDetail = (p: Project) => {
    setSelected(p);
    setSheetOpen(true);
  };

  const hasRoots = (roots.data?.length ?? 0) > 0;
  const loading = scan.isLoading;

  return (
    <div className="mx-auto w-full max-w-6xl px-3 py-4">
      {/* Toolbar */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold">Welcome back</h1>
          <p className="text-xs text-muted-foreground">
            {hasRoots
              ? `${projects.length} project${projects.length === 1 ? "" : "s"} across ${roots.data?.length ?? 0} director${(roots.data?.length ?? 0) === 1 ? "y" : "ies"}`
              : "Add a directory to see your projects here."}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={refresh}
            disabled={scan.isFetching}
          >
            <RefreshCw
              className={`size-3.5 ${scan.isFetching ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setAddRootOpen(true)}>
            <FolderPlus className="size-3.5" /> Add directory
          </Button>
        </div>
      </div>

      {loading ? (
        <LoadingGrid />
      ) : projects.length === 0 ? (
        <EmptyState noRoots={!hasRoots} onAddRoot={() => setAddRootOpen(true)} />
      ) : (
        <div className="flex flex-col gap-4">
          <SummaryCards stats={stats} />
          <NeedsAttention projects={projects} onSelect={openDetail} />

          {/* Root errors (missing dirs etc.) */}
          {scan.data?.rootErrors.length ? (
            <div className="flex flex-col gap-1 rounded-none border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
              {scan.data.rootErrors.map((e) => (
                <span key={e.rootId}>
                  Couldn’t read <span className="font-mono">{e.path}</span>:{" "}
                  {e.message}
                </span>
              ))}
            </div>
          ) : null}

          {/* Projects grid */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => (
              <ProjectCard key={p.path} project={p} onOpenDetail={openDetail} />
            ))}
          </div>
        </div>
      )}

      <ProjectSheet
        project={selected}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
      <AddRootSheet open={addRootOpen} onOpenChange={setAddRootOpen} />
    </div>
  );
}

function LoadingGrid() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
    </div>
  );
}
