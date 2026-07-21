import { FolderPlus, FolderSearch } from "lucide-react";

import { Button } from "@workspace-welcome/ui/components/button";

interface EmptyStateProps {
  /** No roots configured at all. */
  noRoots: boolean;
  onAddRoot: () => void;
}

/**
 * Friendly empty state. Distinguishes "you haven't added a root yet" from
 * "your root has no projects in it". Kept deliberately understated: a single
 * dashed panel with the recency-tinted icon, since the page itself is bare.
 */
export function EmptyState({ noRoots, onAddRoot }: EmptyStateProps) {
  const Icon = noRoots ? FolderPlus : FolderSearch;
  const title = noRoots ? "Add a directory to start" : "No projects found";
  const body = noRoots
    ? "Pick a folder where your projects live. Workspace Welcome will scan it for repos and show them here."
    : "None of the directories under this root look like projects yet. Try another directory, or add a project to it.";

  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-none border border-dashed border-foreground/15 p-16 text-center">
      <span
        aria-hidden
        className="flex size-12 items-center justify-center rounded-none"
        style={{
          color: "var(--recency-fresh)",
          backgroundColor:
            "color-mix(in oklch, var(--recency-fresh) 12%, transparent)",
        }}
      >
        <Icon className="size-6" />
      </span>
      <div className="flex flex-col gap-1.5">
        <h3 className="text-base font-semibold tracking-tight">{title}</h3>
        <p className="max-w-sm text-sm text-muted-foreground">{body}</p>
      </div>
      {noRoots ? (
        <Button onClick={onAddRoot}>
          <FolderPlus className="size-3.5" /> Add a directory
        </Button>
      ) : null}
    </div>
  );
}
