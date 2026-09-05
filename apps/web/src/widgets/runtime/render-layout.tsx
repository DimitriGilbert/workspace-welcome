/**
 * render-layout — the PageLayout renderer (master plan §5 W4, §3.3, §3.4).
 *
 * Turns a preset into a live board:
 *
 * - mounts ONE ThemeScope per route (page header + board inside the scope);
 * - builds the provider stack from `PageLayout.context` (§3.4's one-sentence
 *   spec): `"workspace"` → Settings > Workspace > Report{scan, roots[0]?.path};
 *   `"project"` → Settings > Project{nests Workspace} > Report{repo, path}.
 *   `report?: false` omits the ReportProvider entirely. Exported separately
 *   as {@link PageProviders} — the builder M3/D8 wire the `/app/$theme`
 *   routes with;
 * - resolves regions to placements: stack regions pass their authored nodes
 *   through, flow regions run their registered generator INSIDE the provider
 *   stack (the structural `WorkspaceContextValue` input; flows never call
 *   tRPC). `template.widget` overrides the generator's kind and
 *   `template.ladders` remaps footprints — entries are keyed by the emitted
 *   size class and resolved down the candidate list, so themes re-shape
 *   generated tiles without editing the generator;
 * - renders registry components in the GridCanvas; each node's shell carries
 *   the registry title, the canvas owns placement + affordances;
 * - runs the dev-mode `requires` assertion: after mount it reads the mounted
 *   `data-providers` stamps inside the scope and errors to the console for
 *   every rendered widget whose `WidgetDef.requires` is not a subset (the
 *   static half of this check is validate-layout, grep-invariant #6).
 *
 * Unknown registry keys render an explicit broken-state frame — never fake
 * content; validate-layout flags them before anything ships.
 */
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { ThemeScope } from "@workspace-welcome/ui/components/theme-scope";

import { getFlow } from "./flows";
import { GridCanvas } from "./grid-canvas";
import type { PlacedRegion } from "./grid-canvas";
import type { PageLayout, RegionNode, WidgetNode } from "./layout-types";
import { resolveSizeClass } from "./size-class";
import type { SizeClass } from "./size-class";
import { useConsoleKeys } from "./use-console-keys";
import { WidgetShell, WidgetTabs } from "./widget-shell";
import { ProjectProvider } from "../contexts/project-context";
import { ReportProvider } from "../contexts/report-context";
import { SettingsProvider } from "../contexts/settings-context";
import { useWorkspace, WorkspaceProvider } from "../contexts/workspace-context";
import { widgetRegistry } from "../registry";

/** A console view: digit-key-switchable page section. `regions` names the
 * preset regions the view shows (all regions when omitted). */
export interface ConsoleView {
  id: string;
  label: string;
  regions?: readonly string[];
}

export interface RenderLayoutProps {
  /** Theme slug — the ThemeScope stamp (`data-ww-theme`). */
  theme: string;
  /** The page preset to render. */
  preset: PageLayout;
  /** Page kind inside the session-store key (e.g. "dashboard" | "project"). */
  page: string;
  /** Project path — required when `preset.context` is `"project"`. */
  projectPath?: string;
  /** Mono-caps label in the page header. */
  headerLabel?: ReactNode;
  /** Right-of-label header slot (chips, timestamps). */
  headerMeta?: ReactNode;
  /** Digit-switchable views; keys 1..N, Escape restores the first. */
  consoleViews?: readonly ConsoleView[];
  /** Drag/resize affordances on placed widgets. Default true. */
  interactive?: boolean;
  className?: string;
}

/**
 * The §3.4 provider stack, mounted once per page. `report` defaults to on;
 * `PageLayout.report?: false` passes `false` to omit the ReportProvider.
 */
export function PageProviders({
  context,
  report = true,
  projectPath,
  children,
}: {
  context: PageLayout["context"];
  report?: boolean;
  projectPath?: string;
  children: ReactNode;
}) {
  return (
    <SettingsProvider>
      {context === "project" ? (
        <ProjectBranch projectPath={projectPath} report={report}>
          {children}
        </ProjectBranch>
      ) : (
        <WorkspaceBranch report={report}>{children}</WorkspaceBranch>
      )}
    </SettingsProvider>
  );
}

function WorkspaceBranch({ report, children }: { report: boolean; children: ReactNode }) {
  return (
    <WorkspaceProvider>
      {report ? <ScanReportScope>{children}</ScanReportScope> : children}
    </WorkspaceProvider>
  );
}

/**
 * The dashboard's report scope: `{ kind: "scan", path: roots[0]?.path }` —
 * read INSIDE the WorkspaceProvider so the roots result is the mounted one;
 * an empty roots list leaves the path undefined and the provider reports the
 * honest `no-scope` status.
 */
function ScanReportScope({ children }: { children: ReactNode }) {
  const { roots } = useWorkspace();
  const path = roots.data?.[0]?.path;
  return (
    <ReportProvider kind="scan" path={path}>
      {children}
    </ReportProvider>
  );
}

function ProjectBranch({
  projectPath,
  report,
  children,
}: {
  projectPath: string | undefined;
  report: boolean;
  children: ReactNode;
}) {
  if (projectPath === undefined || projectPath.length === 0) {
    return (
      <div data-provider-state="error" role="alert" className="px-5 py-6 text-sm">
        Project page mounted without a project path — the provider stack cannot
        be built. Pass <code>projectPath</code> to the renderer.
      </div>
    );
  }
  return (
    <ProjectProvider path={projectPath}>
      {report ? (
        <ReportProvider kind="repo" path={projectPath}>
          {children}
        </ReportProvider>
      ) : (
        children
      )}
    </ProjectProvider>
  );
}

/** Apply a flow region's template to one generated node: the template's
 * `widget` overrides the generator's kind; `ladders` (keyed by the emitted
 * size class) re-resolve the footprint down its candidate classes. */
function applyTemplate(
  node: WidgetNode,
  template: Extract<RegionNode, { kind: "flow" }>["template"],
): WidgetNode {
  const emitted = node.size;
  const candidates = template.ladders?.[emitted];
  const size: SizeClass =
    candidates === undefined ? emitted : resolveSizeClass(candidates, emitted);
  return {
    ...node,
    widget: template.widget,
    size,
  };
}

/** Resolve every region of a preset into canvas-ready placed regions. Flow
 * generators run HERE — inside the provider stack — on the workspace's
 * structural `{ projects, now, filter? }` shape (the header filter rides
 * along for generators that narrow by it). Missing generators yield an empty
 * region plus an honest error string (rendered + console-errored in dev). */
export function resolveRegions(
  preset: PageLayout,
  workspace: {
    projects: ReturnType<typeof useWorkspace>["projects"];
    now: number;
    filter?: string;
  },
): { regions: PlacedRegion[]; flowErrors: string[] } {
  const regions: PlacedRegion[] = [];
  const flowErrors: string[] = [];
  for (const region of preset.regions) {
    if (region.kind === "stack") {
      regions.push({ id: region.id, nodes: region.widgets });
      continue;
    }
    const generator = getFlow(region.from);
    if (generator === null) {
      flowErrors.push(
        `region "${region.id}" references flow "${region.from}" — no generator is registered`,
      );
      regions.push({ id: region.id, nodes: [] });
      continue;
    }
    regions.push({
      id: region.id,
      nodes: generator({
        projects: workspace.projects,
        now: workspace.now,
        filter: workspace.filter,
      }).map((node) => applyTemplate(node, region.template)),
    });
  }
  return { regions, flowErrors };
}

function UnregisteredWidget({ widget }: { widget: string }) {
  return (
    <div
      data-widget-state="unregistered"
      role="alert"
      className="flex h-full min-h-0 w-full items-center justify-center border border-dashed border-(--destructive) px-3"
    >
      <p className="truncate text-xs text-(--destructive)">
        Unregistered widget “{widget}” — fix the preset or register the kind.
      </p>
    </div>
  );
}

function renderWidget(node: WidgetNode, size: { cols: number; rows: number; sizeClass: SizeClass }) {
  const def = widgetRegistry.get(node.widget);
  if (def === undefined) return <UnregisteredWidget widget={node.widget} />;
  return (
    <WidgetShell title={def.title}>
      <def.component node={node} size={size} />
    </WidgetShell>
  );
}

/** DEV-only `requires ⊆ provider stack` assertion — reads the mounted
 * `data-providers` stamps inside the theme scope (§3.4 enforcement (b)'s
 * runtime half; validate-layout is the static half). */
function useRequiresAssertion(theme: string, nodes: readonly WidgetNode[]): void {
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const scope = document.querySelector(`[data-ww-theme="${theme}"][data-theme-scope]`);
    if (scope === null) return;
    const provided = new Set<string>();
    for (const element of scope.querySelectorAll("[data-providers]")) {
      for (const key of (element.getAttribute("data-providers") ?? "").split(/\s+/)) {
        if (key.length > 0) provided.add(key);
      }
    }
    for (const node of nodes) {
      const def = widgetRegistry.get(node.widget);
      if (def === undefined) continue;
      const missing = def.requires.filter((key) => !provided.has(key));
      if (missing.length > 0) {
        console.error(
          `[render-layout] widget "${def.id}" (node "${node.id}") requires provider(s) ` +
            `[${missing.join(", ")}] but the page stack provides [${[...provided].join(", ")}]`,
        );
      }
    }
  }, [theme, nodes]);
}

export function RenderLayout({
  theme,
  preset,
  page,
  projectPath,
  headerLabel,
  headerMeta,
  consoleViews,
  interactive = true,
  className,
}: RenderLayoutProps) {
  return (
    <ThemeScope theme={theme} data-ww-page={page}>
      <PageProviders context={preset.context} report={preset.report !== false} projectPath={projectPath}>
        <PageBody
          theme={theme}
          preset={preset}
          page={page}
          headerLabel={headerLabel}
          headerMeta={headerMeta}
          consoleViews={consoleViews}
          interactive={interactive}
          className={className}
        />
      </PageProviders>
    </ThemeScope>
  );
}

function PageBody({
  theme,
  preset,
  page,
  headerLabel,
  headerMeta,
  consoleViews,
  interactive,
  className,
}: RenderLayoutProps) {
  const workspace = useWorkspace();
  const [activeView, setActiveView] = useState<string | null>(consoleViews?.[0]?.id ?? null);
  useConsoleKeys({
    views: consoleViews?.map((view) => view.id),
    activeView,
    defaultView: consoleViews?.[0]?.id ?? null,
    onViewChange: setActiveView,
  });

  const { regions, flowErrors } = useMemo(
    () => resolveRegions(preset, workspace),
    [preset, workspace],
  );

  const view = consoleViews?.find((candidate) => candidate.id === activeView);
  const visibleRegions = useMemo(() => {
    if (view?.regions === undefined) return regions;
    const allowed = new Set(view.regions);
    return regions.filter((region) => allowed.has(region.id));
  }, [regions, view]);

  useRequiresAssertion(theme, useMemo(() => regions.flatMap((r) => r.nodes), [regions]));

  return (
    <div data-console-view={activeView ?? undefined} className={className}>
      <header
        data-slot="page-header"
        className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 pt-4"
      >
        {headerLabel !== undefined && (
          <p className="font-mono text-[0.65rem] uppercase tracking-widest text-muted-foreground">
            {headerLabel}
          </p>
        )}
        {headerMeta}
        {consoleViews !== undefined && consoleViews.length > 0 && (
          <WidgetTabs
            tabs={consoleViews}
            activeTab={activeView ?? undefined}
            onTabChange={setActiveView}
          />
        )}
        <input
          data-console-filter=""
          type="text"
          value={workspace.filter}
          onChange={(event) => workspace.setFilter(event.target.value)}
          placeholder='Filter projects — press "/"'
          aria-label="Filter projects"
          className="ml-auto w-44 max-w-full min-w-0 rounded-none border-b bg-transparent px-1 py-0.5 text-xs outline-none placeholder:text-muted-foreground/60 focus-visible:border-(--pinned-accent,var(--primary))"
        />
      </header>

      {flowErrors.length > 0 && (
        <div
          data-flow-state="missing-generator"
          role="status"
          className="mx-5 mt-3 border border-dashed px-3 py-2 text-xs text-muted-foreground"
        >
          {flowErrors.map((error) => (
            <p key={error}>{error}</p>
          ))}
        </div>
      )}

      <div className="px-5 pb-10 pt-4">
        <GridCanvas
          pageId={`${theme}:${page}`}
          columns={preset.columns}
          cell={preset.cell}
          regions={visibleRegions}
          renderItem={renderWidget}
          minOf={minOfWidget}
          labelOf={labelOfWidget}
          interactive={interactive}
        />
      </div>
    </div>
  );
}

const minOfWidget = (widget: string): SizeClass | undefined =>
  widgetRegistry.get(widget)?.min;

const labelOfWidget = (widget: string): string =>
  widgetRegistry.get(widget)?.title ?? widget;
