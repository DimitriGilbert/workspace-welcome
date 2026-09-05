import type { ComponentPropsWithoutRef } from "react";
import { useState } from "react";
import { NotebookPen } from "lucide-react";

import { Textarea } from "@workspace-welcome/ui/components/textarea";
import { cn } from "@workspace-welcome/ui/lib/utils";

import { useProject } from "@/widgets/contexts/project-context";

/**
 * NoteEditor — "where I left off" (master plan §3.5): a bound view over the
 * project provider's note pair (`useProject().note`). Edits land in the
 * local draft; blur (and Ctrl/⌘+Enter) saves through the provider, which
 * owns the mutation, invalidation, and toast. One small unsaved hint keeps
 * the state honest without stealing the tile's space.
 */

export interface NoteEditorProps extends ComponentPropsWithoutRef<"div"> {
  /** Textarea rows (default 4). */
  rows?: number;
  /** Placeholder shown while the note is empty. */
  placeholder?: string;
}

export function NoteEditor({
  rows = 4,
  placeholder = "Where you left off — next steps, gotchas, links…",
  className,
  ...rest
}: NoteEditorProps) {
  const note = useProject().note;
  const [saved, setSaved] = useState(true);
  const dirty = note.draft !== note.value;

  const save = () => {
    note.save();
    setSaved(true);
  };

  return (
    <div className={cn("flex min-h-0 min-w-0 flex-col gap-1", className)} {...rest}>
      <span className="flex items-center gap-1.5 text-[10px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
        <NotebookPen className="size-3" aria-hidden />
        Note
        {dirty && !saved ? (
          <span className="normal-case">— unsaved, saves on blur</span>
        ) : null}
      </span>
      <Textarea
        value={note.draft}
        rows={rows}
        placeholder={placeholder}
        aria-label="Project note"
        className="min-h-0 flex-1 resize-none font-mono text-xs"
        onChange={(e) => {
          note.setDraft(e.target.value);
          setSaved(false);
        }}
        onBlur={save}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            save();
          }
        }}
      />
    </div>
  );
}
