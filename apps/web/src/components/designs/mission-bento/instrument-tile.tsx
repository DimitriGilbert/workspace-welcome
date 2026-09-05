import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import {
  Copy,
  ExternalLink,
  EyeOff,
  Folder,
  GitFork,
  MoreHorizontal,
  Pin,
  PinOff,
  Terminal as TerminalIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@workspace-welcome/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace-welcome/ui/components/dropdown-menu";
import { cn } from "@workspace-welcome/ui/lib/utils";
import type { Project } from "@workspace-welcome/api/lib/types";

import { useTRPC } from "@/utils/trpc";
import { AlertIcons } from "@/components/git-badges";
import { dateTooltip, relativeTime } from "@/lib/format";
import { stackIcon } from "@/lib/icons";
import type { MosaicPlacement } from "@/lib/mosaic-layout";

import { useWorkspaceReport } from "./report-data";
import type { SnitchEntry } from "./report-data";
import { formatCompact, formatCost } from "./report-utils";
import { CadenceChart } from "./charts";
import { LED_TAG, Led, projectLed } from "./led";
import { PulseLine } from "./pulse-line";

interface InstrumentTileProps {
  project: Project;
  placement: MosaicPlacement;
  now: number;
  onOpen: (path: string) => void;
  /**
   * Snitch entry override — the project page re-renders its own instrument
   * tile fed by the per-project report hook instead of the workspace cache.
   */
  snitch?: SnitchEntry | null;
}

/** Recency ring gauge rendered from the shared log-scaled score (0..1). */
function ScoreRing({ score }: { score: number }) {
  const size = 14;
  const stroke = 2;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <span
      aria-hidden
      title={`Recency ${Math.round(score * 100)}% of set`}
      className="relative inline-block shrink-0"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="oklch(1 0 0 / 0.12)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--mb-accent)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${Math.max(0.5, score) * c} ${c}`}
        />
      </svg>
    </span>
  );
}

/** Mini stat readout: label under a tabular numeral, quiet middot when 0. */
function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number | null | undefined;
  tone?: "accent" | "warn";
}) {
  const empty =
    value === null || value === undefined || value === 0 || value === "0" || value === "";
  return (
    <span className="flex min-w-0 flex-col-reverse gap-0.5">
      <span className="mb-label text-[8px]">{label}</span>
      <span
        className={cn(
          "mb-num truncate text-[15px]",
          tone === "accent" && "text-[var(--mb-accent)]",
          tone === "warn" && "text-[var(--mb-amber)]",
          empty && "text-muted-foreground/40",
        )}
      >
        {empty ? "·" : value}
      </span>
    </span>
  );
}

/**
 * A project as a console instrument, placed by the shared mosaic algorithm
 * (@/lib/mosaic-layout). Content density follows the placement: hero tiles
 * carry a tabbed snitch graph/table (cadence / signals / code) plus commit,
 * contributor, token and subsidized-cost readouts; feature tiles a cadence
 * spark + stats; large a stats row; medium and compact collapse toward the
 * bare LED + name + updated signal. No resting glow — hover feedback only.
 */
export function InstrumentTile({ project, placement, now, onOpen, snitch: snitchOverride }: InstrumentTileProps) {
  const { cols, rows, x, y, score, tier, tierIndex } = placement;
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const report = useWorkspaceReport();

  const invalidateScan = () =>
    queryClient.invalidateQueries({ queryKey: trpc.projects.scan.queryKey() });

  const pinMutation = useMutation(
    trpc.projects.setPinned.mutationOptions({
      onSuccess: () => invalidateScan(),
      onError: (e) => toast.error(e.message),
    }),
  );
  const hideMutation = useMutation(
    trpc.projects.setHidden.mutationOptions({
      onSuccess: () => {
        invalidateScan();
        toast.success("Project hidden", {
          action: {
            label: "Undo",
            onClick: () =>
              hideMutation.mutate({ path: project.path, hidden: false }),
          },
        });
      },
      onError: (e) => toast.error(e.message),
    }),
  );
  const openMutation = useMutation(
    trpc.projects.open.mutationOptions({
      onSuccess: (data) => toast.success(data.message),
      onError: (e) => toast.error(e.message),
    }),
  );
  const touchMutation = useMutation(
    trpc.projects.touchLastOpened.mutationOptions({
      onSuccess: () => invalidateScan(),
    }),
  );

  const openIn = (target: "editor" | "terminal" | "folder") => {
    openMutation.mutate({ path: project.path, target });
    touchMutation.mutate({ path: project.path });
  };

  const copyPath = async () => {
    try {
      await navigator.clipboard.writeText(project.path);
      toast.success("Path copied");
    } catch {
      toast.error("Couldn't copy path");
    }
  };

  const StackIcon = stackIcon(project.stack?.id);
  const led = projectLed(project, now);
  const git = project.git;
  const remote = git.remote;
  const lastCommit = git.lastCommit?.message ?? null;
  const snitch = (snitchOverride !== undefined ? snitchOverride : report.byPath.get(project.path)) ?? null;
  const hotUpdated = now - new Date(project.updatedAt).getTime() < 48 * 60 * 60 * 1000;

  const actions = (
    <div
      className={cn(
        "flex shrink-0 items-center gap-0.5 data-stop-propagation",
        tierIndex === 4 &&
          "opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 max-md:opacity-100",
      )}
    >
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={project.pinned ? "Unpin project" : "Pin project"}
        disabled={pinMutation.isPending}
        onClick={() =>
          pinMutation.mutate({ path: project.path, pinned: !project.pinned })
        }
      >
        {project.pinned ? (
          <PinOff className="size-3.5" />
        ) : (
          <Pin className="size-3.5" />
        )}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon-sm" aria-label="Actions" />}
        >
          <MoreHorizontal className="size-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="mb-scope min-w-48">
          <DropdownMenuItem onClick={() => openIn("editor")}>
            <Folder className="size-3.5" /> Open in editor
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => openIn("terminal")}>
            <TerminalIcon className="size-3.5" /> Open terminal
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => openIn("folder")}>
            <Folder className="size-3.5" /> Reveal in file manager
          </DropdownMenuItem>
          {remote ? (
            <DropdownMenuItem
              onClick={() => window.open(remote.links.web, "_blank")}
            >
              <ExternalLink className="size-3.5" /> Open repo
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={copyPath}>
            <Copy className="size-3.5" /> Copy path
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => hideMutation.mutate({ path: project.path, hidden: true })}
            className="text-destructive"
          >
            <EyeOff className="size-3.5" /> Hide from list
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  const updated = (
    <span
      title={dateTooltip(project.updatedAt)}
      className={cn(
        "mb-num shrink-0 whitespace-nowrap text-[10.5px]",
        hotUpdated ? "text-[var(--mb-accent)]" : "font-normal text-muted-foreground",
      )}
    >
      {relativeTime(project.updatedAt)}
    </span>
  );

  const header = (
    <div className="flex items-center gap-2">
      <Led tone={led.tone} label={led.label} />
      <span
        className={cn(
          "font-mono text-[8.5px] leading-none tracking-[0.14em]",
          led.tone === "error" && "text-[var(--mb-red)]",
          led.tone === "warn" && "text-[var(--mb-amber)]",
          led.tone === "live" && "text-[var(--mb-accent)]",
          (led.tone === "info" || led.tone === "nominal") && "text-muted-foreground",
        )}
      >
        {led.tone === "nominal" ? "" : LED_TAG[led.tone]}
      </span>
      <StackIcon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate text-[0.85rem] font-semibold tracking-tight">
        {project.name}
      </span>
      {tierIndex <= 2 ? <ScoreRing score={score} /> : null}
      {project.pinned ? (
        <Pin aria-hidden className="size-3 shrink-0 text-[var(--pinned-accent)]" />
      ) : null}
      {actions}
    </div>
  );

  const gitLine = (
    <span className="flex min-w-0 items-center gap-2 font-mono text-[10.5px] tabular-nums text-muted-foreground">
      {git.isRepo ? (
        <>
          {git.branch ? (
            <span className="inline-flex min-w-0 max-w-[18ch] items-center gap-1">
              <GitFork aria-hidden className="size-3 shrink-0" />
              <span className="truncate">{git.branch}</span>
            </span>
          ) : null}
          {(git.ahead ?? 0) > 0 ? (
            <span className="shrink-0" style={{ color: "var(--mb-accent)" }}>
              ↑{git.ahead}
            </span>
          ) : null}
          {(git.behind ?? 0) > 0 ? (
            <span className="shrink-0" style={{ color: "var(--mb-amber)" }}>
              ↓{git.behind}
            </span>
          ) : null}
          {(git.dirtyCount ?? 0) > 0 ? (
            <span className="shrink-0">{git.dirtyCount}◇</span>
          ) : null}
        </>
      ) : (
        <span>not a repo</span>
      )}
    </span>
  );

  const footer = (
    <div className="flex items-center justify-between gap-2">
      {gitLine}
      <span className="flex shrink-0 items-center gap-2">
        <AlertIcons alerts={project.alerts} />
        {updated}
      </span>
    </div>
  );

  const dim = tier === "compact";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.18, ease: [0.2, 0.9, 0.3, 1] }}
      style={{ gridColumn: `${x + 1} / span ${cols}`, gridRow: `${y + 1} / span ${rows}` }}
      className={cn(
        "group mb-tile mb-tile--action",
        project.pinned && "mb-tile--pinned",
        dim && "opacity-60 hover:opacity-100",
      )}
      role="button"
      tabIndex={0}
      aria-label={`Open ${project.name}`}
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest("[data-stop-propagation]")) return;
        onOpen(project.path);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(project.path);
        }
      }}
    >
      <div className="flex h-full min-h-0 flex-col gap-2 p-3">
        {header}

        {tierIndex === 0 ? (
          <HeroInstrument project={project} snitch={snitch} reportReady={report.exportData !== null} now={now} />
        ) : tierIndex === 1 ? (
          <FeatureInstrument project={project} snitch={snitch} now={now} />
        ) : tierIndex === 2 ? (
          <LargeInstrument project={project} snitch={snitch} now={now} />
        ) : null}

        {tierIndex === 2 && lastCommit ? (
          <p
            className="truncate font-mono text-[10.5px] text-muted-foreground/85"
            title={lastCommit}
          >
            <span aria-hidden className="mr-1 text-[var(--mb-accent-dim)]">
              ›
            </span>
            {lastCommit}
          </p>
        ) : null}

        {tierIndex >= 1 ? (
          <div className="mt-auto flex flex-col gap-2">
            {tierIndex <= 1 && !snitch ? <PulseLine project={project} now={now} /> : null}
            {footer}
          </div>
        ) : (
          <div className="mt-auto flex flex-col gap-1.5">
            {footer}
          </div>
        )}
      </div>
    </motion.div>
  );
}

/** Stats strip mined from the snitch export entry (commits → cost). */
function SnitchStats({
  snitch,
  className,
}: {
  snitch: SnitchEntry | null;
  className?: string;
}) {
  if (!snitch) return null;
  return (
    <div className={cn("flex items-end gap-x-4", className)}>
      <MiniStat label="Commits" value={snitch.totalCommits} />
      <MiniStat label="Contribs" value={snitch.contributors} />
      {snitch.aiUsage ? (
        <>
          <MiniStat label="Tokens" value={formatCompact(snitch.aiUsage.tokens.total)} />
          <MiniStat
            label="Cost"
            value={formatCost(snitch.aiUsage.cost)}
            tone="accent"
          />
        </>
      ) : null}
      <span className="ml-auto hidden max-w-[16ch] truncate font-sans text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground/80 sm:block">
        {snitch.languages[0]?.language ?? ""}
      </span>
    </div>
  );
}

/**
 * Hero instrument: the full snitch readout — stats strip over a tabbed
 * cadence graph / quality-signal table / language bars, with the scan pulse
 * strip only as the fallback when no report entry covers the project.
 */
function HeroInstrument({
  project,
  snitch,
  reportReady,
  now,
}: {
  project: Project;
  snitch: SnitchEntry | null;
  reportReady: boolean;
  now: number;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col justify-evenly gap-1.5">
      {project.note ? (
        <p className="line-clamp-1 text-xs text-muted-foreground">{project.note}</p>
      ) : null}
      <SnitchStats snitch={snitch} />
      {snitch ? (
        <HeroTabs snitch={snitch} />
      ) : reportReady ? null : (
        <PulseLine project={project} now={now} />
      )}
    </div>
  );
}

type HeroTab = "cadence" | "signals" | "code";

function HeroTabs({
  snitch,
}: {
  snitch: SnitchEntry;
}) {
  const [tab, setTab] = useState<HeroTab>("cadence");
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        role="tablist"
        aria-label="Snitch instrument views"
        data-stop-propagation
        className="mb-1.5 flex shrink-0 items-center gap-1"
      >
        {(
          [
            { id: "cadence", label: "Cadence" },
            { id: "signals", label: `Signals ${snitch.alerts.length}` },
            { id: "code", label: "Code" },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className="mb-chip"
            onClick={(e) => {
              e.stopPropagation();
              setTab(t.id);
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1">
        {tab === "cadence" ? (
          snitch.cadence.length > 0 ? (
            <CadenceChart series={aggregateCadenceOf(snitch)} height={112} />
          ) : (
            <QuietHero note="No commits in the report window." />
          )
        ) : tab === "signals" ? (
          snitch.alerts.length > 0 ? (
            <div role="list" aria-label="Quality signals" className="flex flex-col gap-1">
              {snitch.alerts.slice(0, 3).map((alert) => (
                <div
                  key={alert.id}
                  role="listitem"
                  title={alert.summary}
                  className="flex items-center gap-2 font-mono text-[10px]"
                >
                  <Led
                    tone={alert.severity === "critical" ? "error" : alert.severity === "warning" ? "warn" : "info"}
                  />
                  <span className="min-w-0 flex-1 truncate text-foreground/85">{alert.label}</span>
                  <span className="mb-num shrink-0 text-[10px] text-muted-foreground">
                    {alert.value}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <QuietHero note="No quality signals recorded." />
          )
        ) : snitch.languages.length > 0 ? (
          <div role="img" aria-label="Languages by lines" className="flex flex-col gap-1">
            {snitch.languages.slice(0, 3).map((lang) => {
              const max = Math.max(...snitch.languages.map((l) => l.lines));
              return (
                <div key={lang.language} className="mb-bar-row" title={lang.language}>
                  <span className="w-16 shrink-0 truncate text-[10px] text-foreground/85">
                    {lang.language}
                  </span>
                  <span className="mb-bar-track">
                    <span
                      className="mb-bar-fill"
                      style={{
                        width: `${Math.max(3, (lang.lines / max) * 100)}%`,
                        background: "color-mix(in oklch, var(--mb-blue) 75%, transparent)",
                      }}
                    />
                  </span>
                  <span className="mb-num w-10 shrink-0 text-right text-[9.5px] text-muted-foreground">
                    {formatCompact(lang.lines)}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <QuietHero note="No language data recorded." />
        )}
      </div>
    </div>
  );
}

function aggregateCadenceOf(snitch: SnitchEntry) {
  return [...snitch.cadence]
    .map((point) => ({ period: point.period, commits: point.commits }))
    .sort((a, b) => a.period.localeCompare(b.period));
}

function QuietHero({ note }: { note: string }) {
  return (
    <p className="flex h-full items-center justify-center py-2 text-center font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
      {note}
    </p>
  );
}

/** Feature instrument: stats row + cadence spark (or scan pulse fallback). */
function FeatureInstrument({
  project,
  snitch,
  now,
}: {
  project: Project;
  snitch: SnitchEntry | null;
  now: number;
}) {
  if (snitch && snitch.cadence.length > 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col justify-evenly gap-1.5">
        <SnitchStats snitch={snitch} />
        <div className="min-h-0 flex-1">
          <CadenceChart series={aggregateCadenceOf(snitch)} />
        </div>
      </div>
    );
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col justify-evenly gap-1.5">
      {project.note ? (
        <p className="line-clamp-1 text-xs text-muted-foreground">{project.note}</p>
      ) : null}
      {lastCommitLine(project) ?? <PulseLine project={project} now={now} />}
    </div>
  );
}

/** Large instrument: the stats row (scan fallback: the commit line). */
function LargeInstrument({
  project,
  snitch,
  now,
}: {
  project: Project;
  snitch: SnitchEntry | null;
  now: number;
}) {
  if (snitch) return <SnitchStats snitch={snitch} className="flex-1 items-start" />;
  return lastCommitLine(project) ?? <PulseLine project={project} now={now} />;
}

function lastCommitLine(project: Project) {
  const message = project.git.lastCommit?.message ?? null;
  if (message === null) return null;
  return (
    <p
      className="truncate font-mono text-[10.5px] text-muted-foreground/85"
      title={message}
    >
      <span aria-hidden className="mr-1 text-[var(--mb-accent-dim)]">
        ›
      </span>
      {message}
    </p>
  );
}
