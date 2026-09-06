import { useEffect } from "react";
import type { RefObject } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "motion/react";
import { RefreshCw, Search } from "lucide-react";

import { cn } from "@workspace-welcome/ui/lib/utils";
import type { FleetVitals } from "./metrics";

/**
 * One animated console numeral. The spring chases the incoming value so a
 * rescan makes the masthead count itself up/down instead of snapping —
 * motion with a job, not decoration. DOM order stays dt (label) then dd
 * (value); flex-col-reverse puts the numeral on top visually while keeping
 * valid description-list semantics.
 */
function AnimatedNumeral({
  value,
  tone,
}: {
  value: number;
  tone?: "warn" | "accent" | undefined;
}) {
  const raw = useMotionValue(value);
  const spring = useSpring(raw, { stiffness: 320, damping: 30, mass: 0.6 });
  const text = useTransform(spring, (v) => String(Math.round(v)).padStart(2, "0"));
  useEffect(() => {
    raw.set(value);
  }, [value, raw]);

  return (
    <motion.dd
      className={cn(
        "font-mono text-[28px] leading-none font-medium tracking-tighter tabular-nums min-[2200px]:text-[34px]",
        tone === "warn" && "text-[var(--sev-warning)]",
        tone === "accent" && "text-[var(--mc-accent)]",
        !tone && "text-foreground",
      )}
    >
      {text}
    </motion.dd>
  );
}

/**
 * Masthead numerals. The fleet reports itself in six tabular figures before
 * a single project name appears: units, live-this-week, triage count, pins,
 * uncommitted files, unpushed commits. Color only where a threshold trips.
 */
export function VitalsBoard({ vitals }: { vitals: FleetVitals }) {
  const cells: { label: string; value: number; tone?: "warn" | "accent" }[] = [
    { label: "Units", value: vitals.total },
    { label: "Active 7d", value: vitals.activeWeek, tone: "accent" },
    { label: "Attention", value: vitals.attention, tone: vitals.attention > 0 ? "warn" : undefined },
    { label: "Pinned", value: vitals.pinned },
    { label: "Dirty files", value: vitals.dirtySum, tone: vitals.dirtySum > 0 ? "warn" : undefined },
    { label: "Unpushed", value: vitals.aheadSum, tone: "accent" },
  ];

  return (
    <dl className="flex flex-wrap items-end gap-x-8 gap-y-4 min-[2200px]:gap-x-12">
      {cells.map((cell) => (
        <div key={cell.label} className="flex flex-col-reverse gap-1">
          <dt className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-muted-foreground">
            {cell.label}
          </dt>
          <AnimatedNumeral value={cell.value} tone={cell.tone} />
        </div>
      ))}
    </dl>
  );
}

/**
 * Search + rescan + sync clock. `/` focuses the field (wired at route
 * level); the count readout keeps filtering honest; the fleet filter itself
 * executes inside the ledger table. Sorting lives on the table headers —
 * one control, one source of truth.
 */
export function CommandBar({
  query,
  onQueryChange,
  searchRef,
  resultCount,
  totalCount,
  onRescan,
  scanning,
  syncedLabel,
}: {
  query: string;
  onQueryChange: (q: string) => void;
  searchRef: RefObject<HTMLInputElement | null>;
  resultCount: number;
  totalCount: number;
  onRescan: () => void;
  scanning: boolean;
  syncedLabel: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
        />
        <input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") e.preventDefault();
          }}
          placeholder="Filter fleet"
          aria-label="Filter fleet"
          className="mc-input h-8 w-56 pr-10 pl-8 md:w-64"
        />
        <kbd aria-hidden className="mc-kbd absolute right-2 top-1/2 -translate-y-1/2">
          /
        </kbd>
      </div>

      <span
        className="font-mono text-[10px] tabular-nums text-muted-foreground"
        aria-live="polite"
      >
        {resultCount}/{totalCount}
      </span>

      <div className="ml-auto flex items-center gap-3">
        <span className="hidden font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground xl:inline">
          {scanning ? "Syncing…" : `Synced ${syncedLabel}`}
        </span>
        <button
          type="button"
          onClick={onRescan}
          disabled={scanning}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 border border-[var(--mc-line)] px-2.5",
            "font-mono text-[10px] uppercase tracking-[0.14em] text-foreground outline-none transition-colors",
            "hover:border-[color-mix(in_oklch,var(--mc-accent)_40%,var(--mc-line))] hover:text-[var(--mc-accent)]",
            "focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
          )}
        >
          <RefreshCw aria-hidden className={cn("size-3", scanning && "animate-spin")} />
          Rescan
        </button>
      </div>
    </div>
  );
}
