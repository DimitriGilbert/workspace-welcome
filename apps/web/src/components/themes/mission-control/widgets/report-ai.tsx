/**
 * McReportAi — the AI-usage report widget, fed by the report's FULL AI
 * census. The snitch payload carries what the old export dropped: the
 * token-class split (cache read/write, reasoning — the in/out pair alone
 * understates usage ~27x), the CLI's own estimated cost WITHOUT the plan
 * subsidy (`unsubsidizedCost` — `cost` is the subsidized constant $0 and
 * was the "misleading $0" the owner rejected), and per-day / per-model /
 * per-client breakdowns. `packages/api` report-export now maps all of it
 * (additive, old exports stay valid); this widget renders it:
 *
 * - weighted header figures: est. cost (unsubsidized) + token total;
 * - the `byDay` timeline as a tight-domain stacked bar chart (input over
 *   output per day, exact day axis, the peak day called out);
 * - the `byModel` census as a dense fill-or-shrink ledger;
 * - one exact-totals footer line (in / out / cache / Σ / est. cost).
 *
 * Exports persisted before the breakdown existed (no regenerable payload)
 * degrade to the in/out split composition — never to invented data. No
 * records counts anywhere (banned by the owner). No AI usage in the window
 * renders the workspace totals trio honestly.
 */
import { useId, useMemo } from "react";

import { useReport } from "@/widgets/contexts/report-context";
import type { ReportView } from "@/lib/report-view";
import type { RegisteredWidgetProps } from "@/widgets/registry";
import { useWidgetSize, WidgetShell } from "@/widgets/runtime/widget-shell";

import { McReportGate } from "./report-shared";

type AiUsage = NonNullable<ReportView["aiUsage"]>;
type AiBreakdownRow = NonNullable<AiUsage["breakdowns"]>["byDay"][number];

/** Chart geometry in viewBox units — stretched to the box, fills stay solid. */
const PLOT_W = 1000;
const PLOT_H = 400;

/** Compact 12.4k / 1.2M numeral for figure blocks and ledger values. */
function compactCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return String(n);
}

/** The estimated cost as a short honest string — only real values render. */
function costLabel(unsubsidizedCost: number): string {
  return `$${unsubsidizedCost.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** The pane's share of the in+out split — "83.5", integral when it is all. */
function sharePct(part: number, whole: number): string {
  if (whole <= 0) return "0";
  return ((part / whole) * 100).toFixed(part === whole ? 0 : 1);
}

/** MM-DD slice of a byDay key ("2026-09-06" → "09-06") — the axis register. */
function dayTick(key: string): string {
  return key.length >= 10 ? key.slice(5) : key;
}

/**
 * The per-day stacked bar chart: input (base) + output (top) per day over a
 * TIGHT domain — the tallest day rides the top edge, the baseline the
 * bottom. No gridlines, no headroom, no padding: the bars ARE the box.
 */
function DayBars({ days, maxDay }: { days: AiBreakdownRow[]; maxDay: number }) {
  const gradientId = useId();
  const n = days.length;
  const slot = PLOT_W / Math.max(1, n);
  const barW = Math.max(2, slot * 0.72);
  return (
    <svg
      role="img"
      aria-label="Token usage per day: input and output stacked"
      viewBox={`0 0 ${PLOT_W} ${PLOT_H}`}
      preserveAspectRatio="none"
      className="block h-full w-full"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.92} />
          <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.55} />
        </linearGradient>
      </defs>
      {days.map((day, i) => {
        const hIn = maxDay > 0 ? (day.tokens.input / maxDay) * PLOT_H : 0;
        const hOut = maxDay > 0 ? (day.tokens.output / maxDay) * PLOT_H : 0;
        const x = i * slot + (slot - barW) / 2;
        return (
          <g key={day.key}>
            <rect
              x={x}
              y={PLOT_H - hIn}
              width={barW}
              height={hIn}
              fill="var(--chart-5)"
            />
            <rect
              x={x}
              y={Math.max(0, PLOT_H - hIn - hOut)}
              width={barW}
              height={hOut}
              fill={`url(#${gradientId})`}
            />
          </g>
        );
      })}
    </svg>
  );
}

/** Day axis under the bars: evenly sampled ticks at exact x shares — never
 * more than 7 (27 daily keys would overlap at any rung width); middle ticks
 * fold below ~520px shells. */
function DayAxis({ days }: { days: AiBreakdownRow[] }) {
  const n = days.length;
  const idxs = useMemo(() => {
    if (n <= 1) return n === 1 ? [0] : [];
    if (n <= 7) return Array.from({ length: n }, (_, i) => i);
    const sixths = [0, 1, 2, 3, 4, 5, 6].map((f) => Math.round((f / 6) * (n - 1)));
    return [...new Set(sixths)];
  }, [n]);
  return (
    <div aria-hidden className="relative h-3.5 shrink-0">
      {idxs.map((i) => {
        const day = days[i];
        if (day === undefined) return null;
        const at = n <= 1 ? 0 : (i / (n - 1)) * 100;
        const anchor = i === 0 ? "0%" : i === n - 1 ? "-100%" : "-50%";
        return (
          <span
            key={day.key}
            className={`absolute top-0 font-mono text-[9px] leading-3 whitespace-nowrap text-muted-foreground${
              i > 0 && i < n - 1 ? " hidden @[520px]:inline" : ""
            }`}
            style={{ left: `${at}%`, transform: `translateX(${anchor})` }}
          >
            {dayTick(day.key)}
          </span>
        );
      })}
    </div>
  );
}

/** The per-model census ledger: fill-or-shrink bars, exact tokens, est. $. */
function ModelLedger({ models }: { models: AiBreakdownRow[] }) {
  const max = models.reduce((peak, m) => Math.max(peak, m.tokens.total), 0);
  return (
    <div className="shrink-0">
      {models.map((m) => {
        const share = max > 0 ? m.tokens.total / max : 0;
        return (
          <div
            key={m.key}
            className="flex items-center gap-2 border-t border-(--mc-line) py-[3px] first:border-t-0"
          >
            <span
              className="w-24 shrink-0 truncate font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted-foreground"
              title={m.key}
            >
              {m.key}
            </span>
            <span className="flex min-w-0 flex-1 items-center">
              {share > 0 ? (
                <span
                  aria-hidden
                  className="block h-1.5 min-w-px rounded-[1px]"
                  style={{
                    width: `${Math.max(2, Math.round(share * 100))}%`,
                    background: "var(--chart-1)",
                    opacity: 0.45 + share * 0.55,
                  }}
                />
              ) : null}
            </span>
            <span className="shrink-0 font-mono text-[10px] tabular-nums text-foreground">
              {compactCount(m.tokens.total)}
            </span>
            {m.unsubsidizedCost !== null && m.unsubsidizedCost !== undefined && m.unsubsidizedCost > 0 ? (
              <span className="hidden w-16 shrink-0 text-right font-mono text-[10px] tabular-nums text-muted-foreground @[240px]:block">
                {costLabel(m.unsubsidizedCost)}
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/** The one dense footer line: exact token classes and the estimated cost. */
function ExactTotals({ ai }: { ai: AiUsage }) {
  return (
    <p className="flex shrink-0 flex-wrap items-baseline gap-x-3 gap-y-0.5 border-t border-(--mc-shell-hairline) pt-1.5 font-mono text-[9.5px] tabular-nums text-muted-foreground">
      <span>
        in <span className="text-foreground">{ai.tokens.input.toLocaleString()}</span>
      </span>
      <span>
        out <span className="text-foreground">{ai.tokens.output.toLocaleString()}</span>
      </span>
      {ai.tokens.cacheRead ? (
        <span>
          cache <span className="text-foreground">{ai.tokens.cacheRead.toLocaleString()}</span>
        </span>
      ) : null}
      <span>
        Σ <span className="text-foreground">{ai.tokens.total.toLocaleString()}</span>
      </span>
      {ai.unsubsidizedCost !== null && ai.unsubsidizedCost !== undefined && ai.unsubsidizedCost > 0 ? (
        <span>
          est. <span className="text-foreground">{costLabel(ai.unsubsidizedCost)}</span>
        </span>
      ) : null}
    </p>
  );
}

/** The weighted header figures: est. cost + the token total. */
function CostFigures({ ai }: { ai: AiUsage }) {
  return (
    <div className="flex shrink-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      {ai.unsubsidizedCost !== null && ai.unsubsidizedCost !== undefined && ai.unsubsidizedCost > 0 ? (
        <span className="flex items-baseline gap-2">
          <span className="font-mono text-[20px] leading-none font-medium tracking-tight tabular-nums text-foreground">
            {costLabel(ai.unsubsidizedCost)}
          </span>
          <span className="whitespace-nowrap font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
            est. cost
            <span className="hidden @[240px]:inline"> · unsubsidized</span>
          </span>
        </span>
      ) : (
        <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
          tokens
        </span>
      )}
      <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
        {compactCount(ai.tokens.total)} tokens
      </span>
    </div>
  );
}

/**
 * One ink pane of the in/out split (the degradation composition for exports
 * without breakdowns, and the small-rung register). Flexes proportionally
 * to its token count, fills the box edge to edge.
 */
function TokenPane({
  label,
  value,
  whole,
  fill,
  axis,
}: {
  label: string;
  value: number;
  whole: number;
  fill: string;
  /** "v" = panes stack vertically (tall rung); "h" = side by side (wide rung). */
  axis: "v" | "h";
}) {
  return (
    <div
      className="flex min-w-0 flex-col justify-between gap-2 overflow-hidden px-3 py-2.5"
      style={{
        flexGrow: value,
        flexBasis: 0,
        ...(axis === "v" ? { minHeight: 56 } : { minWidth: 56 }),
        background: `color-mix(in oklch, ${fill} 17%, transparent)`,
      }}
    >
      <span className="flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted-foreground">
        <span aria-hidden className="size-1.5 shrink-0" style={{ background: fill }} />
        {label} · {sharePct(value, whole)}%
      </span>
      <span className="font-mono text-[22px] leading-none font-medium tabular-nums text-foreground">
        {compactCount(value)}
      </span>
    </div>
  );
}

/** The in/out split composition filling the content box. */
function TokenSplit({
  input,
  output,
  axis,
}: {
  input: number;
  output: number;
  axis: "v" | "h";
}) {
  const whole = input + output;
  return (
    <div className={`flex min-h-0 min-w-0 flex-1 gap-px ${axis === "v" ? "flex-col" : "flex-row"}`}>
      {input > 0 ? <TokenPane label="in" value={input} whole={whole} fill="var(--chart-5)" axis={axis} /> : null}
      {output > 0 ? <TokenPane label="out" value={output} whole={whole} fill="var(--chart-1)" axis={axis} /> : null}
    </div>
  );
}

export function McReportAi(_props: RegisteredWidgetProps) {
  const report = useReport();
  const view = report.view;
  const ai = view?.aiUsage ?? null;
  const placed = useWidgetSize();

  const totals = view?.totals ?? { commits: 0, contributors: 0, repositories: 0 };

  const days = useMemo(
    () =>
      [...(ai?.breakdowns?.byDay ?? [])].sort((a, b) => a.key.localeCompare(b.key)),
    [ai],
  );
  const models = useMemo(
    () =>
      [...(ai?.breakdowns?.byModel ?? [])].sort(
        (a, b) => b.tokens.total - a.tokens.total,
      ),
    [ai],
  );
  const maxDay = useMemo(
    () => days.reduce((peak, d) => Math.max(peak, d.tokens.input + d.tokens.output), 0),
    [days],
  );
  const peak = useMemo(() => {
    if (days.length === 0 || maxDay <= 0) return null;
    const best = days.reduce((a, b) =>
      a.tokens.input + a.tokens.output >= b.tokens.input + b.tokens.output ? a : b,
    );
    return { key: best.key, total: best.tokens.input + best.tokens.output };
  }, [days, maxDay]);

  const full = placed.cols >= 2 && placed.rows >= 4;
  const mid = placed.cols >= 2 && placed.rows >= 2;
  const axis: "v" | "h" = placed.rows >= placed.cols ? "v" : "h";
  const hasBreakdowns = days.length > 0;

  return (
    <WidgetShell className="h-full w-full">
      <McReportGate>
        {ai !== null && full ? (
          <div className="flex h-full min-h-0 w-full min-w-0 flex-col gap-2 overflow-hidden px-3.5 pb-2 pt-1">
            <CostFigures ai={ai} />
            {hasBreakdowns ? (
              <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                <div className="flex shrink-0 items-baseline justify-between gap-2 pb-1">
                  <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                    tokens / day · in + out
                  </span>
                  {peak !== null ? (
                    <span className="font-mono text-[9px] tabular-nums text-muted-foreground">
                      peak {dayTick(peak.key)} · {compactCount(peak.total)}
                    </span>
                  ) : null}
                </div>
                <div className="relative min-h-0 min-w-0 flex-1">
                  <div className="absolute inset-0">
                    <DayBars days={days} maxDay={maxDay} />
                  </div>
                </div>
                <DayAxis days={days} />
              </div>
            ) : (
              <TokenSplit input={ai.tokens.input} output={ai.tokens.output} axis={axis} />
            )}
            {models.length > 0 ? <ModelLedger models={models} /> : null}
            <ExactTotals ai={ai} />
          </div>
        ) : ai !== null && mid ? (
          <div className="flex h-full min-h-0 w-full min-w-0 flex-col gap-2 overflow-hidden px-3.5 pb-2 pt-1">
            <CostFigures ai={ai} />
            {hasBreakdowns ? (
              <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                <div className="relative min-h-0 min-w-0 flex-1">
                  <div className="absolute inset-0">
                    <DayBars days={days} maxDay={maxDay} />
                  </div>
                </div>
                <DayAxis days={days} />
              </div>
            ) : (
              <TokenSplit input={ai.tokens.input} output={ai.tokens.output} axis="h" />
            )}
            {models.length > 0 && placed.rows >= 5 ? <ModelLedger models={models} /> : null}
            <ExactTotals ai={ai} />
          </div>
        ) : ai !== null ? (
          // Small rung: one proportional split bar over the compact line.
          <div className="flex h-full min-h-0 w-full min-w-0 flex-col justify-center gap-1.5 overflow-hidden px-3.5 pb-2">
            <div
              className="flex h-2.5 w-full overflow-hidden bg-[color-mix(in_oklch,var(--foreground)_6%,transparent)]"
              role="img"
              aria-label={`Tokens: in ${ai.tokens.input.toLocaleString()}, out ${ai.tokens.output.toLocaleString()}`}
            >
              <span
                className="block h-full"
                style={{ flexGrow: ai.tokens.input, flexBasis: 0, background: "var(--chart-5)" }}
              />
              <span
                className="block h-full"
                style={{ flexGrow: ai.tokens.output, flexBasis: 0, background: "var(--chart-1)" }}
              />
            </div>
            <p className="font-mono text-[10px] tabular-nums text-muted-foreground">
              in {compactCount(ai.tokens.input)} · out {compactCount(ai.tokens.output)} · Σ{" "}
              {compactCount(ai.tokens.total)}
              {ai.unsubsidizedCost !== null &&
              ai.unsubsidizedCost !== undefined &&
              ai.unsubsidizedCost > 0
                ? ` · est. ${costLabel(ai.unsubsidizedCost)}`
                : ""}
            </p>
          </div>
        ) : (
          <div className="flex h-full min-h-0 w-full min-w-0 items-center overflow-hidden px-3.5 pb-2">
            <div className="flex min-w-0 flex-col gap-2 py-1">
              <p className="font-mono text-[11px] text-muted-foreground">
                No AI usage recorded in this window.
              </p>
              <div className="grid grid-cols-3 gap-3">
                <MiniStatFallback label="commits" value={totals.commits.toLocaleString()} />
                <MiniStatFallback label="contributors" value={String(totals.contributors)} />
                <MiniStatFallback label="repos" value={String(totals.repositories)} />
              </div>
            </div>
          </div>
        )}
      </McReportGate>
    </WidgetShell>
  );
}

/** Micro caps label under a mid-size mono numeral (the empty-state trio). */
function MiniStatFallback({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col-reverse gap-1">
      <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </span>
      <span className="font-mono text-[15px] leading-none font-medium tabular-nums text-foreground">
        {value}
      </span>
    </div>
  );
}
