const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

import { StatusStrip } from "@/components/status-strip";

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
 * Workspace vitals on the home masthead: the shared StatusStrip fed from
 * computeStats. Amber on the needs-attention count is the only color — it
 * means something.
 */
export function SummaryLine({
  stats,
  rootCount,
}: {
  stats: SummaryStats;
  rootCount?: number;
}) {
  const projectNoun = stats.total === 1 ? "project" : "projects";
  return (
    <StatusStrip
      items={[
        {
          label:
            rootCount === undefined
              ? projectNoun
              : `${projectNoun} in ${rootCount} ${rootCount === 1 ? "directory" : "directories"}`,
          value: stats.total,
        },
        { label: "active this week", value: stats.activeThisWeek },
        {
          label: stats.needsAttention === 1 ? "needs attention" : "need attention",
          value: stats.needsAttention,
          accent: stats.needsAttention > 0 ? "warn" : undefined,
        },
        { label: "pinned", value: stats.pinned },
      ]}
    />
  );
}
