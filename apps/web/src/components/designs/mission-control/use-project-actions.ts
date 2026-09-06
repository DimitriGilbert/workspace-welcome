import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useTRPC } from "@/utils/trpc";

/**
 * Shared row-level mutations for the console: pin, hide, open (editor,
 * terminal, folder) and the last-opened touch. Mirrors the main dashboard's
 * project-card wiring: every success invalidates the scan so the fleet
 * re-renders from the store.
 */
export function useProjectActions() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const invalidateScan = () =>
    queryClient.invalidateQueries({ queryKey: trpc.projects.scan.queryKey() });

  const pin = useMutation(
    trpc.projects.setPinned.mutationOptions({
      onSuccess: () => invalidateScan(),
      onError: (e) => toast.error(e.message),
    }),
  );

  const hide = useMutation(
    trpc.projects.setHidden.mutationOptions({
      onSuccess: (_data, variables) => {
        invalidateScan();
        toast.success("Project hidden", {
          action: {
            label: "Undo",
            onClick: () => hide.mutate({ path: variables.path, hidden: false }),
          },
        });
      },
      onError: (e) => toast.error(e.message),
    }),
  );

  const open = useMutation(
    trpc.projects.open.mutationOptions({
      onSuccess: (data) => toast.success(data.message),
      onError: (e) => toast.error(e.message),
    }),
  );

  const touch = useMutation(
    trpc.projects.touchLastOpened.mutationOptions({
      onSuccess: () => invalidateScan(),
    }),
  );

  const openTarget = (path: string, target: "editor" | "terminal" | "folder") => {
    open.mutate({ path, target });
    touch.mutate({ path });
  };

  return { pin, hide, openTarget, openPending: open.isPending };
}
