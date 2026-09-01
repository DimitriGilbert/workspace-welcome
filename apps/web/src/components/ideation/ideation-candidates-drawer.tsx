import { useQuery } from "@tanstack/react-query";
import { ArrowDownToLine, Layers } from "lucide-react";

import { Badge } from "@workspace-welcome/ui/components/badge";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace-welcome/ui/components/empty";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@workspace-welcome/ui/components/sheet";
import { Skeleton } from "@workspace-welcome/ui/components/skeleton";

import { IDEATION_STEPS } from "@workspace-welcome/api/lib/ideation/shared";

import { useTRPC } from "@/utils/trpc";

import type { IdeationCandidate } from "@workspace-welcome/api/lib/ideation/shared";

/**
 * The candidates drawer (PRD §3): a Sheet listing, per pipeline step, every
 * model that ran — score and one-line rationale when the reconciler graded
 * it, an error state when it failed, and a download link to the persisted
 * candidate file under .ideadump/. The chat only ever shows the merged
 * output; this is the traceability view over the backlog.
 */

export interface IdeationCandidatesDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Absolute project path — confines the candidates listing server-side. */
  project: string;
  sessionId: string | null;
}

function candidateDownloadUrl(project: string, file: string): string {
  const params = new URLSearchParams({ project, path: file });
  return `/api/files/download?${params.toString()}`;
}

function CandidateRow({ candidate, project }: {
  candidate: IdeationCandidate;
  project: string;
}) {
  return (
    <div className="flex flex-col gap-1 border border-foreground/10 p-2">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate font-mono text-[0.7rem]">
          {candidate.model}
        </span>
        {typeof candidate.score === "number" ? (
          <Badge variant="outline" className="h-4 px-1 font-mono text-[0.65rem]">
            {candidate.score}/10
          </Badge>
        ) : null}
        <a
          href={candidateDownloadUrl(project, candidate.file)}
          download
          aria-label={`Download ${candidate.model} candidate`}
          title={candidate.file}
          className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowDownToLine className="size-3" />
        </a>
      </div>
      {candidate.rationale !== undefined ? (
        <p className="text-[0.7rem] leading-relaxed text-muted-foreground">
          {candidate.rationale}
        </p>
      ) : null}
      {candidate.error !== undefined ? (
        <p className="text-[0.7rem] leading-relaxed" style={{ color: "var(--sev-error)" }}>
          {candidate.error}
        </p>
      ) : null}
      <span className="truncate font-mono text-[0.6rem] text-muted-foreground/70">
        {candidate.file}
      </span>
    </div>
  );
}

export function IdeationCandidatesDrawer({
  open,
  onOpenChange,
  project,
  sessionId,
}: IdeationCandidatesDrawerProps) {
  const trpc = useTRPC();
  const candidatesQuery = useQuery(
    trpc.ideation.candidates.list.queryOptions(
      { path: project, sessionId: sessionId ?? "" },
      { enabled: open && sessionId !== null },
    ),
  );

  const candidates = candidatesQuery.data ?? [];
  const stepGroups = IDEATION_STEPS.map((step) => ({
    step,
    rows: candidates.filter((candidate) => candidate.step === step),
  })).filter((group) => group.rows.length > 0);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>candidates</SheetTitle>
          <SheetDescription>
            Every model that ran, per step. The chat shows the merged output
            only — this is the backlog on disk.
          </SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          {candidatesQuery.isLoading ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
            </div>
          ) : candidatesQuery.isError ? (
            <p className="text-xs leading-relaxed" style={{ color: "var(--sev-error)" }}>
              {candidatesQuery.error.message}
            </p>
          ) : stepGroups.length === 0 ? (
            <Empty className="flex-1">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Layers />
                </EmptyMedia>
                <EmptyTitle>no candidates yet</EmptyTitle>
                <EmptyDescription>
                  Nothing has run for this session — candidates appear here as
                  each step&apos;s models respond.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            stepGroups.map((group) => (
              <div key={group.step} className="flex flex-col gap-1.5">
                <span className="font-mono text-[0.65rem] text-muted-foreground">
                  {group.step}
                </span>
                <div className="flex flex-col gap-1.5">
                  {group.rows.map((candidate) => (
                    <CandidateRow
                      key={candidate.file}
                      candidate={candidate}
                      project={project}
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
