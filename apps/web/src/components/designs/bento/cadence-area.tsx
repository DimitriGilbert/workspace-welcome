/**
 * Monthly cadence as a filled AREA (time series -> area; bars stay reserved
 * for comparisons). Pure SVG so it stays cheap inside a mosaic tile; the
 * flex container gives it the full remaining height.
 */
export function CadenceArea({ cadence }: { cadence: { period: string; commits: number }[] }) {
  const points = cadence.slice(-12);
  const max = Math.max(...points.map((p) => p.commits), 1);
  const step = points.length > 1 ? 100 / (points.length - 1) : 100;
  // A single-month history still draws a level line, not a degenerate sliver.
  const coords =
    points.length === 1
      ? [
          { x: 0, y: 30 - (points[0].commits / max) * 26 },
          { x: 100, y: 30 - (points[0].commits / max) * 26 },
        ]
      : points.map((p, i) => ({
          x: i * step,
          y: 30 - (p.commits / max) * 26,
        }));
  const line = coords
    .map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`)
    .join(" ");
  const area = points.length ? `${line} L100,32 L0,32 Z` : "";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <svg
        viewBox="0 0 100 32"
        preserveAspectRatio="none"
        className="min-h-0 w-full flex-1"
        role="img"
        aria-label={`Commits per month: ${points.map((p) => `${p.period} ${p.commits}`).join(", ")}`}
      >
        <defs>
          <linearGradient id="bento-tile-cadence" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--bento-c1)" stopOpacity="0.45" />
            <stop offset="100%" stopColor="var(--bento-c1)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#bento-tile-cadence)" />
        <path
          d={line}
          fill="none"
          stroke="var(--bento-c1)"
          strokeWidth="1.6"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="flex justify-between font-mono text-[0.52rem] text-muted-foreground">
        <span>{points[0]?.period.slice(5)}</span>
        <span>{points.at(-1)?.period.slice(5)}</span>
      </div>
    </div>
  );
}

