import { AlertTriangle, Pin, Timer, FolderCheck } from "lucide-react";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export interface SummaryStats {
  total: number;
  activeThisWeek: number;
  needsAttention: number;
  pinned: number;
}

export function computeStats(
  projects: { updatedAt: string; pinned: boolean; alerts: { severity: string }[] }[],
): SummaryStats {
  const now = Date.now();
  let activeThisWeek = 0;
  let needsAttention = 0;
  let pinned = 0;

  for (const p of projects) {
    if (now - new Date(p.updatedAt).getTime() < WEEK_MS) activeThisWeek++;
    if (p.pinned) pinned++;
    if (p.alerts.some((a) => a.severity === "error" || a.severity === "warn")) {
      needsAttention++;
    }
  }

  return {
    total: projects.length,
    activeThisWeek,
    needsAttention,
    pinned,
  };
}

/**
 * Editorial metric strip — one horizontal panel, not a forest of identical
 * cards. The hero metric (Total) anchors the left; supporting metrics branch
 * to the right, separated by hairline dividers. Each metric is colored by
 * its semantic role so the eye can scan meaning, not just numbers.
 *
 * Deliberately shape-consistent with the rest of the workbench: sharp
 * corners, 1px border, no shadows, no gradients.
 */
export function SummaryCards({ stats }: { stats: SummaryStats }) {
  return (
    <div className="grid grid-cols-2 items-stretch overflow-hidden rounded-none border border-foreground/10 sm:grid-cols-[1.4fr_repeat(3,1fr)]">
      <Metric
        label="Projects"
        value={stats.total}
        icon={<FolderCheck className="size-3.5" />}
        accent="var(--foreground)"
        hero
      />
      <Metric
        label="Active this week"
        value={stats.activeThisWeek}
        icon={<Timer className="size-3.5" />}
        accent="var(--recency-fresh)"
      />
      <Metric
        label="Needs attention"
        value={stats.needsAttention}
        icon={<AlertTriangle className="size-3.5" />}
        accent={stats.needsAttention > 0 ? "var(--sev-warn)" : "var(--eyebrow)"}
      />
      <Metric
        label="Pinned"
        value={stats.pinned}
        icon={<Pin className="size-3.5" />}
        accent="var(--pinned-accent)"
      />
    </div>
  );
}

interface MetricProps {
  label: string;
  value: number;
  icon: React.ReactNode;
  accent: string;
  hero?: boolean;
}

function Metric({ label, value, icon, accent, hero }: MetricProps) {
  return (
    <div
      className={[
        "flex flex-col justify-center gap-1 p-3",
        // Hairline dividers between metrics (not around the outer edges,
        // the container border handles those).
        "border-foreground/10 [&:not(:nth-child(1))]:border-l",
        "max-sm:[&:nth-child(odd)]:border-l-0 max-sm:[&:nth-child(n+3)]:border-t",
        hero ? "bg-muted/30" : "",
      ].join(" ")}
    >
      <div
        className="flex items-center gap-1.5 font-mono text-[0.62rem] font-medium uppercase tracking-[0.2em]"
        style={{ color: accent }}
      >
        {icon}
        <span>{label}</span>
      </div>
      <div
        className="text-3xl font-semibold leading-none tabular-nums"
        style={{ color: hero ? "var(--foreground)" : accent }}
      >
        {value}
      </div>
    </div>
  );
}
