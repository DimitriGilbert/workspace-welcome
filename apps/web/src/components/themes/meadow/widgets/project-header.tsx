/**
 * Meadow project identity, ported from the design project route's header
 * (`routes/designs/meadow/project.$.tsx`) into the theme namespace (owner
 * correction: theme widgets carry the prototype's presentation): the trail
 * back to the dashboard, the tinted stack-icon chip over the project name
 * and its copy-path mono line, the touched chip, the day-to-day command
 * cluster (editor, terminal, folder, web IDE) and the scan's alert pills.
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
  Settings,
  Terminal,
} from "lucide-react";

import { AlertBadge } from "@/components/git-badges";
import { Button } from "@workspace-welcome/ui/components/button";

import { ageMs } from "@/lib/format";
import { stackIcon } from "@/lib/icons";
import { useProject } from "@/lib/contexts/project-context";
import type { RegisteredWidgetProps } from "@/components/widgets/registry";
import { WidgetShell } from "@/components/widgets/widget-shell";

/** Last path segment of an absolute path — for the trail label. Ported from
 * the design's derive helper; one line of presentation formatting. */
function pathBasename(path: string): string {
  return path.split("/").filter(Boolean).at(-1) ?? path;
}

export function MeadowProjectHeader({ size }: RegisteredWidgetProps) {
  const project = useProject();
  const p = project.project;
  const StackIcon = stackIcon(p?.stack?.id);

  const back = (
    <Link
      to="/"
      search={{ preset: "meadow" }}
      className="meadow-focus group inline-flex shrink-0 items-center gap-1.5 rounded-full text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      aria-label="Back to the Meadow dashboard"
    >
      <ArrowLeft
        aria-hidden
        className="size-3.5 transition-transform group-hover:-translate-x-0.5"
      />
      Meadow
    </Link>
  );

  const identity =
    p === null ? (
      <div className="min-w-0">
        <h1 className="truncate text-xl font-semibold tracking-tight text-foreground">
          Project not found
        </h1>
        <p className="truncate font-mono text-[0.7rem] text-muted-foreground">
          {project.path}
        </p>
      </div>
    ) : (
      <div className="min-w-0">
        <h1 className="truncate text-xl font-semibold tracking-tight text-foreground">
          {p.name}
        </h1>
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
          background:
            "color-mix(in oklch, var(--recency-fresh) 10%, transparent)",
        }}
        title={p.updatedAt}
      >
        touched {ageMs(p.updatedAt, project.now)} ago
      </span>
    );

  const commandButtons = (
    <>
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
    </>
  );

  const commands = (
    <div className="ml-auto flex shrink-0 flex-wrap items-center gap-2">
      {commandButtons}
    </div>
  );

  const full = (
    <div className="flex h-full w-full min-w-0 flex-col gap-3 overflow-hidden">
      {/* Trail back to the meadow + workspace settings. */}
      <div className="flex shrink-0 items-center gap-3">
        {back}
        <span className="text-[11px] text-muted-foreground" title={project.path}>
          {pathBasename(project.path)}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          render={<Link to="/settings" />}
          aria-label="Settings"
          title="Settings"
          className="ml-auto"
        >
          <Settings aria-hidden className="size-3.5" />
        </Button>
      </div>

      {/* Identity + the day-to-day commands. */}
      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-3">
        <span
          aria-hidden
          className="flex size-10 shrink-0 items-center justify-center rounded-full"
          style={{
            color: "var(--recency-fresh)",
            background:
              "color-mix(in oklch, var(--recency-fresh) 9%, transparent)",
          }}
        >
          <StackIcon className="size-5" />
        </span>
        {identity}
        {touched}
        {commands}
      </div>

      {/* Alerts — soft severity pills, only when there is news. */}
      {p !== null && p.alerts.length > 0 ? (
        <div className="flex shrink-0 flex-wrap gap-1">
          {p.alerts.map((a) => (
            <AlertBadge key={a.code} severity={a.severity} message={a.message} />
          ))}
        </div>
      ) : null}
    </div>
  );

  /** The right-rail identity card (the preset's 4x3 placement): trail over
   * identity over touched/alerts, with the command cluster as a 2x2 grid
   * pinned to the card's foot — a real design for the rail footprint, not
   * the wrapping full-width row squeezed narrow. */
  const railCard = (
    <div className="flex h-full w-full min-w-0 flex-col gap-3 overflow-hidden">
      <div className="flex shrink-0 items-center gap-3">
        {back}
        <span
          className="min-w-0 truncate text-[11px] text-muted-foreground"
          title={project.path}
        >
          {pathBasename(project.path)}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          render={<Link to="/settings" />}
          aria-label="Settings"
          title="Settings"
          className="ml-auto"
        >
          <Settings aria-hidden className="size-3.5" />
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col justify-center gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden
            className="flex size-10 shrink-0 items-center justify-center rounded-full"
            style={{
              color: "var(--recency-fresh)",
              background:
                "color-mix(in oklch, var(--recency-fresh) 9%, transparent)",
            }}
          >
            <StackIcon className="size-5" />
          </span>
          {identity}
          {/* Touched + alert chips ride the identity line (subtitle ban:
              no standalone metadata row under the title). */}
          <span className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-1.5">
            {touched}
            {p !== null
              ? p.alerts.map((a) => (
                  <AlertBadge
                    key={a.code}
                    severity={a.severity}
                    message={a.message}
                  />
                ))
              : null}
          </span>
        </div>
      </div>

      <div className="grid shrink-0 grid-cols-2 gap-2">{commandButtons}</div>
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
        // The rail rung (authored at the preset's exact 4x3 footprint — the
        // area-ranked ladder puts 4x3 above 12x1, so wide short placements
        // keep the wrapping row): identity card for the 4-column rail.
        "4x3": railCard,
        // Wide placements render the ONE wrapping identity block (trail,
        // name, touched, commands, alerts) — the design's single
        // presentation at every width.
        "2x1": full,
      }}
    >
      {full}
    </WidgetShell>
  );
}
