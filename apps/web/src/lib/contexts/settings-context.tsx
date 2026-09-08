/**
 * SettingsProvider — the widget system's settings substrate (master plan
 * §3.4, D5).
 *
 * A thin typed view over the `settings.get` cache entry: the raw query
 * result (exposed, never copied), convenience reads for the command fields
 * every quick-open part needs, and one `update` wrapper. One query per app;
 * the settings page of the widget system writes through this wrapper, so
 * every reader of `useSettings()` sees the persisted shape after a save.
 *
 * Scoping (data plan R7): mounted per page by the widget-system shells
 * (`render-layout`, the settings page, parts-preview) — never `__root.tsx`.
 *
 * Procedure access: `lib/queries/` is the only sanctioned caller of
 * `trpc.<proc>.queryOptions` for SHARED procedures. `settings.get` is not
 * shared — this provider is its sole consumer in the widget system — and
 * the `settings.update` wrapper here is one of the two sanctioned
 * mutation-wrapper exceptions to "invalidation lives in lib/queries/"
 * (see the lib/queries/reports.ts header).
 */
import { createContext, useCallback, useContext, useMemo } from "react";
import type { ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import type { inferRouterInputs } from "@trpc/server";
import type { AppRouter } from "@workspace-welcome/api/routers/index";

import { useTRPC } from "@/utils/trpc";

/** The `settings.update` procedure input, inferred — never hand-mirrored. */
type SettingsUpdateInput = inferRouterInputs<AppRouter>["settings"]["update"];

/**
 * The raw `settings.get` result as the provider exposes it. Derived from the
 * call itself so the tRPC client-error type rides along exactly — a plain
 * `UseQueryResult<Settings>` would drop it (tRPC results error as
 * `TRPCClientErrorLike`, not `Error`).
 */
function useSettingsGetQuery() {
  const trpc = useTRPC();
  return useQuery(trpc.settings.get.queryOptions());
}

export interface SettingsContextValue {
  /** The raw settings query result — exposed, never copied. */
  settings: ReturnType<typeof useSettingsGetQuery>;
  /** Editor open command ("code", "cursor", …); undefined while loading. */
  editorCommand: string | undefined;
  /** Terminal open command; null disables the action; undefined while loading. */
  terminalCommand: string | null | undefined;
  /** gitsnitch CLI path; null = auto-resolve (ADR-0001); undefined while loading. */
  snitchPath: string | null | undefined;
  /**
   * Persist new settings: the `settings.update` mutation wrapper. Writes
   * through, then invalidates the `settings.get` entry so every consumer
   * re-reads the persisted shape. The wrapper returns void, so both toasts
   * live here — failure names the error, success confirms the save ("Settings
   * saved", the legacy settings page's contract).
   */
  update(input: SettingsUpdateInput): void;
  /** True while an update write is in flight — save buttons disable on it. */
  saving: boolean;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

/**
 * Throwing accessor (§3.4 enforcement a) — widgets require the provider;
 * a null-default context turns a missing mount into a loud error instead
 * of silently undefined data.
 */
export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (ctx === null) {
    throw new Error(
      "SettingsProvider missing — a widget requires it, but no SettingsProvider is mounted above. Mount the widget provider stack (settings first) around the page.",
    );
  }
  return ctx;
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const settings = useSettingsGetQuery();

  const updateMutation = useMutation(
    trpc.settings.update.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries({
          queryKey: trpc.settings.get.queryKey(),
        });
        toast.success("Settings saved");
      },
      onError: (e) => toast.error(e.message),
    }),
  );

  const update = useCallback(
    (input: SettingsUpdateInput) => {
      updateMutation.mutate(input);
    },
    [updateMutation],
  );

  const value = useMemo<SettingsContextValue>(
    () => ({
      settings,
      editorCommand: settings.data?.editorCommand,
      terminalCommand: settings.data?.terminalCommand,
      snitchPath: settings.data?.snitchPath,
      update,
      saving: updateMutation.isPending,
    }),
    [settings, update, updateMutation.isPending],
  );

  return (
    <SettingsContext.Provider value={value}>
      {/* Provider stamp (§3.4): this provider's own lower-case key on its
          root; nested providers add theirs, so the page's full mount order
          is legible from the DOM. */}
      <div data-providers="settings">{children}</div>
    </SettingsContext.Provider>
  );
}
