/**
 * Meadow attention band (T2-meadow) — port of
 * `components/designs/meadow/attention.tsx` onto the AttentionList part.
 *
 * Triage as a compact horizontal strip, not a panel: one honey-tinted row —
 * severity summary, then the part's `"strip"` density (one chip per flagged
 * project, tinted by its worst severity) — wrapping to a couple of lines.
 * Chips open the project's page under this theme's project route.
 */
import { useNavigate } from "@tanstack/react-router";
import { Bell } from "lucide-react";

import { AnimatedNumber } from "@workspace-welcome/ui/components/animated-number";

import { attentionProjects, severityCounts } from "@/lib/scan-metrics";
import { useWorkspace } from "@/widgets/contexts/workspace-context";
import { AttentionList } from "@/widgets/parts";
import type { RegisteredWidgetProps } from "@/widgets/registry";
import { WidgetShell } from "@/widgets/runtime/widget-shell";

/** Chips shown before collapsing into the part's "+N more" footer. */
const PREVIEW_CHIPS = 8;

export function MeadowAttention(_props: RegisteredWidgetProps) {
  const workspace = useWorkspace();
  const navigate = useNavigate();

  const flagged = attentionProjects(workspace.projects);
  const counts = severityCounts(flagged);
  const warnCount = flagged.length - counts.critical;

  const openProject = (path: string) => {
    void navigate({
      to: "/app/$theme/project/$",
      params: { theme: "meadow", _splat: path.replace(/^\/+/, "") },
    });
  };

  const summary = (
    <span className="flex shrink-0 items-center gap-1.5 text-xs font-semibold tracking-tight text-foreground">
      Needs care
      <span className="font-normal text-muted-foreground">
        {counts.critical > 0 ? (
          <>
            <AnimatedNumber
              value={counts.critical}
              className="tabular-nums"
              style={{ color: "var(--sev-critical)" }}
            />{" "}
            {counts.critical === 1 ? "error" : "errors"}
          </>
        ) : null}
        {counts.critical > 0 && warnCount > 0 ? " · " : null}
        {warnCount > 0 ? (
          <>
            <AnimatedNumber
              value={warnCount}
              className="tabular-nums"
              style={{ color: "var(--sev-warning)" }}
            />{" "}
            {warnCount === 1 ? "warning" : "warnings"}
          </>
        ) : null}
      </span>
    </span>
  );

  const list = (
    <AttentionList
      density="strip"
      max={PREVIEW_CHIPS}
      onOpen={(project) => openProject(project.path)}
      className="min-w-0 flex-1"
    />
  );

  return (
    <WidgetShell
      size={{ cols: _props.size.cols, rows: _props.size.rows }}
      className="h-full w-full"
      sizes={{
        "1x1": (
          <div className="flex h-full w-full min-w-0 items-center gap-2 overflow-hidden px-1">
            <Bell aria-hidden className="size-3.5 shrink-0" style={{ color: "var(--sev-warning)" }} />
            <span className="truncate text-xs font-medium">
              {flagged.length} need care
            </span>
          </div>
        ),
        "12x1": (
          <section
            aria-label="Projects that need care"
            className="flex h-full w-full min-w-0 flex-wrap content-center items-center gap-x-2.5 gap-y-1.5 overflow-hidden rounded-full border px-4"
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
            {summary}
            {list}
          </section>
        ),
      }}
    >
      <section
        aria-label="Projects that need care"
        className="flex h-full w-full min-w-0 flex-col justify-center gap-1.5 overflow-hidden rounded-2xl border px-4 py-2"
        style={{
          borderColor: "color-mix(in oklch, var(--sev-warning) 24%, var(--border))",
          background: "color-mix(in oklch, var(--sev-warning) 5%, var(--card))",
        }}
      >
        {summary}
        {list}
      </section>
    </WidgetShell>
  );
}
