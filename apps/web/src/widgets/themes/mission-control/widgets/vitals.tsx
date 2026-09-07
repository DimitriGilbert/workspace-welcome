/**
 * McVitals — the console masthead (port of the design's `VitalsBoard` +
 * `AnimatedNumeral`, `components/designs/mission-control/command-bar.tsx`).
 *
 * Owner verdict (verbatim: "the values we had before were fine"): the band
 * is the compact SIX-figure cluster — Units, Active 7d, Attention, Pinned,
 * Dirty files, Unpushed — full words, content-sized cells, tight left-packed
 * rhythm with hairline dividers. No additional statistics, no stretching:
 * the node is sized to what the six figures need.
 *
 * Each numeral's spring chases the incoming value so a rescan makes the
 * masthead count itself up/down instead of snapping. DOM order stays dt
 * (label) then dd (value); the cell renders row-reverse so the numeral
 * leads visually while the description list stays valid.
 */
import { useEffect } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "motion/react";

import { cn } from "@workspace-welcome/ui/lib/utils";

import { useWorkspace } from "@/widgets/contexts/workspace-context";
import type { RegisteredWidgetProps } from "@/widgets/registry";
import { WidgetShell } from "@/widgets/runtime/widget-shell";

/**
 * One animated console numeral. The spring chases the incoming value so a
 * rescan makes the masthead count itself up/down instead of snapping.
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
        "font-mono text-[18px] leading-none font-medium tracking-tighter tabular-nums",
        "@[800px]:text-[30px]",
        tone === "warn" && "text-(--sev-warning)",
        tone === "accent" && "text-(--mc-accent)",
        !tone && "text-foreground",
      )}
    >
      {text}
    </motion.dd>
  );
}

/**
 * One instrument cell: numeral leading, caps label beside it, hairline
 * divider at the left edge (except the first cell) — content-sized.
 */
function InstrumentCell({
  label,
  value,
  tone,
  divider,
}: {
  label: string;
  value: number;
  tone?: "warn" | "accent";
  divider?: boolean;
}) {
  return (
    <div
      className={cn(
        // Row-reverse: the numeral leads visually while DOM order stays
        // dt → dd for valid description-list semantics. The divider only
        // applies on the wide strip (the narrow grid needs no dividers).
        "flex min-w-0 flex-row-reverse items-baseline gap-2",
        divider && "@[800px]:border-l @[800px]:border-(--mc-line) @[800px]:pl-4",
      )}
    >
      <dt className="min-w-0 truncate font-mono text-[9px] uppercase leading-tight tracking-[0.14em] text-muted-foreground @[800px]:text-[10px]">
        {label}
      </dt>
      <AnimatedNumeral value={value} tone={tone} />
    </div>
  );
}

/** The masthead's six figures, in the design's order and tone registers. */
function VitalsBoard({
  total,
  activeWeek,
  attention,
  pinned,
  dirtySum,
  aheadSum,
}: {
  total: number;
  activeWeek: number;
  attention: number;
  pinned: number;
  dirtySum: number;
  aheadSum: number;
}) {
  const cells: { label: string; value: number; tone?: "warn" | "accent" }[] = [
    { label: "Units", value: total },
    { label: "Active 7d", value: activeWeek, tone: "accent" },
    { label: "Attention", value: attention, tone: attention > 0 ? "warn" : undefined },
    { label: "Pinned", value: pinned },
    { label: "Dirty files", value: dirtySum, tone: dirtySum > 0 ? "warn" : undefined },
    { label: "Unpushed", value: aheadSum, tone: "accent" },
  ];

  return (
    // Narrow node (below the strip's 800px container floor — e.g. the 4-col
    // masthead at 1280): a 3-wide grid packs the six figures into two rows
    // with full labels — the grid cell always holds numeral + label uncut.
    // Wider: the strip (the FINAL owner image's register).
    <dl className="grid min-h-0 w-full min-w-0 grid-cols-3 gap-x-3 gap-y-3 @[800px]:flex @[800px]:items-baseline @[800px]:gap-x-6 overflow-hidden">
      {cells.map((cell, i) => (
        <InstrumentCell
          key={cell.label}
          label={cell.label}
          value={cell.value}
          tone={cell.tone}
          divider={i > 0}
        />
      ))}
    </dl>
  );
}

export function McVitals(_props: RegisteredWidgetProps) {
  const { vitals } = useWorkspace();

  return (
    <WidgetShell className="h-full w-full">
      {/* Centered in the band: the register reads as one flush strip. */}
      <div className="flex h-full min-h-0 w-full min-w-0 items-center overflow-hidden px-3 py-3 @[800px]:px-4 @[800px]:py-4">
        <VitalsBoard
          total={vitals.total}
          activeWeek={vitals.activeWeek}
          attention={vitals.attention}
          pinned={vitals.pinned}
          dirtySum={vitals.dirtySum}
          aheadSum={vitals.aheadSum}
        />
      </div>
    </WidgetShell>
  );
}
