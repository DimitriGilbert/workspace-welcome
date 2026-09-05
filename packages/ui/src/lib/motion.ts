/**
 * Shared motion constants for the widget system (consumed with the `motion`
 * library — structurally compatible with its `Transition` type).
 */

/** Signature ease-out cubic bezier used by rolls and emphasis motion. */
export const EASE: [number, number, number, number] = [0.2, 0.9, 0.3, 1];

/** Fade transition (opacity). */
export const fade: { duration: number } = { duration: 0.15 };

/** Swap transition (content replace). */
export const swap: { duration: number } = { duration: 0.2 };

/** Roll transition (value/segment roll) on the signature ease. */
export const roll: { duration: number; ease: [number, number, number, number] } = {
  duration: 0.3,
  ease: EASE,
};

/** Layout transition for grid reflow (widget packing moves). */
export const layout: {
  type: "spring";
  stiffness: number;
  damping: number;
} = { type: "spring", stiffness: 300, damping: 30 };
