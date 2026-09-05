/**
 * The attention band: triage as a compact horizontal strip, not a panel.
 * One honey-tinted row — severity summary chips, then one quiet chip per
 * flagged project that opens its page. Wraps to at most a couple of lines
 * and disappears entirely when there's nothing to see, so the grid keeps
 * the page.
 */

import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Bell, Plus } from "lucide-react";

import type { Project } from "@workspace-welcome/api/lib/types";

import { SoftNumber } from "@/components/designs/meadow/bits";
import { compactAge } from "@/components/designs/meadow/derive";

/** Chips shown before collapsing into a "+N more" chip. */
const PREVIEW_CHIPS = 8;

const CHIP_TONE = {
  error: "var(--sev-error)",
  warn: "var(--sev-warn)",
} as const;

export function AttentionBand({ projects }: { projects: Project[] }) {
  const [expanded, setExpanded] = useState(false);

  if (projects.length === 0) return null;

  const errorCount = projects.filter((p) =>
    p.alerts.some((a) => a.severity === "error"),
  ).length;
  const warnCount = projects.length - errorCount;
  const visible = expanded ? projects : projects.slice(0, PREVIEW_CHIPS);
  const hidden = projects.length - visible.length;

  return (
    <section
      id="meadow-attention"
      aria-label="Projects that need care"
      className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 rounded-full border px-4 py-2"
      style={{
        borderColor: "color-mix(in oklch, var(--sev-warn) 24%, var(--border))",
        background: "color-mix(in oklch, var(--sev-warn) 5%, var(--card))",
      }}
    >
      <span
        aria-hidden
        className="flex size-5 shrink-0 items-center justify-center rounded-full"
        style={{
          color: "var(--sev-warn)",
          background: "color-mix(in oklch, var(--sev-warn) 14%, transparent)",
        }}
      >
        <Bell className="size-3" />
      </span>
      <span className="flex items-center gap-1.5 text-xs font-semibold tracking-tight text-foreground">
        Needs care
        <span className="font-normal text-muted-foreground">
          {errorCount > 0 ? (
            <>
              <SoftNumber
                value={errorCount}
                className="tabular-nums"
                style={{ color: "var(--sev-error)" }}
              />{" "}
              {errorCount === 1 ? "error" : "errors"}
            </>
          ) : null}
          {errorCount > 0 && warnCount > 0 ? " · " : null}
          {warnCount > 0 ? (
            <>
              <SoftNumber
                value={warnCount}
                className="tabular-nums"
                style={{ color: "var(--sev-warn)" }}
              />{" "}
              {warnCount === 1 ? "warning" : "warnings"}
            </>
          ) : null}
        </span>
      </span>

      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
        {visible.map((p) => {
          const worst = p.alerts.find((a) => a.severity === "error")
            ? "error"
            : "warn";
          const message =
            p.alerts.find((a) => a.severity === worst)?.message ?? "";
          return (
            <Link
              key={p.path}
              to="/designs/meadow/project/$"
              params={{ _splat: p.path.replace(/^\/+/, "") }}
              title={`${message} · updated ${compactAge(p.updatedAt)} ago`}
              className="meadow-focus inline-flex max-w-56 items-center gap-1.5 rounded-full bg-card/80 px-2.5 py-1 text-[11px] font-medium text-foreground shadow-[0_1px_2px_oklch(0.4_0.05_110/0.06)] transition-transform hover:-translate-y-px"
            >
              <span
                aria-hidden
                className="size-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: CHIP_TONE[worst] }}
              />
              <span className="truncate">{p.name}</span>
            </Link>
          );
        })}
        {hidden > 0 ? (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="meadow-focus inline-flex items-center gap-0.5 rounded-full px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <Plus aria-hidden className="size-3" />
            {hidden} more
          </button>
        ) : null}
      </span>
    </section>
  );
}
