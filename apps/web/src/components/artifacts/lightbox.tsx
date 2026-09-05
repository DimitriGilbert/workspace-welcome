import { Download } from "lucide-react";

import { Button } from "@workspace-welcome/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@workspace-welcome/ui/components/dialog";

import type { ArtifactMediaEntry } from "@workspace-welcome/api/lib/artifacts";

import { absoluteDate, formatBytes } from "@/lib/format";
import { artifactViewUrl } from "@/lib/artifacts";

/**
 * Full-size artifact viewer. Images render fit-to-screen; videos play in a
 * native <video> element streaming through /api/artifacts/view, whose Range
 * support is what makes seeking work. Dialog semantics give Esc-to-close
 * and focus trapping; `key` on the video remounts it per entry so switching
 * entries never resumes the previous stream.
 */
export function ArtifactLightbox({
  project,
  entry,
  onClose,
}: {
  project: string;
  entry: ArtifactMediaEntry | null;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={entry !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="w-[min(94vw,1200px)] sm:max-w-[min(94vw,1200px)]">
        {entry !== null ? (
          <div className="flex min-h-0 flex-col gap-2">
            <DialogTitle className="truncate pr-6 font-mono text-xs">
              {entry.name}
            </DialogTitle>
            <div className="flex min-h-0 items-center justify-center border border-foreground/10 bg-black/40 p-2">
              {entry.kind === "image" ? (
                <img
                  src={artifactViewUrl(project, entry)}
                  alt={entry.name}
                  className="max-h-[72vh] max-w-full object-contain"
                />
              ) : (
                <video
                  key={entry.path}
                  src={artifactViewUrl(project, entry)}
                  controls
                  autoPlay
                  muted
                  playsInline
                  className="max-h-[72vh] max-w-full"
                />
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate font-mono text-[0.65rem] text-muted-foreground">
                {entry.path} · {formatBytes(entry.size)} ·{" "}
                {absoluteDate(entry.modifiedAt)}
              </span>
              <Button
                variant="outline"
                size="xs"
                render={
                  <a href={artifactViewUrl(project, entry)} download={entry.name} />
                }
              >
                <Download className="size-3" /> Download
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
