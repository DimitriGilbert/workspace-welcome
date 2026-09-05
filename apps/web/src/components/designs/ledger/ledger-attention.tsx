import type { AlertCode, Project } from "@workspace-welcome/api/lib/types";

import { dateTooltip, relativeTime } from "@/lib/format";
import { useOpenProject } from "@/lib/open-project";

export interface AttentionEntry {
  project: Project;
  code: AlertCode;
  severity: "error" | "warn";
  message: string;
}

/**
 * The needs-attention ledger: every error- and warn-level alert across the
 * visible index, one line each, severity carried by the weight and color of
 * the rule in the left margin (errors heavy crimson, warnings gold). Info
 * notes stay on the index rows themselves.
 */
export function LedgerAttention({ entries }: { entries: AttentionEntry[] }) {
  const openProject = useOpenProject();

  return (
    <section aria-label="Needs attention">
      <div className="ledger-section-head">
        <h2>Needs attention</h2>
        <span className="ledger-section-count">{entries.length}</span>
        <span className="ledger-section-rule" aria-hidden />
      </div>

      {entries.length === 0 ? (
        <p className="ledger-serif mt-3 text-base italic text-muted-foreground">
          All entries in order.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col">
          {entries.map((entry) => (
            <li
              key={`${entry.project.path}:${entry.code}`}
              className="ledger-attention-row"
              style={{
                borderLeftColor:
                  entry.severity === "error"
                    ? "var(--sev-error)"
                    : "var(--sev-warn)",
              }}
            >
              <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5">
                <button
                  type="button"
                  onClick={() => openProject(entry.project.path)}
                  className="ledger-name-btn ledger-serif text-[1.05rem] font-medium"
                >
                  {entry.project.name}
                </button>
                <span
                  className={
                    "ledger-cap " +
                    (entry.severity === "error"
                      ? "text-sev-error"
                      : "text-sev-warn")
                  }
                >
                  {entry.severity === "error" ? "error" : "warning"}
                </span>
                <span className="font-mono text-xs text-muted-foreground">
                  {entry.message}
                </span>
              </div>
              <span
                className="justify-self-end font-mono text-[0.7rem] tabular-nums text-muted-foreground"
                title={dateTooltip(entry.project.updatedAt)}
              >
                {relativeTime(entry.project.updatedAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
