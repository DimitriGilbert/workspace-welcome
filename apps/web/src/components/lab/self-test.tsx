/**
 * Self-test panel — the harness's known-bad fixture (master plan §3.8, M2.8).
 *
 * Mounted on the dev-only lab route `/app/__lab?self-test=1` (folded in at
 * W4, replacing the temporary `/app/__check` route). It deliberately renders
 * ONE broken element per probe, so `run.mjs --suite self-test` must see
 * EVERY probe report FAIL — expected failures that prove detection:
 *
 *   1. token-completeness — the scope uses theme id "__check", which declares
 *      none of the required tokens.
 *   2. placement — two widget frames claim the same grid cells (overlap), and
 *      one frame's `data-x` disagrees with its computed column.
 *   3. density — a widget whose content fills a fraction of its content box.
 *   4. no-inner-scroll — a plain scrollable container inside the scope.
 *   5. portal-scope — a dialog portaled OUTSIDE the scope with a divergent
 *      `--background` (token-based, so this file stays color-literal-free).
 *   6. part-min — a part box far below its declared `data-part-min-w/h`, plus
 *      horizontal overflow inside the scope.
 *
 * Geometry is inline-px on purpose: the probes measure the live box, and the
 * fixture must not depend on theme CSS (which, for "__check", does not exist
 * by design). Everything here is deliberately WRONG — never copy from this
 * file; it is a negative reference, not an example.
 */
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";

import { ThemeScope } from "@workspace-welcome/ui/components/theme-scope";

/** 3. density — a big content box with a tiny occupant. */
function SparseWidgetFrame() {
  return (
    <div
      data-widget="sparse-widget"
      data-x={3}
      data-y={0}
      data-cols={1}
      data-rows={2}
      data-size="1x2"
      style={{ gridColumn: "4 / span 1", gridRow: "1 / span 2" }}
    >
      <div data-slot="widget-shell" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <div data-slot="widget-shell-content" style={{ flex: 1 }}>
          <span style={{ display: "inline-block", width: 40, height: 20 }} className="bg-muted">
            sparse
          </span>
        </div>
      </div>
    </div>
  );
}

/** 2. placement — overlapping frames + an inconsistent data-x. */
function BadPlacementBoard() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(true);
  }, []);
  return (
    <div data-widget-board="self-test" data-ready={ready ? "" : undefined}>
      <div
        data-region="self-test-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gridAutoRows: "96px",
          gap: 12,
        }}
      >
        <div
          data-widget="overlap-a"
          data-x={0}
          data-y={0}
          data-cols={2}
          data-rows={1}
          data-size="2x1"
          style={{ gridColumn: "1 / span 2", gridRow: "1 / span 1" }}
          className="border border-dashed"
        >
          <div style={{ width: "100%", height: "100%" }} className="bg-muted" />
        </div>
        <div
          data-widget="overlap-b"
          data-x={0}
          data-y={0}
          data-cols={2}
          data-rows={1}
          data-size="2x1"
          style={{ gridColumn: "1 / span 2", gridRow: "1 / span 1" }}
          className="border border-dashed"
        >
          <div style={{ width: "100%", height: "100%" }} className="bg-muted" />
        </div>
        {/* Declares column 5, sits in column 3 — data-attr vs computed mismatch. */}
        <div
          data-widget="misplaced-x"
          data-x={5}
          data-y={0}
          data-cols={1}
          data-rows={1}
          data-size="1x1"
          style={{ gridColumn: "3 / span 1", gridRow: "1 / span 1" }}
          className="border border-dashed"
        />
        <SparseWidgetFrame />
      </div>
    </div>
  );
}

export function SelfTestPanel() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <ThemeScope theme="__check" data-ww-page="self-test">
      <div className="mx-auto flex max-w-4xl flex-col gap-5 px-5 py-6">
        <header className="flex flex-col gap-1">
          <p className="font-mono text-[0.65rem] uppercase tracking-widest text-muted-foreground">
            widget-check · self-test fixture
          </p>
          <h1 className="text-sm font-semibold tracking-tight">
            Every probe on this page is supposed to FAIL
          </h1>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Negative fixture — each element below breaks exactly one harness
            probe; the self-test suite passes only when all six report FAIL
            here. Reachable at{" "}
            <span className="font-mono">/app/__lab?self-test=1</span>; the lab
            board lives at <span className="font-mono">/app/__lab</span>.
          </p>
        </header>

        <section className="flex flex-col gap-1">
          <h2 className="font-mono text-[0.65rem] uppercase tracking-widest text-muted-foreground">
            placement + density (board)
          </h2>
          <BadPlacementBoard />
        </section>

        <section className="flex flex-col gap-1">
          <h2 className="font-mono text-[0.65rem] uppercase tracking-widest text-muted-foreground">
            no-inner-scroll
          </h2>
          <div style={{ height: 80, overflowY: "auto" }} className="border">
            <div style={{ height: 400 }} className="bg-muted" />
          </div>
        </section>

        <section className="flex flex-col gap-1">
          <h2 className="font-mono text-[0.65rem] uppercase tracking-widest text-muted-foreground">
            part-min + horizontal overflow
          </h2>
          <div
            data-part="self-test-under-min"
            data-part-min-w="480"
            data-part-min-h="240"
            style={{ width: 120, height: 60 }}
            className="border border-dashed"
          />
          <div style={{ position: "relative", height: 8 }}>
            <div style={{ width: 2400, height: 8 }} className="bg-muted" />
          </div>
        </section>
      </div>

      {mounted
        ? createPortal(
            /* 5. portal-scope — portals OUTSIDE the scope with a divergent,
             * token-based --background. */
            <div
              role="dialog"
              data-check-portal="self-test"
              style={
                {
                  position: "fixed",
                  top: 8,
                  right: 8,
                  padding: 12,
                  background: "var(--card)",
                  "--background": "var(--primary)",
                } as CSSProperties
              }
              className="border"
            >
              <p className="text-xs">self-test dialog — must portal outside the theme scope</p>
            </div>,
            document.body,
          )
        : null}
    </ThemeScope>
  );
}
