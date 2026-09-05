/**
 * Bento's working surface (master plan §5 T3-bento): the design's bottom
 * tabs — files / artifacts / ideation / history — ported onto the widget
 * system.
 *
 * - `bento-project-surface` — the files/artifacts/ideation tabs as shell
 *   tabs. Files and artifacts render the P4 leaf parts (`FilesList`,
 *   `ArtifactsList` — the system wrappers over the shared `FileBrowser` /
 *   `ArtifactsPanel` functional components); ideation has no part, so the
 *   shared `IdeationPanel` component is imported directly (the plan's
 *   shared-functional-component rule, T2's deferred precedent).
 * - `bento-project-commits` — the history tab as its own band over the
 *   `CommitsList` part's table/graph/list switcher (the provider's cached
 *   limit-200 log; no inner scroller of its own — height is the ladder's).
 */
import { useState } from "react";
import type { ReactNode } from "react";

import { IdeationPanel } from "@/components/ideation/ideation-panel";

import { ArtifactsListPart, CommitsListPart, FilesListPart } from "@/widgets/parts";
import { useProject } from "@/widgets/contexts/project-context";
import type { RegisteredWidgetProps } from "@/widgets/registry";
import type { WidgetTab } from "@/widgets/runtime/widget-shell";
import { WidgetShell } from "@/widgets/runtime/widget-shell";

const SURFACE_TABS: readonly WidgetTab[] = [
  { id: "files", label: "Files" },
  { id: "artifacts", label: "Artifacts" },
  { id: "ideation", label: "Ideation" },
];

function SurfaceFill({ children }: { children: ReactNode }) {
  return <div className="h-full min-h-0 w-full min-w-0 px-3 pb-3">{children}</div>;
}

/* ----------------------------------------------------------- surface --- */

function SurfaceBody({ tab }: { tab: string }) {
  const path = useProject().path;
  if (tab === "artifacts") {
    return (
      <SurfaceFill>
        <ArtifactsListPart className="h-full min-h-0 w-full" />
      </SurfaceFill>
    );
  }
  if (tab === "ideation") {
    return (
      <SurfaceFill>
        {/* Keyed by path so splat-only navigation remounts the panel and
            resets its per-project state (auto-resume, draft, context). */}
        <div className="h-full min-h-0 w-full overflow-hidden" data-slot="bento-ideation">
          <IdeationPanel key={path} project={path} />
        </div>
      </SurfaceFill>
    );
  }
  return (
    <SurfaceFill>
      <FilesListPart height="100%" className="h-full min-h-0 w-full" />
    </SurfaceFill>
  );
}

export function BentoProjectSurface({ size }: RegisteredWidgetProps) {
  const full = size.cols >= 2 && size.rows >= 2;
  const [tab, setTab] = useState("files");

  return (
    <WidgetShell
      size={{ cols: size.cols, rows: size.rows }}
      className="h-full w-full"
      tabs={full ? SURFACE_TABS : undefined}
      activeTab={full ? tab : undefined}
      onTabChange={full ? setTab : undefined}
    >
      {full ? (
        <SurfaceBody tab={tab} />
      ) : (
        <SurfaceFill>
          <p className="pt-2 text-xs text-muted-foreground">
            Widen the tile for the files, artifacts, and ideation surfaces.
          </p>
        </SurfaceFill>
      )}
    </WidgetShell>
  );
}

/* ------------------------------------------------------------ commits --- */

export function BentoProjectCommits({ size }: RegisteredWidgetProps) {
  return (
    <WidgetShell size={{ cols: size.cols, rows: size.rows }} className="h-full w-full">
      <SurfaceFill>
        <CommitsListPart className="h-full min-h-0 w-full" />
      </SurfaceFill>
    </WidgetShell>
  );
}
