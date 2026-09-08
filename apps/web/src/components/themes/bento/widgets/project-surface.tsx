/**
 * Bento's working surface — ports of `components/designs/bento/
 * project-page.tsx`'s bottom tabs: files / artifacts / ideation as the
 * design's tabbed glazed tile over the shared functional panels, and the
 * commit-history band (the design's "History" tile).
 */
import { useEffect, useState } from "react";
import { Folder, Images, MessagesSquare } from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace-welcome/ui/components/tabs";

import { ArtifactsPanel } from "@/components/artifacts";
import { IdeationPanel } from "@/components/ideation/ideation-panel";

import { CommitsListPart, FilesList } from "@/components/parts";
import { useProject } from "@/lib/contexts/project-context";

import { onSurfaceTab } from "../surface-tabs";
import type { RegisteredWidgetProps } from "@/components/widgets/registry";

import { BentoTile } from "../bits";

/* ------------------------------------------------------------ surface --- */

export function BentoProjectSurface(_props: RegisteredWidgetProps) {
  const path = useProject().path;
  const [tab, setTab] = useState("files");

  // The nav bar's Files/Artifacts/Ideation tabs drive this pane.
  useEffect(() => onSurfaceTab(setTab), []);

  return (
    <BentoTile className="flex h-full min-h-0 w-full flex-col p-2">
      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v ?? "files")}
        className="b-tabs flex min-h-0 flex-1 flex-col"
      >
        <TabsList className="mx-1 mt-1 shrink-0 self-start">
          <TabsTrigger value="files">
            <Folder className="size-3" /> Files
          </TabsTrigger>
          <TabsTrigger value="artifacts">
            <Images className="size-3" /> Artifacts
          </TabsTrigger>
          <TabsTrigger value="ideation">
            <MessagesSquare className="size-3" /> Ideation
          </TabsTrigger>
        </TabsList>
        {/* The shared browser clamps, never scrolls: the pane split sizes to
            its content inside the tile and the card's own overflow-hidden
            crops what the band doesn't fit. */}
        <TabsContent value="files" className="mt-2 flex min-h-0 flex-1 flex-col">
          <FilesList height="100%" className="h-full min-h-0 w-full" />
        </TabsContent>
        <TabsContent value="artifacts" className="mt-2 flex min-h-0 flex-1 flex-col">
          <ArtifactsPanel project={path} />
        </TabsContent>
        {/* Keyed by path so splat-only navigation remounts the panel and
            resets its per-project state (auto-resume, draft, context). */}
        <TabsContent value="ideation" className="mt-2 flex min-h-0 flex-1 flex-col">
          <IdeationPanel key={path} project={path} />
        </TabsContent>
      </Tabs>
    </BentoTile>
  );
}

/* ------------------------------------------------------------- commits --- */

export function BentoProjectCommits(_props: RegisteredWidgetProps) {
  return (
    <BentoTile className="flex h-full min-h-0 w-full flex-col p-4">
      <h2 className="b-label">commit history</h2>
      {/* The design embeds the commit graph in a scroller; the board keeps
          the band height honest — the part's graph view in the DENSE
          register (22px rows, inline sha · author · age), windowed to the
          rows the band fits. */}
      <div className="min-h-0 flex-1 overflow-hidden pt-2">
        <CommitsListPart view="graph" dense limit={16} />
      </div>
    </BentoTile>
  );
}
