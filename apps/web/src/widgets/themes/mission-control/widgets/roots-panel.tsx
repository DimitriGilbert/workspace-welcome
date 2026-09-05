/**
 * McRoots — the registered-roots ledger (T2 port of the design's
 * `RootsPanel`): one row per tracked root with its live project count, the
 * scan's read errors surfaced under the register, and the Manage link to
 * settings. The roots query result is exposed raw by the workspace context
 * (never copied); per-root counts derive from the working set.
 */
import { useMemo } from "react";

import { KvList } from "@workspace-welcome/ui/components/kv-list";
import { Skeleton } from "@workspace-welcome/ui/components/skeleton";

import { useWorkspace } from "@/widgets/contexts/workspace-context";
import type { RegisteredWidgetProps } from "@/widgets/registry";
import { WidgetShell } from "@/widgets/runtime/widget-shell";

export function McRoots(_props: RegisteredWidgetProps) {
  const workspace = useWorkspace();
  const roots = workspace.roots;

  const rows = useMemo(
    () =>
      (roots.data ?? []).map((root) => ({
        label: root.label.length > 0 ? root.label : root.path,
        count: workspace.projects.filter((p) => p.rootId === root.id).length,
      })),
    [roots.data, workspace.projects],
  );

  return (
    <WidgetShell
      className="h-full w-full"
      meta={
        <span className="font-mono text-[9.5px] tabular-nums text-muted-foreground">
          {roots.isError ? "unavailable" : `${roots.data?.length ?? 0} registered`}
        </span>
      }
    >
      <WidgetShell
        className="h-full w-full"
        sizes={{
          "1x1": (
            <div className="flex h-full min-h-0 w-full items-center overflow-hidden px-3 pb-2">
              <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
                {roots.isError ? "unavailable" : `${roots.data?.length ?? 0} roots`}
              </p>
            </div>
          ),
          "2x2": (
            <div className="flex h-full min-h-0 w-full min-w-0 flex-col gap-2 overflow-hidden px-3 pb-2">
              {roots.isPending ? (
                <div className="flex flex-col gap-2 py-1">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              ) : roots.isError ? (
                <p role="alert" className="font-mono text-[10px] leading-relaxed text-(--sev-critical)">
                  {roots.error?.message ?? "roots unavailable"}
                </p>
              ) : (
                <>
                  <KvList
                    density="compact"
                    rows={rows.map((r) => ({ label: r.label, value: String(r.count), mono: true }))}
                  />
                  {workspace.rootErrors.map((e) => (
                    <p key={e.rootId} className="font-mono text-[10px] leading-relaxed text-(--sev-critical)">
                      Unreadable <span className="break-all">{e.path}</span>: {e.message}
                    </p>
                  ))}
                  <a
                    href="/settings"
                    className="mt-auto inline-flex shrink-0 items-center gap-0.5 self-start font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground outline-none transition-colors hover:text-(--mc-accent)"
                  >
                    Manage ↗
                  </a>
                </>
              )}
            </div>
          ),
        }}
      >
        <div className="flex h-full min-h-0 w-full items-center overflow-hidden px-3 pb-2">
          <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
            {roots.isError ? "unavailable" : `${roots.data?.length ?? 0} roots`}
          </p>
        </div>
      </WidgetShell>
    </WidgetShell>
  );
}
