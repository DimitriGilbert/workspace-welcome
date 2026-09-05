/**
 * scan-metrics — the ONE pure-TS derivation module for scan and report data.
 * The only import surface widgets/themes should use. No React, no color
 * tokens (fills belong to parts/packages-ui); every time-dependent function
 * takes `now` as a defaulted parameter (SSR-safe).
 */

export * from "./severity";
export * from "./activity";
export * from "./pulse";
export * from "./fleet";
export * from "./stacks";
export * from "./report";
