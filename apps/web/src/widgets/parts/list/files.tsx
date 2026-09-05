import type { ComponentPropsWithoutRef } from "react";

import { FileBrowser } from "@/components/file-browser";

import { useProject } from "@/widgets/contexts/project-context";

/**
 * FilesList — the project file browser as a part (master plan §3.5). A thin
 * wrapper over the shared `FileBrowser` (which keeps its own container-
 * independent `files.list` queries — leaf parts fetch, contexts provide
 * scope): the path comes from `useProject()`, and the split-pane height is
 * forwarded to FileBrowser's height prop so containers size it without CSS
 * override hacks. Rest props (definePart's data-part stamps, caller
 * className/style) forward through FileBrowser onto its Card root.
 */

export interface FilesListProps extends ComponentPropsWithoutRef<"div"> {
  /** Shared tree/viewer pane height (CSS length). Default keeps the page
   * layout's 70vh; widget shells pass e.g. "100%" or a fixed length. */
  height?: string;
}

export function FilesList({ height, className, ...rest }: FilesListProps) {
  const path = useProject().path;
  return (
    <FileBrowser project={path} height={height} className={className} {...rest} />
  );
}
