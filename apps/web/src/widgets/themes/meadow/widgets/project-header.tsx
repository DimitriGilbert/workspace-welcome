/**
 * Meadow project identity (T3-meadow) — port of the design project route's
 * identity header (`routes/designs/meadow/project.$.tsx`): the trail back to
 * the dashboard, the project name over its copy-path mono line, the touched
 * chip, the day-to-day command cluster (editor, terminal, folder, web IDE)
 * and the scan's alert pills in their soft severity tints.
 *
 * Every action rides the project provider — `open`/`copyPath`/`ide.open` —
 * never a local mutation; the IDE install/start progress comes from the
 * provider's shared choreography.
 */
import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  CodeXml,
  Copy,
  ExternalLink,
  FolderOpen,
  Loader2,
  Terminal,
} from "lucide-react";

import { Button } from "@workspace-welcome/ui/components/button";

import { ageMs } from "@/lib/format";
import { useProject } from "@/widgets/contexts/project-context";
import type { RegisteredWidgetProps } from "@/widgets/registry";
import { WidgetShell } from "@/widgets/runtime/widget-shell";

const SEVERITY_COLOR = {
  info: "var(--sev-info)",
  warning: "var(--sev-warning)",
  critical: "var(--sev-critical)",
} as const;

export function MeadowProjectHeader({ size }: RegisteredWidgetProps) {
  const project = useProject();
  const p = project.project;

  const commands = (
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      <Button size="sm" onClick={() => project.open("editor")}>
        <FolderOpen className="size-3.5" /> Open editor
      </Button>
      <Button size="sm" variant="outline" onClick={() => project.open("terminal")}>
        <Terminal className="size-3.5" /> Terminal
      </Button>
      <Button size="sm" variant="outline" onClick={() => project.open("folder")}>
        <ExternalLink className="size-3.5" /> Folder
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={project.ide.installingLabel !== null || project.ide.starting}
        onClick={() => project.ide.open()}
      >
        {project.ide.installingLabel !== null || project.ide.starting ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
        ) : (
          <CodeXml className="size-3.5" aria-hidden />
        )}
        {project.ide.installingLabel ?? (project.ide.starting ? "Starting IDE…" : "Open IDE")}
      </Button>
    </div>
  );

  const back = (
    <Link
      to="/app/$theme"
      params={{ theme: "meadow" }}
      className="meadow-focus inline-flex shrink-0 items-center gap-1.5 rounded-full text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      aria-label="Back to the Meadow dashboard"
    >
      <ArrowLeft aria-hidden className="size-3.5" />
      Meadow
    </Link>
  );

  const alerts =
    p?.alerts.map((a) => (
      <span
        key={a.code}
        title={a.message}
        className="rounded-full px-2.5 py-1 text-[11px] font-medium"
        style={{
          color: SEVERITY_COLOR[a.severity],
          background: `color-mix(in oklch, ${SEVERITY_COLOR[a.severity]} 10%, transparent)`,
        }}
      >
        {a.message}
      </span>
    )) ?? [];

  const identity =
    p === null ? (
      <div className="min-w-0">
        <h1 className="truncate text-xl font-semibold tracking-tight text-foreground">
          Project not found
        </h1>
        <p className="truncate font-mono text-[0.7rem] text-muted-foreground">{project.path}</p>
      </div>
    ) : (
      <div className="min-w-0">
        <h1 className="truncate text-xl font-semibold tracking-tight text-foreground">{p.name}</h1>
        <button
          type="button"
          onClick={() => void project.copyPath()}
          title="Copy path"
          className="meadow-focus flex min-w-0 items-center gap-1 rounded-full text-left font-mono text-[0.7rem] text-muted-foreground transition-colors hover:text-foreground"
        >
          <span className="truncate">{p.path}</span>
          <Copy aria-hidden className="size-3 shrink-0" />
        </button>
      </div>
    );

  const touched =
    p === null ? null : (
      <span
        className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium"
        style={{
          color: "var(--recency-fresh)",
          background: "color-mix(in oklch, var(--recency-fresh) 10%, transparent)",
        }}
        title={p.updatedAt}
      >
        touched {ageMs(p.updatedAt, project.now)} ago
      </span>
    );

  const full = (
    <div className="flex h-full w-full min-w-0 flex-col justify-center gap-1.5 overflow-hidden">
      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
        {back}
        {identity}
        {touched}
        <div className="ml-auto">{commands}</div>
      </div>
      {alerts.length > 0 ? <div className="flex flex-wrap gap-1">{alerts}</div> : null}
    </div>
  );

  return (
    <WidgetShell
      size={{ cols: size.cols, rows: size.rows }}
      className="h-full w-full"
      sizes={{
        "1x1": (
          <div className="flex h-full w-full min-w-0 items-center overflow-hidden px-1">
            <span className="truncate text-sm font-semibold tracking-tight text-foreground">
              {p?.name ?? "Project"}
            </span>
          </div>
        ),
        "2x1": (
          <div className="flex h-full w-full min-w-0 flex-col justify-center gap-1 overflow-hidden px-1">
            {identity}
            {touched}
          </div>
        ),
        "12x1": full,
      }}
    >
      {full}
    </WidgetShell>
  );
}
