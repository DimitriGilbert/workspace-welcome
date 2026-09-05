/**
 * Widget-lab page body (master plan §5 W4) — dev-only, mounted by
 * `/app/__lab`.
 *
 * Two modes:
 *
 * - **Lab** (default): the full runtime workout — RenderLayout over the
 *   synthetic lab preset (every registry widget × every ladder rung + the
 *   `"projects"` flow), console keys live, drag/resize affordances on.
 *   This is the harness `--suite lab` target and the W3 interaction
 *   payoff surface.
 * - **Self-test** (`?self-test=1`): M2's known-bad panel folded in from the
 *   deleted temporary `/app/__check` route, byte for byte. Every probe must
 *   FAIL it (inverted suite contract) — mounting it anywhere near the lab
 *   board would poison the green suite, so the flag swaps the page body
 *   entirely; it is the SAME negative fixture at its new address.
 */
import "./lab-tokens.css";

import { RenderLayout } from "../runtime/render-layout";
import { SelfTestPanel } from "./self-test";
import { LAB_THEME, labConsoleViews, labPreset } from "./lab-preset";

export function LabPage({ selfTest }: { selfTest: boolean }) {
  if (selfTest) {
    return <SelfTestPanel />;
  }
  return (
    <RenderLayout
      theme={LAB_THEME}
      preset={labPreset}
      page="lab"
      projectPath="/lab-fixture"
      headerLabel={`Widget lab — ${labPreset.regions.length} regions, 12-col ladder`}
      consoleViews={labConsoleViews}
    />
  );
}
