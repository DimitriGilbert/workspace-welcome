/**
 * McVitals — the console masthead (verbatim port of the design's
 * `VitalsBoard` + `AnimatedNumeral`, `components/designs/mission-control/
 * command-bar.tsx`). The fleet reports itself in six tabular figures before
 * a single project name appears — units, live-this-week, triage, pins,
 * uncommitted files, unpushed commits — color only where a threshold trips.
 *
 * Each numeral's spring chases the incoming value so a rescan makes the
 * masthead count itself up/down instead of snapping. DOM order stays dt
 * (label) then dd (value); flex-col-reverse puts the numeral on top
 * visually while keeping valid description-list semantics.
 *
 * The board places this on the canvas ground (the shell chrome is stripped
 * for the `masthead` node in custom.css), so the band reads exactly like
 * the design's sticky header vitals. The band fills its box (`h-full`
 * flex, items end-aligned) — the density contract — while the type scale
 * is the design's own.
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
        "font-mono text-[22px] leading-none font-medium tracking-tighter tabular-nums @[640px]:text-[28px] min-[2200px]:text-[34px]",
        tone === "warn" && "text-(--sev-warning)",
        tone === "accent" && "text-(--mc-accent)",
        !tone && "text-foreground",
      )}
    >
      {text}
    </motion.dd>
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
    <dl className="flex min-h-0 w-full min-w-0 flex-wrap items-end gap-x-5 gap-y-2 @[640px]:gap-x-8 @[640px]:gap-y-4 min-[2200px]:gap-x-12">
      {cells.map((cell) => (
        <div key={cell.label} className="flex flex-col-reverse gap-1">
          <dt className="font-mono text-[8.5px] uppercase tracking-[0.18em] text-muted-foreground @[640px]:text-[9.5px]">
            {cell.label}
          </dt>
          <AnimatedNumeral value={cell.value} tone={cell.tone} />
        </div>
      ))}
    </dl>
  );
}

export function McVitals(_props: RegisteredWidgetProps) {
  const { vitals } = useWorkspace();

  return (
    <WidgetShell className="h-full w-full">
      <div className="flex h-full min-h-0 w-full min-w-0 items-start overflow-hidden px-3 pt-3 pb-2 @[640px]:px-4 @[640px]:pt-5 @[640px]:pb-3 min-[2200px]:px-6">
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
