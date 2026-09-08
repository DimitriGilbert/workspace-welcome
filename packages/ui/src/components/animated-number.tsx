import { useEffect } from "react";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "motion/react";

import { cn } from "@workspace-welcome/ui/lib/utils";
import { EASE, fade as fadeTransition } from "@workspace-welcome/ui/lib/motion";

/**
 * AnimatedNumber — THE animated numeral: one value, three motion flavors.
 * Ported (read-only) from meadow's `SoftNumber` (fade), bento's
 * `RollNumber` (roll), and MC's spring-chase `AnimatedNumeral` (spring).
 *
 * `"fade"` and `"roll"` present each new value as it arrives; `"spring"`
 * chases numeric values with a motion spring (string values fall back to a
 * fade — there is nothing to tween between). Reduced motion swaps instantly.
 */
export type AnimatedNumberMotion = "fade" | "roll" | "spring";

export interface AnimatedNumberProps {
  value: string | number;
  /** Motion flavor; `"fade"` (calm) is the default. */
  motion?: AnimatedNumberMotion;
  className?: string;
  style?: React.CSSProperties;
}

export const MIN_CONTENT = { w: 32, h: 16 };

export function AnimatedNumber({
  value,
  motion: flavor = "fade",
  className,
  style,
}: AnimatedNumberProps) {
  const reduced = useReducedMotion();
  const numeric = typeof value === "number";
  const raw = useMotionValue(numeric ? value : 0);
  const spring = useSpring(raw, { stiffness: 320, damping: 30, mass: 0.6 });
  const chased = useTransform(spring, (v) => String(Math.round(v)));

  useEffect(() => {
    raw.set(numeric ? value : 0);
  }, [raw, numeric, value]);

  if (reduced) {
    return (
      <span className={cn("inline-block tabular-nums", className)} style={style}>
        {value}
      </span>
    );
  }

  if (flavor === "spring" && numeric) {
    return (
      <motion.span
        className={cn("inline-block tabular-nums", className)}
        style={style}
      >
        {chased}
      </motion.span>
    );
  }

  const roll = flavor === "roll";
  return (
    <span
      className={cn(
        "relative inline-flex tabular-nums",
        roll ? "overflow-hidden" : "overflow-visible",
        className,
      )}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={String(value)}
          className="inline-block"
          style={style}
          initial={roll ? { y: "60%", opacity: 0 } : { opacity: 0, y: 3 }}
          animate={{ y: 0, opacity: 1 }}
          exit={roll ? { y: "-60%", opacity: 0 } : { opacity: 0, y: -3 }}
          transition={roll ? { duration: 0.3, ease: EASE } : fadeTransition}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
