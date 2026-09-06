import { AnimatePresence, motion } from "motion/react";

import { cn } from "@workspace-welcome/ui/lib/utils";

interface RollNumberProps {
  value: number;
  className?: string;
  style?: React.CSSProperties;
  /** Accessible text — defaults to the value itself. */
  label?: string;
}

/**
 * A numeral that rolls when its value changes: the old figure slides up and
 * out while the new one slides in. Pure feedback — the number itself is the
 * source of truth, this is only how it arrives.
 */
export function RollNumber({ value, className, style, label }: RollNumberProps) {
  return (
    <span className="relative inline-flex overflow-hidden" aria-label={label ?? String(value)}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          initial={{ y: "60%", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "-60%", opacity: 0 }}
          transition={{ duration: 0.3, ease: [0.2, 0.9, 0.3, 1] }}
          className={cn("inline-block tabular-nums", className)}
          style={style}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
