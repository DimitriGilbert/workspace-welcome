import { cn } from "@workspace-welcome/ui/lib/utils";

/**
 * ScoreRing + ScoreChip — two presentations of ONE score source: the
 * shared mosaic log-scaled recency 0..1. The ring is bento's `RecencyRing`
 * sweep (tier colors removed — tokens only) and mb's 14 px micro version;
 * the chip is meadow's linear `ScoreChip`. Tokens-only: the default color
 * is the theme's `--recency-fresh`.
 */

export interface ScoreRingProps {
  /** Log-scaled set-relative recency 0..1 (clamped). */
  score: number;
  /** Accessible/hover description; defaults to the percentage reading. */
  label?: string;
  /** Ring diameter in px (14 = the micro floor). */
  size?: number;
  color?: string;
  className?: string;
}

export const MIN_CONTENT = { w: 14, h: 14 };

export function ScoreRing({
  score,
  label,
  size = 14,
  color = "var(--recency-fresh)",
  className,
}: ScoreRingProps) {
  const stroke = size >= 26 ? 3 : 2;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const sweep = Math.max(0.02, Math.min(1, score));
  const text = label ?? `Recency ${Math.round(score * 100)}% of set`;

  return (
    <span
      data-part="score-ring"
      role="img"
      aria-label={text}
      title={text}
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center",
        className,
      )}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden
        className="-rotate-90"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="color-mix(in oklch, var(--foreground) 10%, transparent)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${sweep * c} ${c}`}
        />
      </svg>
    </span>
  );
}

export interface ScoreChipProps {
  /** Log-scaled set-relative recency 0..1 (clamped). */
  score: number;
  /** Accessible/hover description; defaults to the freshness reading. */
  label?: string;
  className?: string;
}

export function ScoreChip({ score, label, className }: ScoreChipProps) {
  const pct = Math.round(Math.max(0, Math.min(1, score)) * 100);
  const color = "var(--recency-fresh)";
  const text = label ?? `Freshness within the workspace (log-scaled): ${pct}%`;

  return (
    <span
      data-part="score-chip"
      role="img"
      aria-label={text}
      title={text}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full py-0.5 pr-2 pl-1.5 text-[10px] font-medium tabular-nums",
        className,
      )}
      style={{
        color,
        backgroundColor: "color-mix(in oklch, var(--recency-fresh) 11%, transparent)",
      }}
    >
      <span
        aria-hidden
        className="h-1 w-8 overflow-hidden rounded-full"
        style={{
          backgroundColor: "color-mix(in oklch, var(--recency-fresh) 22%, var(--muted))",
        }}
      >
        <span
          className="block h-full rounded-full"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </span>
      {pct}% fresh
    </span>
  );
}
