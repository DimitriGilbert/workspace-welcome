interface LedgerFiguresProps {
  figures: {
    entries: number;
    pinned: number;
    dirty: number;
    unpushed: number;
  };
  /** Entries touched per week, oldest first, 12 buckets. */
  weekly: number[];
  stacks: { label: string; count: number }[];
  severity: { error: number; warn: number; info: number };
}

/**
 * The figures rail: oversized display numerals plus three restrained,
 * print-like visualizations computed from the scan (weekly activity comb,
 * hatched stack bar, alert tally). No gloss; rules, hatching and ink.
 */
export function LedgerFigures({
  figures,
  weekly,
  stacks,
  severity,
}: LedgerFiguresProps) {
  const maxWeek = Math.max(1, ...weekly);
  const stackSummary = stacks
    .map((s) => `${s.label} ${s.count}`)
    .join(", ");

  return (
    <section aria-label="Figures">
      <div className="ledger-section-head">
        <h2>Figures</h2>
        <span className="ledger-section-rule" aria-hidden />
      </div>

      <div className="ledger-figures-grid mt-1">
        <FigureBlock value={figures.entries} label="entries in the index" big />
        <FigureBlock value={figures.pinned} label="pinned" />
        <FigureBlock value={figures.dirty} label="uncommitted files" />
        <FigureBlock value={figures.unpushed} label="commits unpushed" />
      </div>

      <figure className="ledger-fig">
        <div
          className="ledger-comb"
          role="img"
          aria-label={`Entries touched per week over the last 12 weeks: ${weekly.join(", ")}`}
        >
          {weekly.map((count, i) => (
            <span
              key={i}
              data-empty={count === 0 ? "" : undefined}
              style={{ height: `${Math.max(4, (count / maxWeek) * 100)}%` }}
            />
          ))}
        </div>
        <figcaption className="ledger-cap mt-2">
          entries touched per week, last 12 weeks
        </figcaption>
      </figure>

      <figure className="ledger-fig">
        <div
          className="ledger-stackbar"
          role="img"
          aria-label={`Entries by detected stack: ${stackSummary}`}
        >
          {stacks.map((s, i) => (
            <span
              key={s.label}
              className={`ledger-hatch ledger-hatch-${i % 6}`}
              style={{ flexGrow: s.count }}
              title={`${s.label}: ${s.count}`}
            />
          ))}
        </div>
        <figcaption className="ledger-cap mt-2">
          entries by detected stack
        </figcaption>
        <ul className="mt-2 flex flex-col gap-1">
          {stacks.map((s, i) => (
            <li key={s.label} className="ledger-legend-row">
              <span
                className={`ledger-hatch ledger-hatch-${i % 6} ledger-swatch`}
                aria-hidden
              />
              <span className="truncate text-foreground">{s.label}</span>
              <span className="ml-auto tabular-nums text-muted-foreground">
                {s.count}
              </span>
            </li>
          ))}
        </ul>
      </figure>

      <div
        className="ledger-fig grid grid-cols-3 gap-2"
        role="group"
        aria-label="Alert tally"
      >
        <SeverityFigure count={severity.error} label="errors" tone="text-sev-error" />
        <SeverityFigure count={severity.warn} label="warnings" tone="text-sev-warn" />
        <SeverityFigure count={severity.info} label="notes" tone="text-sev-info" />
      </div>
    </section>
  );
}

function FigureBlock({
  value,
  label,
  big = false,
}: {
  value: number;
  label: string;
  big?: boolean;
}) {
  return (
    <div className="ledger-fig">
      <p
        className={
          "ledger-serif tabular-nums font-medium tracking-tight ledger-fig-num" +
          (big ? " ledger-fig-num-big" : "")
        }
      >
        {value}
      </p>
      <p className="ledger-cap mt-2">{label}</p>
    </div>
  );
}

function SeverityFigure({
  count,
  label,
  tone,
}: {
  count: number;
  label: string;
  tone: string;
}) {
  return (
    <div>
      <p
        className={
          "ledger-serif text-[1.75rem] leading-none tabular-nums " +
          (count > 0 ? tone : "text-muted-foreground")
        }
      >
        {count}
      </p>
      <p className={"ledger-cap mt-1.5 " + tone}>{label}</p>
    </div>
  );
}
