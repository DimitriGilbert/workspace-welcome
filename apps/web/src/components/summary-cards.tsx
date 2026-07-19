import { AlertTriangle, Pin, Timer, FolderCheck } from "lucide-react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace-welcome/ui/components/card";

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

export function SummaryCards({ stats }: { stats: SummaryStats }) {
  const cards = [
    {
      label: "Total projects",
      value: stats.total,
      icon: FolderCheck,
      tone: "text-foreground",
    },
    {
      label: "Active this week",
      value: stats.activeThisWeek,
      icon: Timer,
      tone: "text-emerald-500",
    },
    {
      label: "Needs attention",
      value: stats.needsAttention,
      icon: AlertTriangle,
      tone: stats.needsAttention > 0 ? "text-amber-500" : "text-muted-foreground",
    },
    {
      label: "Pinned",
      value: stats.pinned,
      icon: Pin,
      tone: "text-primary",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {cards.map((c) => {
        const Icon = c.icon;
        return (
          <Card key={c.label} size="sm">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{c.label}</span>
                <Icon className={`size-3.5 ${c.tone}`} />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <span className={`text-2xl font-semibold tabular-nums ${c.tone}`}>
                {c.value}
              </span>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
