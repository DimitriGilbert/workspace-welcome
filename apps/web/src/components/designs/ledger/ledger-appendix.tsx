import { Link } from "@tanstack/react-router";
import type { Root } from "@workspace-welcome/api/lib/types";

interface LedgerAppendixProps {
  roots: Root[];
  /** Scanned project count per root id. */
  rootCounts: Map<string, number>;
  rootErrors: { rootId: string; path: string; message: string }[];
  canClone: boolean;
  canReport: boolean;
  onAddRoot: () => void;
  onCreate: () => void;
  onClone: () => void;
  onReport: () => void;
}

const ROMAN = ["i", "ii", "iii", "iv", "v"] as const;

/**
 * The appendix: registered roots with their entry counts, marginal notes for
 * roots that could not be read, and the page's operations as a typed list
 * instead of buttons. On narrow layouts the sections auto-fit into a band;
 * on the ledger spread it holds the right margin.
 */
export function LedgerAppendix({
  roots,
  rootCounts,
  rootErrors,
  canClone,
  canReport,
  onAddRoot,
  onCreate,
  onClone,
  onReport,
}: LedgerAppendixProps) {
  const operations = [
    { label: "Add a root directory", action: onAddRoot, disabled: false },
    { label: "Create a project", action: onCreate, disabled: false },
    { label: "Compile clone script", action: onClone, disabled: !canClone },
    { label: "Compile health report", action: onReport, disabled: !canReport },
  ];

  return (
    <section aria-label="Appendix">
      <div className="ledger-section-head">
        <h2>Appendix</h2>
        <span className="ledger-section-rule" aria-hidden />
      </div>

      <div className="ledger-appendix-body mt-3">
        <div>
          <h3 className="ledger-cap">Roots</h3>
          <ul className="mt-1 flex flex-col">
            {roots.map((root) => {
              const label =
                root.label.trim().length > 0
                  ? root.label
                  : (root.path.split("/").filter(Boolean).at(-1) ?? root.path);
              return (
                <li key={root.id} className="ledger-root-row">
                  <div className="min-w-0">
                    <p className="ledger-serif text-[0.98rem] font-medium leading-snug">
                      {label}
                    </p>
                    <p
                      className="truncate font-mono text-[0.65rem] text-muted-foreground"
                      title={root.path}
                    >
                      {root.path}
                    </p>
                  </div>
                  <span className="ledger-serif text-lg tabular-nums text-muted-foreground">
                    {rootCounts.get(root.id) ?? 0}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        {rootErrors.length > 0 ? (
          <div>
            <h3 className="ledger-cap">Marginalia</h3>
            <ul className="mt-1 flex flex-col gap-1.5">
              {rootErrors.map((e) => (
                <li
                  key={e.rootId}
                  className="ledger-marginalia-row"
                  style={{ borderLeftColor: "var(--sev-error)" }}
                >
                  <p className="font-mono text-[0.68rem] leading-relaxed text-muted-foreground">
                    Couldn&rsquo;t read{" "}
                    <span className="text-foreground">{e.path}</span>:{" "}
                    {e.message}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div>
          <h3 className="ledger-cap">Operations</h3>
          <ol className="mt-1 flex flex-col">
            {operations.map((op, i) => (
              <li key={op.label}>
                <button
                  type="button"
                  onClick={op.action}
                  disabled={op.disabled}
                  className="ledger-op-link"
                >
                  <span className="w-6 shrink-0 font-mono text-[0.65rem] text-muted-foreground">
                    {ROMAN[i]}
                  </span>
                  <span className="ledger-serif">{op.label}</span>
                </button>
              </li>
            ))}
            <li>
              <Link to="/settings" className="ledger-op-link">
                <span className="w-6 shrink-0 font-mono text-[0.65rem] text-muted-foreground">
                  {ROMAN[4]}
                </span>
                <span className="ledger-serif">Settings</span>
              </Link>
            </li>
          </ol>
        </div>
      </div>
    </section>
  );
}
