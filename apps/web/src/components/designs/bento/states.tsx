import { CircleAlert, FolderPlus, FolderSearch, TriangleAlert } from "lucide-react";

import { Button } from "@workspace-welcome/ui/components/button";

import { BentoTile } from "@/components/designs/bento/bento-tile";

/**
 * Mosaic states: skeleton that mirrors the real tile spans, scan-error tile
 * with retry, empty-workspace tiles, and the no-match tile. Nothing here is
 * decorative — each state is what the user sees when the data says so.
 */

export function LoadingMosaic() {
  return (
    <>
      <div className="bento-grid" aria-hidden>
        <div className="b-skel sp-health b-band-h" />
        <div className="b-skel sp-activity b-band-h" />
        <div className="b-skel sp-stack b-band-h" />
        <div className="b-skel sp-attention b-band-h" />
        <div className="b-skel sp-severity b-band-h" />
      </div>
      <div className="bento-grid" aria-hidden>
        <div className="b-skel sp-pulse b-pulse-h" />
      </div>
      <div className="bento-mosaic" aria-hidden>
        {/* Same ladder the shared algorithm packs: 3×3, 2×3, 2×2, 2×1, 1×1. */}
        <MosaicSkeleton cols={3} rows={3} />
        <MosaicSkeleton cols={3} rows={3} />
        <MosaicSkeleton cols={3} rows={3} />
        <MosaicSkeleton cols={2} rows={3} />
        <MosaicSkeleton cols={2} rows={3} />
        <MosaicSkeleton cols={2} rows={2} />
        <MosaicSkeleton cols={2} rows={2} />
        <MosaicSkeleton cols={2} rows={1} />
        <MosaicSkeleton cols={1} rows={1} />
        <MosaicSkeleton cols={1} rows={1} />
        <MosaicSkeleton cols={1} rows={1} />
        <MosaicSkeleton cols={1} rows={1} />
      </div>
    </>
  );
}

function MosaicSkeleton({ cols, rows }: { cols: number; rows: number }) {
  return (
    <div
      className="b-cell"
      style={
        {
          "--x": 1,
          "--y": 1,
          "--cols": cols,
          "--rows": rows,
        } as React.CSSProperties
      }
    >
      <div className="b-skel h-full" />
    </div>
  );
}

interface ErrorTileProps {
  message: string;
  onRetry: () => void;
}

export function ErrorTile({ message, onRetry }: ErrorTileProps) {
  return (
    <BentoTile
      span="sp-band"
      className="flex flex-col items-center justify-center gap-3 p-14 text-center"
      role="alert"
    >
      <TriangleAlert className="size-6" style={{ color: "var(--sev-error)" }} />
      <div className="flex flex-col gap-1">
        <p className="text-base font-semibold tracking-tight">Scan failed</p>
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Retry scan
      </Button>
    </BentoTile>
  );
}

interface EmptyTileProps {
  noRoots: boolean;
  onAddRoot: () => void;
}

export function EmptyTile({ noRoots, onAddRoot }: EmptyTileProps) {
  const Icon = noRoots ? FolderPlus : FolderSearch;
  return (
    <BentoTile
      span="sp-band"
      className="flex flex-col items-center justify-center gap-4 border-dashed p-14 text-center"
    >
      <span
        aria-hidden
        className="flex size-12 items-center justify-center rounded-2xl border border-border bg-white/[0.04] text-muted-foreground"
      >
        <Icon className="size-5" />
      </span>
      <div className="flex max-w-sm flex-col gap-1">
        <p className="text-base font-semibold tracking-tight">
          {noRoots ? "Add a directory to start" : "No projects found"}
        </p>
        <p className="text-sm text-muted-foreground">
          {noRoots
            ? "Point Workspace Welcome at a folder where your projects live and it will scan for repos."
            : "None of the directories under this root look like projects yet. Try another directory."}
        </p>
      </div>
      {noRoots ? (
        <Button size="sm" onClick={onAddRoot}>
          <FolderPlus className="size-3.5" /> Add a directory
        </Button>
      ) : null}
    </BentoTile>
  );
}

interface NoMatchesTileProps {
  query: string;
  onClear: () => void;
}

export function NoMatchesTile({ query, onClear }: NoMatchesTileProps) {
  return (
    <BentoTile
      span="sp-band"
      className="flex flex-col items-center justify-center gap-2 border-dashed p-12 text-center"
    >
      <p className="text-sm font-semibold tracking-tight">
        Nothing matches &ldquo;{query}&rdquo;
      </p>
      <p className="text-xs text-muted-foreground">
        Try a name, stack, branch or note fragment.
      </p>
      <Button variant="ghost" size="sm" onClick={onClear}>
        Clear filter
      </Button>
    </BentoTile>
  );
}

interface RootErrorsProps {
  errors: { rootId: string; path: string; message: string }[];
}

export function RootErrors({ errors }: RootErrorsProps) {
  if (errors.length === 0) return null;
  return (
    <div
      className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border px-3.5 py-2 text-xs"
      style={{
        borderColor: "color-mix(in oklch, var(--sev-error) 30%, transparent)",
        background: "color-mix(in oklch, var(--sev-error) 7%, transparent)",
      }}
      role="alert"
    >
      <CircleAlert className="size-3.5 shrink-0" style={{ color: "var(--sev-error)" }} />
      {errors.map((e) => (
        <span key={e.rootId} style={{ color: "var(--sev-error)" }}>
          Couldn&rsquo;t read <span className="font-mono">{e.path}</span>
          {e.message ? `: ${e.message}` : null}
        </span>
      ))}
    </div>
  );
}
