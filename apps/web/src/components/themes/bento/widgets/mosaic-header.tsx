/**
 * Bento's mosaic header — the design's `MosaicSection` register: the
 * PROJECTS eyebrow with the tile count and the size legend (the five cell
 * shapes at scale with their recency meaning). The row rides the bottom of
 * its band so it sits tight above the mosaic, exactly the design's rhythm.
 */
import { useWorkspace } from "@/widgets/contexts/workspace-context";
import type { RegisteredWidgetProps } from "@/widgets/registry";

import { SizeLegend } from "../bits";

export function BentoMosaicHeader(_props: RegisteredWidgetProps) {
  const workspace = useWorkspace();

  return (
    <div className="flex h-full min-h-0 w-full flex-col justify-end">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5 pb-2">
        <h2 className="b-label">Projects</h2>
        <span className="font-mono text-[0.68rem] tabular-nums text-muted-foreground">
          {workspace.projects.length}
        </span>
        <span className="ml-auto hidden md:block">
          <SizeLegend />
        </span>
      </div>
    </div>
  );
}
