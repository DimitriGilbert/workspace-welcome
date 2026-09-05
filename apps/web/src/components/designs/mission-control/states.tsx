import { CloudOff, FolderPlus, FolderSearch, RotateCcw } from "lucide-react";

import { Button } from "@workspace-welcome/ui/components/button";
import { Skeleton } from "@workspace-welcome/ui/components/skeleton";

/**
 * Console states, drawn to match the frame they replace: skeleton rows shaped
 * like ledger rows, an error readout with a hard retry, and two distinct
 * empty cases (no roots registered vs roots with nothing to scan).
 */
export function LoadingConsole() {
  return (
    <div aria-hidden className="flex flex-col gap-6 pt-2">
      <div className="flex flex-wrap gap-x-10 gap-y-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-2 w-14" />
          </div>
        ))}
      </div>
      <div className="flex flex-col">
        <Skeleton className="mb-2 h-3 w-full max-w-3xl" />
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-[var(--mc-line)] py-2.5">
            <Skeleton className="size-1.5" />
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="hidden h-3 w-24 md:block" />
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="ml-auto hidden h-3.5 w-52 2xl:block" />
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ErrorConsole({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div role="alert" className="mc-panel mt-6 flex flex-col items-start gap-3 border-l-2 border-l-[var(--sev-critical)] p-6">
      <div className="flex items-center gap-2.5">
        <CloudOff aria-hidden className="size-4 text-[var(--sev-critical)]" />
        <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--sev-critical)]">
          Scan failed
        </h2>
      </div>
      <p className="max-w-prose text-sm text-muted-foreground">{message}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RotateCcw className="size-3.5" /> Retry scan
      </Button>
    </div>
  );
}

export function EmptyConsole({
  noRoots,
  onAddRoot,
}: {
  noRoots: boolean;
  onAddRoot: () => void;
}) {
  const Icon = noRoots ? FolderPlus : FolderSearch;
  return (
    <div className="mt-6 flex flex-col items-center justify-center gap-4 border border-dashed border-[var(--mc-line-strong)] px-8 py-16 text-center">
      <span
        aria-hidden
        className="flex size-12 items-center justify-center border border-[var(--mc-line-strong)] text-muted-foreground"
      >
        <Icon className="size-5" strokeWidth={1.75} />
      </span>
      <div className="flex flex-col gap-1.5">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-foreground">
          {noRoots ? "No roots registered" : "Nothing to scan"}
        </h2>
        <p className="mx-auto max-w-sm text-sm text-muted-foreground">
          {noRoots
            ? "Register a directory where your projects live. The console scans it for git work and lights up the fleet."
            : "The registered roots contain no recognizable projects yet. Add another directory, or scaffold something new."}
        </p>
      </div>
      {noRoots ? (
        <Button size="sm" onClick={onAddRoot}>
          <FolderPlus className="size-3.5" /> Add directory
        </Button>
      ) : null}
    </div>
  );
}

export function NoMatch({ query, onClear }: { query: string; onClear: () => void }) {
  return (
    <div className="mt-6 flex flex-col items-start gap-2 border border-dashed border-[var(--mc-line-strong)] px-6 py-10">
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
        No units match
      </p>
      <p className="text-sm text-muted-foreground">
        Nothing in the fleet matches <span className="font-mono text-foreground">“{query}”</span>.
      </p>
      <Button variant="ghost" size="sm" onClick={onClear} className="mt-1">
        <RotateCcw className="size-3.5" /> Clear filter
      </Button>
    </div>
  );
}
