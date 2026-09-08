/**
 * McProjectConsole + McProjectNote — the project working surface (T3 port
 * of the design's console tabs and "where i left off" panel,
 * `routes/designs/mission-control/project.$.tsx`).
 *
 * The design switches the page body through header tabs (files, artifacts,
 * ideation); the /app project page has no page-level views (routes are
 * frozen), so the console is a widget kind whose shell tabs — the ONE
 * WidgetTabs implementation — switch the same three surfaces. Files and
 * artifacts are the `list/` parts (the sanctioned shared-component import
 * sites); ideation is the shared `IdeationPanel` functional component,
 * imported directly per the FileBrowser precedent (leaf surfaces fetch
 * their own scope-independent data; the project path comes from
 * `useProject()`).
 *
 * The note rides the `NoteEditor` part over `useProject().note` — the
 * design's save-on-blur textarea, mutation and invalidation included.
 */
import { useState } from "react";

import { useProject } from "@/widgets/contexts/project-context";
import type { RegisteredWidgetProps } from "@/components/widgets/registry";
import { ArtifactsList, FilesList, NoteEditor } from "@/widgets/parts";
import { WidgetShell } from "@/components/widgets/widget-shell";

import { IdeationPanel } from "@/components/ideation/ideation-panel";

type ConsoleTab = "files" | "artifacts" | "ideation";

const CONSOLE_TABS: readonly { id: ConsoleTab; label: string }[] = [
  { id: "files", label: "Files" },
  { id: "artifacts", label: "Artifacts" },
  { id: "ideation", label: "Ideation" },
];

function toConsoleTab(id: string): ConsoleTab {
  return CONSOLE_TABS.find((t) => t.id === id)?.id ?? "files";
}

export function McProjectConsole(_props: RegisteredWidgetProps) {
  const project = useProject();
  const [tab, setTab] = useState<ConsoleTab>("files");

  return (
    <WidgetShell
      className="h-full w-full"
      tabs={CONSOLE_TABS}
      activeTab={tab}
      onTabChange={(id) => setTab(toConsoleTab(id))}
    >
      {tab === "files" ? (
        <FilesList height="100%" className="h-full min-h-0 w-full" />
      ) : tab === "artifacts" ? (
        <ArtifactsList className="h-full min-h-0 w-full" />
      ) : (
        // Keyed by path so splat-only navigation remounts the panel —
        // the design's `key={path}` behavior verbatim.
        <div data-mc-ideation="" className="h-full min-h-0 w-full">
          <IdeationPanel key={project.path} project={project.path} />
        </div>
      )}
    </WidgetShell>
  );
}

export function McProjectNote(_props: RegisteredWidgetProps) {
  return (
    <WidgetShell className="h-full w-full">
      <NoteEditor rows={10} className="min-h-0 flex-1 px-3 pb-3" />
    </WidgetShell>
  );
}
