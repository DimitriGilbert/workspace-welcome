import { BentoTile } from "@/components/designs/bento/bento-tile";
import { STACK_RAMP } from "@/components/designs/bento/bento-metrics";
import type { StackSlice } from "@/components/designs/bento/bento-metrics";


interface StackTileProps {
  slices: StackSlice[];
}

const R = 44;
const CIRC = 2 * Math.PI * R;
const GAP = 2.5;

/**
 * Stack mix: one donut plus a legend whose rows carry proportion BARS, so
 * the tile's full width works for the data at every span — no centered
 * cluster floating in dead space. Padding is the band-standard 20px.
 */
export function StackTile({ slices }: StackTileProps) {
  const total = slices.reduce((sum, s) => sum + s.count, 0);

  let offset = 0;
  const segments = slices.map((s, i) => {
    const frac = total === 0 ? 0 : s.count / total;
    const dash = Math.max(frac * CIRC - GAP, 0.75);
    const seg = { slice: s, dash, offset, color: STACK_RAMP[i % STACK_RAMP.length] };
    offset += frac * CIRC;
    return seg;
  });

  return (
    <BentoTile span="sp-stack" className="b-band-h flex flex-col gap-3 p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="b-label">Stack mix</h2>
        <span className="font-mono text-[0.68rem] text-muted-foreground">
          by manifest
        </span>
      </div>

      {total === 0 ? (
        <p className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          No projects match the filter.
        </p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col justify-center gap-3">
          <div className="flex items-center gap-4">
            <div className="relative size-[112px] shrink-0">
              <svg viewBox="0 0 120 120" className="block size-full" aria-hidden>
                <circle
                  cx="60"
                  cy="60"
                  r={R}
                  fill="none"
                  stroke="oklch(1 0 0 / 0.06)"
                  strokeWidth={14}
                />
                {segments.map((seg) => (
                  <circle
                    key={seg.slice.id}
                    cx="60"
                    cy="60"
                    r={R}
                    fill="none"
                    strokeWidth={14}
                    style={{ stroke: seg.color }}
                    strokeDasharray={`${seg.dash} ${CIRC - seg.dash}`}
                    strokeDashoffset={-seg.offset}
                    transform="rotate(-90 60 60)"
                  />
                ))}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="b-num text-[26px]">{total}</span>
                <span className="b-label mt-0.5">projects</span>
              </div>
            </div>

            {/* Aggregate line next to the donut keeps the top zone dense. */}
            <p className="min-w-0 flex-1 text-xs leading-relaxed text-muted-foreground">
              <span className="b-num text-foreground/90">{segments[0]?.slice.label}</span>{" "}
              leads with {segments[0]?.slice.count} of {total} projects
              {segments.length > 1
                ? `; ${segments.slice(1).map((s) => s.slice.label).join(", ")} fill the rest.`
                : "."}
            </p>
          </div>

          <ul className="flex flex-col gap-1.5">
            {segments.map((seg) => {
              const pct = Math.round((seg.slice.count / total) * 100);
              return (
                <li key={seg.slice.id} className="flex items-center gap-2.5 text-xs">
                  <span
                    aria-hidden
                    className="size-2 shrink-0 rounded-[3px]"
                    style={{ background: seg.color }}
                  />
                  <span className="w-20 shrink-0 truncate text-muted-foreground" title={seg.slice.label}>
                    {seg.slice.label}
                  </span>
                  <span className="b-dirtybar min-w-0 flex-1">
                    <span style={{ width: `${Math.max(pct, 4)}%`, background: seg.color }} />
                  </span>
                  <span className="b-num w-6 shrink-0 text-right text-sm">{seg.slice.count}</span>
                  <span className="w-8 shrink-0 text-right font-mono text-[0.62rem] text-muted-foreground">
                    {pct}%
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </BentoTile>
  );
}
