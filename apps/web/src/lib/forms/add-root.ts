import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useTRPC } from "@/utils/trpc";

export interface UseAddRootOptions {
  /**
   * Fired after a successful add, once queries are invalidated, the success
   * toast shown, and the fields reset — after `onClose`. Callers use it to
   * react to the new root (focus it, refresh a picker, ...).
   */
  onAdded?: () => void;
  /**
   * Fired after a successful add, before `onAdded`; containers typically
   * close their chrome here. Never fired on failure — errors surface as a
   * toast and the entered values stay put.
   */
  onClose?: () => void;
}

/**
 * Container-independent add-root logic: the `roots.add` mutation plus the
 * success handling the default sheet owns — invalidating `roots.list` and
 * `projects.scan`, the success toast, resetting the two fields, closing the
 * container, and the caller's `onAdded` hook. Server-side validation errors
 * surface as an error toast. Render nothing with it; a container binds
 * `path`/`label` to its own inputs and calls `submit` from its form's
 * `onSubmit` (after `preventDefault`).
 */
export function useAddRoot({ onAdded, onClose }: UseAddRootOptions = {}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const [path, setPath] = useState("");
  const [label, setLabel] = useState("");

  const addMutation = useMutation(
    trpc.roots.add.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: trpc.roots.list.queryKey(),
        });
        await queryClient.invalidateQueries({
          queryKey: trpc.projects.scan.queryKey(),
        });
        toast.success("Directory added");
        setPath("");
        setLabel("");
        onClose?.();
        onAdded?.();
      },
      onError: (e) => toast.error(e.message),
    }),
  );

  return {
    path,
    setPath,
    label,
    setLabel,
    /** True while `roots.add` is in flight. */
    isPending: addMutation.isPending,
    /**
     * Submit gate: false while pending or when the path is empty (the server
     * requires an absolute path; the browser cannot know more).
     */
    canSubmit: !addMutation.isPending && path.length > 0,
    /** Submit the current values through `roots.add`. */
    submit: () => addMutation.mutate({ path, label: label || undefined }),
  };
}

export type UseAddRootResult = ReturnType<typeof useAddRoot>;
