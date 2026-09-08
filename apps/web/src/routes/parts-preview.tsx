import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";

import type { Project } from "@workspace-welcome/api/lib/types";
import {
  AnimatedNumber,
  MIN_CONTENT as ANIMATED_NUMBER_MIN,
} from "@workspace-welcome/ui/components/animated-number";
import { Chart, MIN_CONTENT as CHART_MIN } from "@workspace-welcome/ui/components/chart";
import { Chip, MIN_CONTENT as CHIP_MIN } from "@workspace-welcome/ui/components/chip";
import {
  createDataTableColumnHelper,
  DataTable,
  MIN_CONTENT as DATA_TABLE_MIN,
} from "@workspace-welcome/ui/components/data-table";
import {
  Donut,
  MIN_CONTENT as DONUT_MIN,
  MIN_CONTENT_BARE as DONUT_BARE_MIN,
} from "@workspace-welcome/ui/components/donut";
import { Gauge, MIN_CONTENT as GAUGE_MIN } from "@workspace-welcome/ui/components/gauge";
import { GitGlyphs, MIN_CONTENT as GIT_GLYPHS_MIN } from "@workspace-welcome/ui/components/git-glyphs";
import {
  HBars,
  minContent as hBarsMinContent,
} from "@workspace-welcome/ui/components/h-bars";
import { Heatmap, MIN_CONTENT as HEATMAP_MIN } from "@workspace-welcome/ui/components/heatmap";
import { KvList, MIN_CONTENT as KV_LIST_MIN } from "@workspace-welcome/ui/components/kv-list";
import { LED_TAG, Led, MIN_CONTENT as LED_MIN } from "@workspace-welcome/ui/components/led";
import {
  MIN_CONTENT as PULSE_STRIP_MIN,
  PulseStrip,
} from "@workspace-welcome/ui/components/pulse-strip";
import {
  MIN_CONTENT as SCORE_RING_MIN,
  ScoreChip,
  ScoreRing,
} from "@workspace-welcome/ui/components/score-ring";
import { MIN_CONTENT as SEG_BAR_MIN, SegBar } from "@workspace-welcome/ui/components/seg-bar";
import {
  MIN_CONTENT as SEVERITY_DOTS_MIN,
  SeverityDots,
} from "@workspace-welcome/ui/components/severity-dots";
import { MIN_CONTENT as STAT_MIN, Stat } from "@workspace-welcome/ui/components/stat";
import { ThemeScope } from "@workspace-welcome/ui/components/theme-scope";
import {
  MIN_CONTENT as VIEW_CAROUSEL_MIN,
  ViewCarousel,
} from "@workspace-welcome/ui/components/view-carousel";
import { MIN_CONTENT as VITALS_BAND_MIN, VitalsBand } from "@workspace-welcome/ui/components/vitals-band";
import { MIN_CONTENT as WIDGET_TABS_MIN, WidgetTabs } from "@workspace-welcome/ui/components/widget-tabs";

import {
  ArtifactsListPart,
  AttentionListPart,
  BranchSwitcherPart,
  CommitsListPart,
  FilesListPart,
  FormAddRootPart,
  FormCloneScriptPart,
  FormCreateProjectPart,
  FormReportRunPart,
  GitActionsToolbarPart,
  NoteEditorPart,
  ProjectLedPart,
  ProjectPulsePart,
  ReportGatePart,
} from "@/widgets/parts";
import { ProjectProvider } from "@/lib/contexts/project-context";
import { ReportProvider } from "@/lib/contexts/report-context";
import { SettingsProvider } from "@/lib/contexts/settings-context";
import { useWorkspace, WorkspaceProvider } from "@/lib/contexts/workspace-context";
import { dayKey } from "@/lib/scan-metrics";
import { parseSize, SIZE_LADDER } from "@/lib/widget/size-class";
import type { SizeClass } from "@/lib/widget/size-class";
import { themePresets } from "@/components/themes";
import type { ThemePreset } from "@/components/themes";

/**
 * Parts preview — the dev-only P5 route (master plan §3.2, §5 P5).
 *
 * Renders EVERY part — the packages/ui primitives and the `widgets/parts`
 * barrel — at the ladder boxes (1x1/2x1/2x2/2x3/3x3 at 96 px cells, 12 px
 * gap), inside one ThemeScope per registered theme, plus the provider-mount
 * validation panel (the D5–D7 providers mounted with their `data-providers`
 * stamps visible). It is the `run.mjs --suite parts-preview` target: the
 * finalized `part-min` probe measures each part box against its declared
 * `data-part-min-w/h` floor here, per scope.
 *
 * Dev-only status: nothing production-facing links here and the route dies
 * with the legacy cleanup — the same convention as `/app/__lab`, whose
 * rationale applies verbatim: the harness suites run against the deployed
 * service, which serves the production build, so the content stays servable
 * and `import.meta.env.DEV` gates the dev ribbon (build provenance) instead
 * of blanking the page the suite has to measure.
 *
 * Cell mechanics: a part renders at a rung only when the rung box satisfies
 * its floor; smaller rungs render the documented below-min fallback caption
 * (mirrored in `docs/research/parts-reference.md`), and every floored part
 * additionally renders once in an exact `MIN_CONTENT`-sized "floor" box —
 * the tightest case the probe checks, and the only render site for parts
 * whose floor exceeds every rung (data-table, 420 px). The floor stamps
 * (`data-part`, `data-part-min-w/h`) ride the preview CELL — the box the
 * fill-box part renders into — so the probe measures exactly the rendered
 * part box without depending on per-component attribute forwarding.
 */

const CELL_PX = 96;
const GAP_PX = 12;

export const Route = createFileRoute("/parts-preview")({
  component: PartsPreviewPage,
});

function PartsPreviewPage() {
  return (
    <div data-parts-preview-root className="mx-auto max-w-5xl pb-16">
      <header className="px-6 pt-6">
        <h1 className="font-mono text-sm uppercase tracking-widest text-muted-foreground">
          Parts preview — every part × every ladder rung × every theme
        </h1>
        <p className="mt-2 max-w-3xl text-xs leading-relaxed text-muted-foreground">
          Ladder boxes at {CELL_PX} px cells / {GAP_PX} px gap. Floored parts render from their
          first fitting rung plus one exact MIN_CONTENT floor box; smaller rungs show the documented
          below-min fallback. Harness:{" "}
          <code className="font-mono text-[11px]">node scripts/widget-check/run.mjs --suite parts-preview</code>
        </p>
        {import.meta.env.DEV && (
          <p
            data-dev-ribbon
            className="mt-2 inline-block border border-dashed px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground"
          >
            dev build
          </p>
        )}
      </header>
      <SettingsProvider>
        <WorkspaceProvider>
          <ProjectScopeGate>
            <PreviewContent />
          </ProjectScopeGate>
        </WorkspaceProvider>
      </SettingsProvider>
    </div>
  );
}

/**
 * The §3.4 project provider stack: Settings > Workspace > Project{nests
 * Workspace} > Report{repo, first root}. The path comes from the mounted
 * workspace's roots (read-only — the preview never invokes mutations);
 * until a root resolves the gate renders an honest pending state and the
 * page carries no `data-ready`, so the harness settles AFTER the scopes exist.
 */
function ProjectScopeGate({ children }: { children: ReactNode }) {
  const roots = useWorkspace().roots;
  const path = roots.data?.[0]?.path;
  if (path === undefined || path.length === 0) {
    return (
      <div
        data-provider-state="pending"
        role="status"
        className="mx-6 mt-6 border border-dashed border-border px-4 py-3 text-xs text-muted-foreground"
      >
        Resolving the project scope — waiting for the first tracked root… (the preview mounts the
        project stack so project-scoped parts render under real providers)
      </div>
    );
  }
  return (
    <ProjectProvider path={path}>
      <ReportProvider kind="repo" path={path}>
        {children}
      </ReportProvider>
    </ProjectProvider>
  );
}

const EXPECTED_PROVIDERS = ["settings", "workspace", "project", "report"] as const;

/**
 * Provider-mount validation panel (P5 + D5–D7): reads the mounted
 * `data-providers` stamps out of the live DOM and shows each expected
 * context key's mount state. Honest: a missing provider renders as MISSING,
 * never as success.
 */
function ProvidersPanel() {
  const panelRef = useRef<HTMLElement>(null);
  const [mounted, setMounted] = useState<readonly string[] | null>(null);

  useEffect(() => {
    const root = panelRef.current?.closest("[data-parts-preview-root]");
    if (root === null || root === undefined) return;
    const keys = new Set<string>();
    for (const el of root.querySelectorAll("[data-providers]")) {
      const attr = el.getAttribute("data-providers");
      if (attr === null) continue;
      for (const key of attr.split(/\s+/)) {
        if (key.length > 0) keys.add(key);
      }
    }
    setMounted([...keys].sort());
  }, []);

  const missing =
    mounted === null ? [] : EXPECTED_PROVIDERS.filter((key) => !mounted.includes(key));

  return (
    <section
      ref={panelRef}
      data-providers-panel
      className="mx-6 mt-6 border border-border p-4"
    >
      <h2 className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
        Provider-mount validation (D5–D7)
      </h2>
      {mounted === null ? (
        <p role="status" className="mt-2 text-xs text-muted-foreground">
          Reading mounted data-providers stamps…
        </p>
      ) : (
        <>
          <div className="mt-2 flex flex-wrap gap-2">
            {EXPECTED_PROVIDERS.map((key) => (
              <span
                key={key}
                data-provider-key={key}
                data-mounted={mounted.includes(key) ? "true" : "false"}
                className={
                  mounted.includes(key)
                    ? "border px-2 py-0.5 font-mono text-[11px] text-foreground"
                    : "border border-dashed px-2 py-0.5 font-mono text-[11px] text-muted-foreground"
                }
              >
                {key} {mounted.includes(key) ? "✓" : "✗"}
              </span>
            ))}
          </div>
          <p role="status" className="mt-2 text-xs text-muted-foreground">
            {missing.length === 0
              ? `All ${EXPECTED_PROVIDERS.length} providers mounted — data-providers stamps visible in the DOM.`
              : `MISSING providers: ${missing.join(", ")} — no data-providers stamp found.`}
          </p>
        </>
      )}
    </section>
  );
}

function PreviewContent() {
  const contentRef = useRef<HTMLDivElement>(null);

  // Post-hydration readiness stamp — the harness settles on [data-ready],
  // which must appear only once the provider stack resolved and every theme
  // scope exists (the gate renders pending, without this stamp, before that).
  useEffect(() => {
    contentRef.current?.setAttribute("data-ready", "");
  }, []);

  const presets = [...themePresets.values()].sort((a, b) => a.id.localeCompare(b.id));

  return (
    <div ref={contentRef} data-parts-preview-content className="px-6">
      <ProvidersPanel />
      {presets.map((preset, index) => (
        <ThemeSection key={preset.id} preset={preset} first={index === 0} />
      ))}
    </div>
  );
}

function ThemeSection({ preset, first }: { preset: ThemePreset; first: boolean }) {
  return (
    <ThemeScope
      theme={preset.id}
      data-preview-scope={preset.id}
      className={first ? "mt-8" : "mt-12 border-t border-border pt-8"}
    >
      <h2 className="font-mono text-xs uppercase tracking-widest">
        {preset.label} — <span className="text-muted-foreground">data-ww-theme="{preset.id}"</span>
      </h2>

      <LadderSection title="ui parts — packages/ui (presentational, tokens-only)" parts={UI_PARTS} />
      <LadderSection title="app parts — widgets/parts (context-consuming)" parts={APP_PARTS} />
      <DialogsSection defaultOpen={first ? "form-add-root" : null} />

      {/*
        Fixed-box sentinel: position:fixed + inset:0 inside the scope. The
        scope must NOT be a containing block (ThemeScope CSS contract), so
        this element must always span the viewport exactly — the finalized
        part-min probe asserts it (and every open dialog overlay) per scope.
      */}
      <div
        data-fixed-box-sentinel
        aria-hidden
        style={{ position: "fixed", inset: 0, pointerEvents: "none" }}
      />
    </ThemeScope>
  );
}

function LadderSection({ title, parts }: { title: string; parts: readonly PreviewPart[] }) {
  return (
    <section data-preview-section className="mt-5">
      <h3 className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">{title}</h3>
      <div className="mt-3 flex flex-col gap-5">
        {parts.map((part) => (
          <PartRow key={part.id} part={part} />
        ))}
      </div>
    </section>
  );
}

interface PreviewPart {
  /** Part id — stamped on fitting cells as `data-part` (probe identity). */
  id: string;
  /** px floor (the ui `MIN_CONTENT` export — never restated); null = any rung. */
  min: { readonly w: number; readonly h: number } | null;
  /** Preview-authored smallest rung for heavy leaf lists; below it, captions. */
  from?: (typeof SIZE_LADDER)[number];
  /** The part with sample props, sized to the target box. */
  render: (box: { readonly w: number; readonly h: number }) => ReactNode;
  /** The documented below-min fallback (mirrored in docs/research/parts-reference.md). */
  fallback: string;
}

function boxFor(rung: SizeClass): { w: number; h: number } {
  const parsed = parseSize(rung);
  const cols = parsed?.cols ?? 1;
  const rows = parsed?.rows ?? 1;
  return {
    w: cols * CELL_PX + (cols - 1) * GAP_PX,
    h: rows * CELL_PX + (rows - 1) * GAP_PX,
  };
}

/** Index of the first ladder rung whose box satisfies `min` — SIZE_LADDER.length
 * when no rung fits (the part renders only in its exact floor box). */
function firstFittingRung(min: { readonly w: number; readonly h: number } | null): number {
  if (min === null) return 0;
  const index = SIZE_LADDER.findIndex((rung) => {
    const box = boxFor(rung);
    return box.w >= min.w && box.h >= min.h;
  });
  return index === -1 ? SIZE_LADDER.length : index;
}

function PartRow({ part }: { part: PreviewPart }) {
  const minRung = firstFittingRung(part.min);
  const fromIndex = part.from === undefined ? 0 : Math.max(0, SIZE_LADDER.indexOf(part.from));
  const start = Math.max(minRung, fromIndex);
  return (
    <div data-preview-part-row={part.id} className="flex flex-col gap-1.5">
      <p className="text-[11px] text-muted-foreground">
        <span className="font-mono">{part.id}</span>
        {part.min !== null && (
          <span className="font-mono">
            {" "}
            — MIN_CONTENT {part.min.w}×{part.min.h}
          </span>
        )}
      </p>
      <div className="flex flex-wrap items-end gap-3">
        {SIZE_LADDER.map((rung, index) => {
          const box = boxFor(rung);
          if (index < start) {
            return <BelowMinCell key={rung} part={part} rung={rung} box={box} />;
          }
          return <PartCell key={rung} part={part} rung={rung} box={box} />;
        })}
        {part.min !== null && <FloorCell part={part} />}
      </div>
    </div>
  );
}

const cellStyle = (box: { readonly w: number; readonly h: number }): CSSProperties => ({
  width: box.w,
  height: box.h,
});

function PartCell({
  part,
  rung,
  box,
}: {
  part: PreviewPart;
  rung: SizeClass;
  box: { readonly w: number; readonly h: number };
}) {
  return (
    <div
      data-part={part.id}
      data-preview-rung={rung}
      style={cellStyle(box)}
      className="overflow-hidden border border-border/70 p-1"
      {...(part.min !== null
        ? { "data-part-min-w": part.min.w, "data-part-min-h": part.min.h }
        : {})}
    >
      {part.render(box)}
    </div>
  );
}

/** The exact MIN_CONTENT box — the tightest floor case the probe checks, and
 * the only render site for parts whose floor exceeds every ladder rung. */
function FloorCell({ part }: { part: PreviewPart }) {
  const min = part.min;
  if (min === null) return null;
  return (
    <div
      data-part={part.id}
      data-preview-rung="floor"
      data-part-min-w={min.w}
      data-part-min-h={min.h}
      style={{ ...cellStyle(min), boxSizing: "content-box" }}
      className="overflow-hidden border border-border p-1"
    >
      {part.render(min)}
    </div>
  );
}

function BelowMinCell({
  part,
  rung,
  box,
}: {
  part: PreviewPart;
  rung: SizeClass;
  box: { readonly w: number; readonly h: number };
}) {
  return (
    <div
      data-part-below-min={part.id}
      data-preview-rung={rung}
      style={cellStyle(box)}
      className="flex flex-col justify-center gap-1 border border-dashed border-border/60 p-2"
    >
      <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {rung} — below min
      </span>
      <span className="text-[11px] leading-snug text-muted-foreground">{part.fallback}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sample data — deterministic, fixed timestamps (no wall-clock reads). */
/* ------------------------------------------------------------------ */

const SAMPLE_POINTS = Array.from({ length: 12 }, (_, i) => ({
  label: `W${i + 1}`,
  value: 4 + ((i * 7) % 11),
}));

const SAMPLE_SLICES = [
  { label: "Node", value: 5 },
  { label: "Rust", value: 3 },
  { label: "Python", value: 2 },
];

const SAMPLE_HBAR_ROWS = [
  { label: "alerts", value: 0.8, display: "8" },
  { label: "dirty", value: 0.5, display: "5" },
  { label: "dormant", value: 0.3, display: "3" },
];

const SAMPLE_SEGMENTS = [
  { value: 6, label: "fresh" },
  { value: 3, label: "stale" },
  { value: 1, label: "missing" },
];

const SAMPLE_PULSE_CELLS = Array.from({ length: 24 }, (_, i) => ({
  intensity: (i % 5) / 4,
  tick: i === 23,
}));

const SAMPLE_VITALS = [
  { label: "Projects", value: 12 },
  { label: "Critical", value: 1, tone: "critical" as const },
  { label: "Warning", value: 3, tone: "warning" as const },
  { label: "Fresh", value: 8, tone: "positive" as const },
];

const SAMPLE_KV_ROWS = [
  { label: "Branch", value: "main", mono: true },
  { label: "Dirty", value: "2 files" },
  { label: "Last commit", value: "2 h ago" },
];

const SAMPLE_DOTS = [
  { id: "no-remote", severity: "critical" as const, message: "No remote configured" },
  { id: "dirty", severity: "warning" as const, message: "2 uncommitted files" },
  { id: "dormant", severity: "info" as const, message: "Dormant 9 days" },
];

const SAMPLE_CAROUSEL_CARDS = [
  {
    id: "readout",
    label: "Readout",
    node: <Stat label="Score" value="82" size="sm" />,
  },
  {
    id: "table",
    label: "Table",
    node: <KvList rows={SAMPLE_KV_ROWS} density="compact" />,
  },
  {
    id: "layout",
    label: "Layout",
    node: <SegBar segments={SAMPLE_SEGMENTS} ariaLabel="Preview segments" />,
  },
];

const SAMPLE_TABLE_ROWS = [
  { name: "workspace-welcome", score: 82, tone: "positive" },
  { name: "side-project", score: 41, tone: "warning" },
  { name: "dotfiles", score: 7, tone: "neutral" },
];
type SampleRow = (typeof SAMPLE_TABLE_ROWS)[number];

const sampleTableHelper = createDataTableColumnHelper<SampleRow>();

const SAMPLE_TABLE_COLUMNS = [
  sampleTableHelper.accessor("name", {
    header: "Project",
    cell: (info) => (
      <span className="block truncate" title={info.getValue()}>
        {info.getValue()}
      </span>
    ),
    size: 50,
  }),
  sampleTableHelper.accessor("score", { header: "Score", size: 25 }),
  sampleTableHelper.accessor("tone", { header: "Tone", size: 25 }),
];

const SAMPLE_PROJECT: Project = {
  path: "/tmp/ww-parts-preview/sample-project",
  name: "sample-project",
  rootId: "preview",
  createdAt: "2026-01-15T09:30:00.000Z",
  updatedAt: "2026-09-05T08:12:00.000Z",
  stack: { id: "node", label: "Node.js", manifest: "package.json" },
  git: {
    isRepo: true,
    branch: "main",
    remote: null,
    ahead: 1,
    behind: 0,
    dirtyCount: 2,
    lastCommit: {
      message: "wip: parts preview fixture",
      author: "preview",
      date: "2026-09-04T18:00:00.000Z",
    },
  },
  alerts: [
    { severity: "warning", code: "dirty", message: "2 uncommitted files" },
    { severity: "info", code: "dormant", message: "Dormant 9 days" },
  ],
  pinned: false,
  note: "",
  lastOpenedAt: null,
  hidden: false,
};

function TabsPreview() {
  const [active, setActive] = useState("overview");
  return (
    <WidgetTabs
      tabs={[
        { id: "overview", label: "Overview" },
        { id: "activity", label: "Activity" },
      ]}
      active={active}
      onChange={setActive}
      ariaLabel="Preview tabs"
    />
  );
}

function HeatmapPreview() {
  const now = useWorkspace().now;
  const counts = new Map<string, number>();
  for (let i = 0; i < 70; i++) {
    counts.set(dayKey(now - i * 24 * 60 * 60 * 1000), (i * 13) % 7);
  }
  return <Heatmap counts={counts} now={now} weeks={10} ariaLabel="Preview activity heatmap" />;
}

/* ------------------------------------------------------------------ */
/* The catalog — ui primitives + app parts. Floors are the ui          */
/* MIN_CONTENT exports, verbatim (single source of truth).             */
/* ------------------------------------------------------------------ */

const UI_PARTS: readonly PreviewPart[] = [
  {
    id: "chart",
    min: CHART_MIN,
    render: () => <Chart variant="area" points={SAMPLE_POINTS} dots ariaLabel="Preview cadence chart" />,
    fallback:
      "non-chart presentation via the widget ladder — Stat numerals / Led / SegBar geometry. No compact renderer (settled #9).",
  },
  {
    id: "donut",
    min: DONUT_MIN,
    render: (box) => (
      <Donut
        slices={SAMPLE_SLICES}
        center={{ value: "10", label: "projects" }}
        size={Math.max(56, Math.min(148, box.h - 8))}
        ariaLabel="Preview stack distribution"
      />
    ),
    fallback: "drop the center figure — bare ring (donut-bare, 64×64).",
  },
  {
    id: "donut-bare",
    min: DONUT_BARE_MIN,
    render: (box) => (
      <Donut
        slices={SAMPLE_SLICES}
        size={Math.max(48, Math.min(148, box.h - 8))}
        ariaLabel="Preview stack distribution (bare ring)"
      />
    ),
    fallback: "the bare ring IS the below-min form of donut.",
  },
  {
    id: "gauge",
    min: GAUGE_MIN,
    render: () => <Gauge value={64} label="of 100" ariaLabel="Preview health gauge" />,
    fallback: "Stat numeral + SegBar via the ladder.",
  },
  {
    id: "heatmap",
    min: HEATMAP_MIN,
    render: () => <HeatmapPreview />,
    fallback: "don't place below 4 weeks — ladder swaps to ProjectPulse / recency chips.",
  },
  {
    id: "h-bars",
    min: hBarsMinContent(SAMPLE_HBAR_ROWS.length),
    render: () => <HBars rows={SAMPLE_HBAR_ROWS} ariaLabel="Preview top stacks" />,
    fallback: "collapse to top rows; smallest form is a SegBar (40×8).",
  },
  {
    id: "seg-bar",
    min: SEG_BAR_MIN,
    render: () => <SegBar segments={SAMPLE_SEGMENTS} ariaLabel="Preview report freshness" />,
    fallback: "renders at every rung.",
  },
  {
    id: "pulse-strip",
    min: PULSE_STRIP_MIN,
    render: () => <PulseStrip cells={SAMPLE_PULSE_CELLS} tone="accent" ariaLabel="Preview pulse" />,
    fallback: "renders at every rung (smallest geometry part).",
  },
  {
    id: "animated-number",
    min: ANIMATED_NUMBER_MIN,
    render: () => <AnimatedNumber value={4217} motion="roll" />,
    fallback: "renders at every rung.",
  },
  {
    id: "stat",
    min: STAT_MIN,
    render: () => <Stat label="Commits" value="4,217" size="md" hint="All branches" />,
    fallback: "renders at every rung (size prop scales).",
  },
  {
    id: "vitals-band",
    min: VITALS_BAND_MIN,
    render: () => <VitalsBand cells={SAMPLE_VITALS} ariaLabel="Preview fleet vitals" />,
    fallback: "flex-wrap — one cell visible at 1x1.",
  },
  {
    id: "led",
    min: LED_MIN,
    render: () => <Led tone="live" tag={LED_TAG.live} pulse={false} />,
    fallback: "renders at every rung.",
  },
  {
    id: "severity-dots",
    min: SEVERITY_DOTS_MIN,
    render: () => <SeverityDots dots={SAMPLE_DOTS} />,
    fallback: "renders at every rung.",
  },
  {
    id: "chip",
    min: CHIP_MIN,
    render: () => <Chip tone="accent">pinned</Chip>,
    fallback: "renders at every rung.",
  },
  {
    id: "git-glyphs",
    min: GIT_GLYPHS_MIN,
    render: () => <GitGlyphs isRepo ahead={1} behind={0} dirtyCount={2} />,
    fallback: "renders at every rung (wraps).",
  },
  {
    id: "score-ring",
    min: SCORE_RING_MIN,
    render: () => <ScoreRing score={0.82} size={28} />,
    fallback: "renders at every rung (14 px micro floor).",
  },
  {
    id: "score-chip",
    min: null,
    render: () => <ScoreChip score={0.82} />,
    fallback: "renders at every rung.",
  },
  {
    id: "kv-list",
    min: KV_LIST_MIN,
    render: () => <KvList rows={SAMPLE_KV_ROWS} />,
    fallback: "single-line truncation is the floor; swap to a Chip at 1x1.",
  },
  {
    id: "widget-tabs",
    min: WIDGET_TABS_MIN,
    render: () => <TabsPreview />,
    fallback: "no view switcher below 120 px — shells hide tabs at 1x1.",
  },
  {
    id: "view-carousel",
    min: VIEW_CAROUSEL_MIN,
    render: () => <ViewCarousel cards={SAMPLE_CAROUSEL_CARDS} ariaLabel="Preview views" />,
    fallback: "first card only, no pills (container query).",
  },
  {
    id: "data-table",
    min: DATA_TABLE_MIN,
    render: () => (
      <DataTable
        columns={SAMPLE_TABLE_COLUMNS}
        data={SAMPLE_TABLE_ROWS}
        ariaLabel="Preview projects table"
      />
    ),
    fallback: "KVList of the first 2 columns, top-N rows — never scrolls internally.",
  },
];

const APP_PARTS: readonly PreviewPart[] = [
  {
    id: "report-gate",
    min: null,
    render: () => (
      <ReportGatePart>
        <Stat label="Report" value="ready" size="sm" />
      </ReportGatePart>
    ),
    fallback: "quiet at 1x1 — loading/no-scope render null.",
  },
  {
    id: "attention-list",
    min: null,
    render: () => <AttentionListPart max={4} />,
    fallback: "density=strip below 2x2.",
  },
  {
    id: "project-pulse",
    min: PULSE_STRIP_MIN,
    render: () => <ProjectPulsePart project={SAMPLE_PROJECT} ariaLabel="Sample project pulse" />,
    fallback: "renders at every rung.",
  },
  {
    id: "note-editor",
    min: null,
    render: () => <NoteEditorPart rows={3} />,
    fallback: "textarea shrinks with the box.",
  },
  {
    id: "led-project",
    min: LED_MIN,
    render: () => <ProjectLedPart project={SAMPLE_PROJECT} tag />,
    fallback: "renders at every rung.",
  },
  {
    id: "branch-switcher",
    min: null,
    render: () => <BranchSwitcherPart />,
    fallback: "renders at every rung (closed select).",
  },
  {
    id: "git-actions-toolbar",
    min: null,
    render: () => <GitActionsToolbarPart />,
    fallback: "renders at every rung (wraps).",
  },
  {
    id: "files-list",
    min: null,
    from: "2x3",
    render: (box) => <FilesListPart height={`${Math.max(120, box.h - 8)}px`} />,
    fallback: "needs real height — preview authors a 2x3 smallest rung.",
  },
  {
    id: "artifacts-list",
    min: null,
    from: "2x3",
    render: () => <ArtifactsListPart />,
    fallback: "needs room for rows — preview authors a 2x3 smallest rung.",
  },
  {
    id: "commits-list",
    min: null,
    from: "2x2",
    render: () => <CommitsListPart limit={20} />,
    fallback: "view=list at small rungs; the table swaps to KVList below 420 px.",
  },
];

/* ------------------------------------------------------------------ */
/* Dialog parts: chrome is viewport-fixed, not ladder-bound — rendered */
/* open/closed via toggles; the first scope defaults FormAddRoot open  */
/* so the suite always has a real portal surface inside a scope.       */
/* ------------------------------------------------------------------ */

const FORM_PARTS = [
  { id: "form-create-project", label: "Create project" },
  { id: "form-add-root", label: "Add root" },
  { id: "form-clone-script", label: "Clone script" },
  { id: "form-report-run", label: "Run report" },
] as const;

type FormId = (typeof FORM_PARTS)[number]["id"];

function DialogsSection({ defaultOpen }: { defaultOpen: FormId | null }) {
  const [open, setOpen] = useState<FormId | null>(defaultOpen);
  const toggle = (id: FormId) => setOpen((current) => (current === id ? null : id));
  return (
    <section data-preview-section="dialogs" className="mt-5">
      <h3 className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
        dialog parts — form flows (viewport-fixed chrome, one open at a time)
      </h3>
      <div className="mt-2 flex flex-wrap gap-2">
        {FORM_PARTS.map((form) => (
          <button
            key={form.id}
            type="button"
            data-preview-dialog-trigger={form.id}
            onClick={() => toggle(form.id)}
            className="border border-border px-2 py-1 font-mono text-[11px] text-foreground hover:bg-muted"
          >
            {open === form.id ? "Close" : "Open"} {form.label}
          </button>
        ))}
      </div>
      <FormCreateProjectPart
        open={open === "form-create-project"}
        onOpenChange={(o) => setOpen(o ? "form-create-project" : null)}
      />
      <FormAddRootPart
        open={open === "form-add-root"}
        onOpenChange={(o) => setOpen(o ? "form-add-root" : null)}
      />
      <FormCloneScriptPart
        open={open === "form-clone-script"}
        onOpenChange={(o) => setOpen(o ? "form-clone-script" : null)}
      />
      <FormReportRunPart
        open={open === "form-report-run"}
        onOpenChange={(o) => setOpen(o ? "form-report-run" : null)}
      />
    </section>
  );
}
