import { CircleAlert, OctagonAlert, TriangleAlert } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { BentoTile } from "@/components/designs/bento/bento-tile";
import { dirtyLeaders } from "@/components/designs/bento/bento-metrics";
import type { SeverityCounts } from "@/components/designs/bento/bento-metrics";
import type { Project } from "@workspace-welcome/api/lib/types";

interface SeverityTileProps {
  projects: Project[];
  counts: SeverityCounts;
}

/**
 * Signal mix: the workspace's alert severity split up top, then every repo
 * carrying uncommitted work as a full-width bar row. Rows stretch to fill
 * the tile's height (flex-1), so a 4-column span reads dense at every
 * size — no stranded half-empty block.
 */
export function SeverityTile({ projects, counts }: SeverityTileProps) {
  const total = counts.critical + counts.warning + counts.info;
  const leaders = dirtyLeaders(projects, 6);
  const maxDirty = leaders[0]?.dirty ?? 1;

  return (
    <BentoTile span="sp-severity" className="b-band-h flex flex-col gap-3 p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="b-label">Signal mix</h2>
        <span className="font-mono text-[0.68rem] text-muted-foreground">
          {total} {total === 1 ? "alert" : "alerts"} · {leaders.length} dirty
        </span>
      </div>

      {total === 0 ? (
        <div
          className="flex items-center gap-2 rounded-lg border border-border bg-white/[0.02] px-3 py-2 text-xs text-muted-foreground"
          style={{ borderColor: "color-mix(in oklch, var(--state-positive) 30%, transparent)" }}
        >
          <span
            className="size-2 shrink-0 rounded-full"
            style={{ background: "var(--state-positive)" }}
          />
          No alerts in the current view — every scan signal is clean.
        </div>
      ) : (
        <>
          <div
            className="b-segbar"
            role="img"
            aria-label={`${counts.critical} errors, ${counts.warning} warnings, ${counts.info} info alerts`}
          >
            {counts.critical > 0 ? (
              <span
                style={{
                  flexGrow: counts.critical,
                  background: "var(--sev-critical)",
                }}
              />
            ) : null}
            {counts.warning > 0 ? (
              <span
                style={{
                  flexGrow: counts.warning,
                  background: "var(--sev-warning)",
                }}
              />
            ) : null}
            {counts.info > 0 ? (
              <span
                style={{
                  flexGrow: counts.info,
                  background: "var(--sev-info)",
                }}
              />
            ) : null}
          </div>

          <dl className="grid grid-cols-3 gap-2">
            <SeverityStat icon={OctagonAlert} label="Errors" count={counts.critical} color="var(--sev-critical)" />
            <SeverityStat icon={TriangleAlert} label="Warnings" count={counts.warning} color="var(--sev-warning)" />
            <SeverityStat icon={CircleAlert} label="Info" count={counts.info} color="var(--sev-info)" />
          </dl>
        </>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-2 border-t border-border pt-3">
        <h3 className="b-label">Uncommitted work</h3>
        {leaders.length === 0 ? (
          <p className="flex flex-1 items-center text-xs text-muted-foreground">
            Nothing dirty. Working trees are clean.
          </p>
        ) : (
          <ul className="flex min-h-0 flex-1 flex-col justify-evenly gap-1.5">
            {leaders.map((l) => (
              <li key={l.path} className="flex items-center gap-2.5">
                <span className="w-24 shrink-0 truncate text-xs sm:w-32" title={l.name}>
                  {l.name}
                </span>
                <span className="b-dirtybar min-w-0 flex-1">
                  <span style={{ width: `${Math.max((l.dirty / maxDirty) * 100, 8)}%` }} />
                </span>
                <span className="b-num w-7 shrink-0 text-right text-sm">{l.dirty}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </BentoTile>
  );
}

function SeverityStat({
  icon: Icon,
  label,
  count,
  color,
}: {
  icon: LucideIcon;
  label: string;
  count: number;
  color: string;
}) {
  return (
    <div
      className="flex min-w-0 flex-col gap-1 rounded-lg border border-border bg-white/[0.02] px-2.5 py-2"
      title={`${count} ${label.toLowerCase()}`}
    >
      <dt className="flex items-center gap-1.5 text-[0.62rem] text-muted-foreground">
        <Icon className="size-3 shrink-0" style={{ color }} />
        {label}
      </dt>
      <dd className="b-num text-lg" style={{ color: count > 0 ? color : "var(--muted-foreground)" }}>
        {count}
      </dd>
    </div>
  );
}
