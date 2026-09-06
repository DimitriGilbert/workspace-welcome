/**
 * Meadow attention band, ported from `components/designs/meadow/attention.tsx`
 * into the theme namespace (owner correction: theme widgets carry the
 * prototype's presentation). Triage as a compact horizontal strip, not a
 * panel: one honey-tinted row — severity summary, then one quiet chip per
 * flagged project that opens its page — wrapping to at most a couple of
 * lines. Disappears entirely when there's nothing to see, so the grid keeps
 * the page.
 */
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Bell, Plus } from "lucide-react";

import { SoftNumber } from "./bits";
import { attentionProjects } from "@/lib/scan-metrics";
import { useWorkspace } from "@/widgets/contexts/workspace-context";
import type { RegisteredWidgetProps } from "@/widgets/registry";
import { WidgetShell } from "@/widgets/runtime/widget-shell";

/** Chips shown before collapsing into a "+N more" chip. */
const PREVIEW_CHIPS = 8;

const CHIP_TONE = {
  critical: "var(--sev-critical)",
  warning: "var(--sev-warning)",
} as const;

export function MeadowAttention(_props: RegisteredWidgetProps) {
  const workspace = useWorkspace();
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);

  const projects = attentionProjects(workspace.projects);
  const errorCount = projects.filter((p) =>
    p.alerts.some((a) => a.severity === "critical"),
  ).length;
  const warnCount = projects.length - errorCount;
  const visible = expanded ? projects : projects.slice(0, PREVIEW_CHIPS);
  const hidden = projects.length - visible.length;

  const openProject = (path: string) => {
    void navigate({
      to: "/app/$theme/project/$",
      params: { theme: "meadow", _splat: path.replace(/^\/+/, "") },
    });
  };

  if (projects.length === 0) {
    // The design's band vanishes when there's no news — the region collapses
    // with it (the theme's board CSS sizes this region to its content).
    return (
      <WidgetShell size={{ cols: _props.size.cols, rows: _props.size.rows }} className="h-full w-full">
        <p className="sr-only">All clear — no critical or warning alerts.</p>
      </WidgetShell>
    );
  }

  const band = (
    <section
      aria-label="Projects that need care"
      className="flex min-h-9 w-full min-w-0 flex-wrap content-center items-center gap-x-2.5 gap-y-1.5 rounded-full border px-4 py-2"
      style={{
        borderColor: "color-mix(in oklch, var(--sev-warning) 24%, var(--border))",
        background: "color-mix(in oklch, var(--sev-warning) 5%, var(--card))",
      }}
    >
      <span
        aria-hidden
        className="flex size-5 shrink-0 items-center justify-center rounded-full"
        style={{
          color: "var(--sev-warning)",
          background: "color-mix(in oklch, var(--sev-warning) 14%, transparent)",
        }}
      >
        <Bell className="size-3" />
      </span>
      <span className="flex items-center gap-1.5 text-xs font-semibold tracking-tight text-foreground">
        Needs care
        <span className="font-normal text-muted-foreground">
          {errorCount > 0 ? (
            <>
              <SoftNumber
                value={errorCount}
                className="tabular-nums"
                style={{ color: "var(--sev-critical)" }}
              />{" "}
              {errorCount === 1 ? "error" : "errors"}
            </>
          ) : null}
          {errorCount > 0 && warnCount > 0 ? " · " : null}
          {warnCount > 0 ? (
            <>
              <SoftNumber
                value={warnCount}
                className="tabular-nums"
                style={{ color: "var(--sev-warning)" }}
              />{" "}
              {warnCount === 1 ? "warning" : "warnings"}
            </>
          ) : null}
        </span>
      </span>

      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
        {visible.map((p) => {
          const worst = p.alerts.some((a) => a.severity === "critical")
            ? "critical"
            : "warning";
          const message =
            p.alerts.find((a) => a.severity === worst)?.message ?? "";
          return (
            <button
              key={p.path}
              type="button"
              onClick={() => openProject(p.path)}
              title={`${message} · ${p.name}`}
              className="meadow-chip-lift meadow-focus inline-flex max-w-56 items-center gap-1.5 rounded-full bg-card/80 px-2.5 py-1 text-[11px] font-medium text-foreground"
            >
              <span
                aria-hidden
                className="size-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: CHIP_TONE[worst] }}
              />
              <span className="truncate">{p.name}</span>
            </button>
          );
        })}
        {hidden > 0 ? (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="meadow-focus inline-flex items-center gap-0.5 rounded-full px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <Plus aria-hidden className="size-3" />
            {hidden} more
          </button>
        ) : null}
      </span>
    </section>
  );

  return (
    <WidgetShell
      size={{ cols: _props.size.cols, rows: _props.size.rows }}
      className="h-full w-full"
    >
      {band}
    </WidgetShell>
  );
}
