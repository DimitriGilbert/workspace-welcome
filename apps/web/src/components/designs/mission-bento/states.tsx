import { FolderPlus, FolderSearch, RotateCcw, TriangleAlert } from "lucide-react";

import { Button } from "@workspace-welcome/ui/components/button";

/**
 * Console states, drawn to match the frames they replace: a skeleton mosaic
 * shaped like the real tier spans, a scan-error readout with a hard retry,
 * two empty cases (no roots vs nothing scanned) and the no-match note.
 */

/** Skeleton placements mirroring the shared algorithm's skyline shapes. */
const SKEL_TILES: readonly { x: number; y: number; cols: number; rows: number }[] = [
  { x: 0, y: 0, cols: 3, rows: 3 },
  { x: 3, y: 0, cols: 2, rows: 3 },
  { x: 5, y: 0, cols: 2, rows: 2 },
  { x: 7, y: 0, cols: 2, rows: 1 },
  { x: 9, y: 0, cols: 2, rows: 1 },
  { x: 11, y: 0, cols: 1, rows: 1 },
  { x: 5, y: 2, cols: 2, rows: 1 },
  { x: 7, y: 1, cols: 1, rows: 1 },
  { x: 8, y: 1, cols: 1, rows: 1 },
  { x: 9, y: 1, cols: 1, rows: 1 },
  { x: 10, y: 1, cols: 1, rows: 1 },
  { x: 11, y: 1, cols: 1, rows: 1 },
];

export function LoadingMosaic() {
  return (
    <div className="mb-mosaic" aria-hidden>
      {SKEL_TILES.map((t, i) => (
        <div
          key={i}
          className="mb-skel"
          style={{
            gridColumn: `${t.x + 1} / span ${t.cols}`,
            gridRow: `${t.y + 1} / span ${t.rows}`,
          }}
        />
      ))}
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
    <div
      role="alert"
      className="mb-panel flex flex-col items-start gap-3 p-6"
      style={{ borderLeft: "2px solid var(--mb-red)" }}
    >
      <div className="flex items-center gap-2.5">
        <TriangleAlert aria-hidden className="size-4 text-[var(--mb-red)]" />
        <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--mb-red)]">
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
    <div className="mb-panel flex flex-col items-center justify-center gap-4 border-dashed px-8 py-16 text-center">
      <span
        aria-hidden
        className="flex size-12 items-center justify-center border border-[var(--mb-line-strong)] text-muted-foreground"
      >
        <Icon className="size-5" strokeWidth={1.75} />
      </span>
      <div className="flex flex-col gap-1.5">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-foreground">
          {noRoots ? "No roots registered" : "Nothing to scan"}
        </h2>
        <p className="mx-auto max-w-sm text-sm text-muted-foreground">
          {noRoots
            ? "Register a directory where your projects live. The console scans it for git work and lights up the mosaic."
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
    <div className="mb-panel flex flex-col items-start gap-2 border-dashed px-6 py-10">
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
        No units match
      </p>
      <p className="text-sm text-muted-foreground">
        Nothing in the fleet matches{" "}
        <span className="font-mono text-foreground">“{query}”</span>.
      </p>
      <Button variant="ghost" size="sm" onClick={onClear} className="mt-1">
        <RotateCcw className="size-3.5" /> Clear filter
      </Button>
    </div>
  );
}

export function RootErrors({
  errors,
}: {
  errors: { rootId: string; path: string; message: string }[];
}) {
  if (errors.length === 0) return null;
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-[4px] px-3 py-2 font-mono text-[10px]"
      style={{
        border: "1px solid color-mix(in oklch, var(--mb-red) 35%, transparent)",
        background: "color-mix(in oklch, var(--mb-red) 8%, transparent)",
        color: "var(--mb-red)",
      }}
    >
      <span aria-hidden className="mb-led mb-led--error" />
      {errors.map((e) => (
        <span key={e.rootId}>
          Unreadable <span className="break-all">{e.path}</span>
          {e.message ? `: ${e.message}` : null}
        </span>
      ))}
    </div>
  );
}
