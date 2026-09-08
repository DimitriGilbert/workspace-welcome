import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { useState } from "react";
import { Copy, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@workspace-welcome/ui/components/button";
import { Chip } from "@workspace-welcome/ui/components/chip";
import { Skeleton } from "@workspace-welcome/ui/components/skeleton";
import { cn } from "@workspace-welcome/ui/lib/utils";

import { relativeTime } from "@/lib/format";
import { useReport } from "@/lib/contexts/report-context";
import type { ReportStatus } from "@/lib/contexts/report-context";

/**
 * ReportGate — the ONE gate between a widget and the snitch-report state
 * machine (master plan §3.5). Consumes `useReport()`; renders the status so
 * widgets never re-implement it. `children` is a PLAIN node rendered for
 * stale AND fresh — never a render-prop — and is RETAINED under `running`
 * (the provider never wipes the cached export, so widgets keep rendering
 * last-known content under the progress strip).
 *
 * ## Behavior matrix (authoritative; `mode` picks the density)
 *
 * | status    | gate (default)                       | banner                       | line                    |
 * |-----------|--------------------------------------|------------------------------|-------------------------|
 * | no-scope  | null                                 | null                         | null                    |
 * | loading   | skeleton block (null when `quiet`)   | skeleton row (null `quiet`)  | "Report loading…" line  |
 * | missing   | CTA block: Generate button + copyable CLI + commandError (slots override) | same | one-line "No report" + Generate |
 * | running   | progress strip OVER retained children | slim strip OVER children     | "Report running…" line  |
 * | stale     | stale chip + regenerate(force) + children | same, slim strip         | "Stale · <age>" + Regenerate |
 * | fresh     | children                             | children                     | "Fresh · <age>" line    |
 *
 * `entry` re-judges staleness per project inside a scan-scope export (the
 * provider's `isEntryStale` tile rule); without it the scope verdict stands.
 * `quiet` renders null for loading/no-scope only (1x1 placements) — missing
 * still shows its CTA so a report can be generated from anywhere.
 * The root stamps `data-report-status="<resolved status>"` (harness target).
 * `line` is the one-line status strip — mission-bento's `SnitchStatusStrip`
 * successor; it renders the strip INSTEAD of children (header placement).
 */

export type ReportGateMode = "gate" | "banner" | "line";

export interface ReportGateProps extends ComponentPropsWithoutRef<"div"> {
  /** Rendered for stale AND fresh (and under running, behind the strip). */
  children?: ReactNode;
  /** Project path inside a scan-scope export; default = the scope itself. */
  entry?: string;
  /** Presentation density; default "gate" (full blocks). */
  mode?: ReportGateMode;
  /** loading/no-scope render null instead of a skeleton. */
  quiet?: boolean;
  /** Replaces the missing-state CTA (any mode). */
  missing?: ReactNode;
  /** Replaces the running-state strip (any mode). */
  running?: ReactNode;
  /** Replaces the loading-state skeleton (any mode). */
  loading?: ReactNode;
}

export function ReportGate({
  children,
  entry,
  mode = "gate",
  quiet = false,
  missing,
  running,
  loading,
  ...rest
}: ReportGateProps) {
  const report = useReport();

  // Per-entry staleness (bento's tile rule) when an entry is addressed;
  // otherwise the provider's scope verdict.
  const status: ReportStatus = (() => {
    if (report.status === "stale" && entry !== undefined) {
      return report.isEntryStale(entry) ? "stale" : "fresh";
    }
    return report.status;
  })();

  if (status === "no-scope") return null;

  if (status === "loading") {
    if (loading !== undefined) return <GateRoot status={status} {...rest}>{loading}</GateRoot>;
    if (quiet) return null;
    if (mode === "line") {
      return (
        <GateRoot status={status} {...rest}>
          <span className="font-mono text-[10px] tracking-[0.1em] text-muted-foreground uppercase">
            Report loading…
          </span>
        </GateRoot>
      );
    }
    return (
      <GateRoot status={status} {...rest}>
        <Skeleton className="h-full w-full" />
      </GateRoot>
    );
  }

  if (status === "missing") {
    if (missing !== undefined) return <GateRoot status={status} {...rest}>{missing}</GateRoot>;
    if (mode === "line") {
      return (
        <GateRoot status={status} {...rest}>
          <span className="flex items-center gap-2">
            <span className="font-mono text-[10px] tracking-[0.1em] text-muted-foreground uppercase">
              No report
            </span>
            {!report.commandFailed && <GenerateButton />}
          </span>
        </GateRoot>
      );
    }
    return (
      <GateRoot status={status} {...rest}>
        <div className="flex flex-col items-start gap-2 rounded-none border border-dashed border-border p-3">
          <span className="text-xs text-muted-foreground">
            No report for this scope yet — generate one to see commit cadence,
            alerts, and languages.
          </span>
          <div className="flex items-center gap-2">
            {!report.commandFailed && <GenerateButton />}
            <CopyCommand />
          </div>
        </div>
      </GateRoot>
    );
  }

  if (status === "running") {
    if (running !== undefined) return <GateRoot status={status} {...rest}>{running}</GateRoot>;
    const strip = (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="size-3 animate-spin" aria-hidden />
        {mode === "line"
          ? "Report running…"
          : "Generating report — showing the last one until it settles"}
      </span>
    );
    if (mode === "line") {
      return <GateRoot status={status} {...rest}>{strip}</GateRoot>;
    }
    return (
      <GateRoot status={status} {...rest}>
        {strip}
        {children}
      </GateRoot>
    );
  }

  // stale | fresh — content modes.
  const stale = status === "stale";
  const age = report.generatedAt === null ? "" : relativeTime(report.generatedAt);

  if (mode === "line") {
    return (
      <GateRoot status={status} {...rest}>
        <span className="flex items-center gap-2">
          <span
            className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.1em] uppercase"
            title={
              report.generatedAt
                ? `Generated ${new Date(report.generatedAt).toLocaleString()}`
                : undefined
            }
            style={{ color: stale ? "var(--sev-warning)" : "var(--state-positive)" }}
          >
            {stale ? "Stale" : "Fresh"}
            {age ? ` · ${age}` : ""}
          </span>
          {stale ? <RegenerateButton /> : null}
        </span>
      </GateRoot>
    );
  }

  return (
    <GateRoot status={status} {...rest}>
      {stale ? (
        mode === "banner" ? (
          <span className="flex items-center gap-2">
            <Chip tone="warning" title={`Generated ${age}`}>
              Stale
            </Chip>
            <span className="text-xs text-muted-foreground">
              Project activity is newer than this report.
            </span>
            <RegenerateButton />
          </span>
        ) : (
          // The gate strip is per-widget chrome a page renders up to four
          // times — one slim line: the chip carries the why in its tooltip.
          <span
            className="flex shrink-0 items-center gap-2 rounded-none border border-dashed px-2 py-1"
            style={{ borderColor: "color-mix(in oklch, var(--sev-warning) 40%, transparent)" }}
          >
            <Chip
              tone="warning"
              title={`Project activity is newer than this report. Generated ${age}`}
            >
              Stale
            </Chip>
            <RegenerateButton />
          </span>
        )
      ) : null}
      {children}
    </GateRoot>
  );
}

/** The single root every non-null branch renders through — stamps the
 * harness-visible `data-report-status` (plus `definePart`'s data-part via
 * the rest props it clones in). */
function GateRoot({
  status,
  className,
  children,
  ...rest
}: { status: ReportStatus; children: ReactNode } & ComponentPropsWithoutRef<"div">) {
  return (
    <div
      data-report-status={status}
      className={cn(
        status === "fresh"
          ? "flex min-h-0 min-w-0 flex-col"
          : "flex min-h-0 min-w-0 flex-col gap-2",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

/** The missing-state primary action: missing → generate() (no force — a
 * cached report may exist server-side), disabled while a run is in flight. */
function GenerateButton() {
  const report = useReport();
  return (
    <Button
      size="xs"
      onClick={() => report.generate()}
      disabled={report.generating}
    >
      <RefreshCw
        className={report.generating ? "size-3 animate-spin" : "size-3"}
        aria-hidden
      />
      Generate report
    </Button>
  );
}

/** The stale-state primary action: stale → generate({ force: true }) — the
 * cached report must be voided for the regeneration to be worth anything. */
function RegenerateButton() {
  const report = useReport();
  return (
    <Button
      size="xs"
      variant="outline"
      onClick={() => report.generate({ force: true })}
      disabled={report.generating}
    >
      <RefreshCw
        className={report.generating ? "size-3 animate-spin" : "size-3"}
        aria-hidden
      />
      Regenerate
    </Button>
  );
}

/** The copyable CLI command that would produce this report, with its
 * resolve error surfaced inline when the command itself failed. */
function CopyCommand() {
  const report = useReport();
  const [copied, setCopied] = useState(false);
  if (report.commandError !== null) {
    return (
      <span
        role="alert"
        className="text-xs"
        style={{ color: "var(--sev-critical)" }}
      >
        {report.commandError}
      </span>
    );
  }
  if (report.command === null) return null;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(report.command ?? "");
      setCopied(true);
      toast.success("Command copied");
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy to clipboard");
    }
  };
  return (
    <span className="flex min-w-0 items-center gap-1">
      <code className="min-w-0 truncate rounded-none bg-muted/40 px-1.5 py-0.5 font-mono text-[0.7rem] text-muted-foreground">
        {report.command}
      </code>
      <Button
        size="icon-xs"
        variant="ghost"
        onClick={() => void copy()}
        aria-label="Copy report command"
      >
        <Copy className="size-3" aria-hidden />
      </Button>
      <span aria-live="polite" className="sr-only">
        {copied ? "Command copied" : ""}
      </span>
    </span>
  );
}
