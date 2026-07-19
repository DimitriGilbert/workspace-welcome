import { FolderPlus, FolderSearch } from "lucide-react";

import { Button } from "@workspace-welcome/ui/components/button";

interface EmptyStateProps {
  /** No roots configured at all. */
  noRoots: boolean;
  onAddRoot: () => void;
}

/**
 * Friendly empty state. Distinguishes "you haven't added a root yet" from
 * "your root has no projects in it".
 */
export function EmptyState({ noRoots, onAddRoot }: EmptyStateProps) {
  const Icon = noRoots ? FolderPlus : FolderSearch;
  const title = noRoots ? "Add a directory to start" : "No projects found";
  const body = noRoots
    ? "Pick a folder where your projects live. Workspace Welcome will scan it for repos and show them here."
    : "None of the directories under this root look like projects yet. Try another directory, or add a project to it.";

  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-none border border-dashed p-10 text-center">
      <Icon className="size-8 text-muted-foreground" />
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-medium">{title}</h3>
        <p className="max-w-sm text-xs text-muted-foreground">{body}</p>
      </div>
      {noRoots ? (
        <Button onClick={onAddRoot}>
          <FolderPlus className="size-3.5" /> Add a directory
        </Button>
      ) : null}
    </div>
  );
}
