import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@workspace-welcome/ui/components/command";
import { Button } from "@workspace-welcome/ui/components/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace-welcome/ui/components/popover";
import { cn } from "@workspace-welcome/ui/lib/utils";

import type { IdeationModelsList } from "@workspace-welcome/api/lib/ideation/shared";

/**
 * The model picker's listbox layer (PRD §3): a searchable Popover + Command
 * combobox over the ideation.models.list catalog. The list is FLAT — one row
 * per model with its provider as a mono micro-suffix — because the sort, not
 * provider grouping, drives the order: newest first by default, then
 * cheapest/priciest by per-1M cost, then alphabetical. Every row carries the
 * model's price (input/output per 1M tokens) and a "new" chip for recent
 * releases, so the pick is informed, not alphabetical roulette. Two flavors
 * share this file: the single-select used for the "one model for every step"
 * default and the reconciler, and the multi-select used by the advanced
 * toggles (per-step fan-out sets). All catalog knowledge arrives via props —
 * these components never read env or keep a local model list (PRD §7).
 */

/** One selectable model — a keyPresent provider's model flattened for listbox use. */
export interface IdeationModelOption {
  /** Composite catalog id, e.g. "zai/glm-5.3-flash". */
  id: string;
  /** Model display label from the dump, e.g. "GLM-5.3-Flash". */
  label: string;
  /** Provider slug, e.g. "zai". */
  providerId: string;
  /** Provider display label, e.g. "Z.AI". */
  providerLabel: string;
  /** Release timestamp (ms epoch) from the dump; null when undated. */
  releasedAt: number | null;
  /** Per-1M-token USD cost from the dump; null when unknown. */
  cost: { input: number; output: number } | null;
}

/** One absent env var + the provider labels it would unlock (criterion 10). */
export interface IdeationMissingKey {
  envVar: string;
  /** Joined display names of the providers behind this env var. */
  providerLabels: string;
}

/**
 * Flatten the catalog into picker options: ONLY providers with
 * keyPresent === true (criterion 10) — the picker must never offer a
 * model whose provider cannot be called. Input order (providers by id,
 * models by id — catalog.ts's stable sort) is the A–Z baseline; the other
 * sorts re-order in the listbox.
 */
export function buildIdeationModelOptions(
  list: IdeationModelsList,
): IdeationModelOption[] {
  return list.providers
    .filter((provider) => provider.keyPresent)
    .flatMap((provider) =>
      provider.models.map((model) => ({
        id: model.id,
        // Display-only: OpenRouter embeds "(free)" in names, and the green
        // price cell already says it — strip the duplication.
        label: model.label.replace(/\s*\(\s*free\s*\)$/i, ""),
        providerId: provider.id,
        providerLabel: provider.label,
        releasedAt: model.releasedAt,
        cost: model.cost,
      })),
    );
}

/**
 * The missing-key empty state's copy source (criterion 10): every env var
 * that is unset among the listed providers, each with the labels of the
 * providers it would unlock — rendered by the picker as
 * "Set ZAI_API_KEY to use Z.AI models". One entry per env var, sorted by
 * env var name for stable output.
 */
export function missingIdeationKeys(
  list: IdeationModelsList,
): IdeationMissingKey[] {
  const byEnvVar = new Map<string, string[]>();
  for (const provider of list.providers) {
    if (provider.keyPresent) continue;
    const labels = byEnvVar.get(provider.envVar) ?? [];
    labels.push(provider.label);
    byEnvVar.set(provider.envVar, labels);
  }
  return [...byEnvVar.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([envVar, labels]) => ({
      envVar,
      providerLabels: [...new Set(labels)].sort().join(", "),
    }));
}

/** Look up an option by composite id; null when the catalog doesn't list it. */
export function findIdeationModelOption(
  options: IdeationModelOption[],
  id: string,
): IdeationModelOption | null {
  return options.find((option) => option.id === id) ?? null;
}

// --- Sorting + price presentation -------------------------------------------

/** The list's sort modes — freshness is the default, not the alphabet. */
type ModelSort = "fresh" | "cheap" | "pricey" | "alpha";

const SORTS: readonly { id: ModelSort; label: string; title: string }[] = [
  { id: "fresh", label: "newest", title: "Newest releases first" },
  { id: "cheap", label: "cheapest", title: "Lowest input price first" },
  { id: "pricey", label: "priciest", title: "Highest input price first" },
  { id: "alpha", label: "a–z", title: "Alphabetical" },
];

/** A model older than this is no longer "new" in the list. */
const NEW_WITHIN_MS = 45 * 24 * 60 * 60 * 1000;

/**
 * The price-sort key: the INPUT price — the first number the row shows, so
 * the visible column drives the order and the list never reads as
 * mis-sorted against its own numbers; output then label break ties.
 * Unknown prices sort last.
 */
function priceCompare(
  a: IdeationModelOption,
  b: IdeationModelOption,
  sign: 1 | -1,
): number {
  const ka = a.cost;
  const kb = b.cost;
  if (ka === null && kb === null) return a.label.localeCompare(b.label);
  if (ka === null) return 1;
  if (kb === null) return -1;
  return (
    (ka.input - kb.input) * sign ||
    (ka.output - kb.output) * sign ||
    a.label.localeCompare(b.label)
  );
}

function sortOptions(
  options: IdeationModelOption[],
  sort: ModelSort,
): IdeationModelOption[] {
  const sorted = [...options];
  switch (sort) {
    case "fresh":
      sorted.sort((a, b) => {
        if (a.releasedAt === null && b.releasedAt === null) {
          return a.label.localeCompare(b.label);
        }
        if (a.releasedAt === null) return 1;
        if (b.releasedAt === null) return -1;
        return b.releasedAt - a.releasedAt || a.label.localeCompare(b.label);
      });
      break;
    case "cheap":
      sorted.sort((a, b) => priceCompare(a, b, 1));
      break;
    case "pricey":
      sorted.sort((a, b) => priceCompare(a, b, -1));
      break;
    case "alpha":
      sorted.sort((a, b) => a.label.localeCompare(b.label));
      break;
  }
  return sorted;
}

/** Compact per-1M price: "$0.20 / $1.20", "free", or the muted unknown dash.
 * Both sides carry two decimals so the slashes align down the fixed-width
 * column. */
function priceCell(option: IdeationModelOption): {
  text: string;
  tone: "paid" | "free" | "unknown";
} {
  if (option.cost === null) return { text: "—", tone: "unknown" };
  const { input, output } = option.cost;
  if (input === 0 && output === 0) return { text: "free", tone: "free" };
  return { text: `$${input.toFixed(2)} / $${output.toFixed(2)}`, tone: "paid" };
}

/** Month-precision release stamp for tooltips, e.g. "Feb 2026". */
function releaseStamp(option: IdeationModelOption): string | null {
  if (option.releasedAt === null) return null;
  return new Date(option.releasedAt).toLocaleDateString(undefined, {
    month: "short",
    year: "numeric",
  });
}

/** Searchable text cmdk filters on — provider, label, and raw id all match. */
function searchableValue(option: IdeationModelOption): string {
  return `${option.providerLabel} ${option.label} ${option.id}`;
}

// --- The shell ----------------------------------------------------------------

/**
 * The shared Popover + Command shell: outline trigger button (Kiln
 * rounded-none, size-3.5 chevron), a search input over a flat,
 * sort-controlled list, each row showing the model label, its provider as a
 * mono micro-suffix, a "new" chip for recent releases, and the per-1M price
 * right-aligned. `renderValue` supplies the trigger's value display; rows
 * report back through `onPick`, and `closeOnPick` decides whether selecting
 * closes the popover (single) or leaves it open for further picks (multi).
 */
function IdeationModelListboxShell({
  options,
  ariaLabel,
  renderValue,
  onPick,
  isPicked,
  closeOnPick,
}: {
  options: IdeationModelOption[];
  ariaLabel: string;
  renderValue: () => ReactNode;
  onPick: (id: string) => void;
  isPicked: (id: string) => boolean;
  closeOnPick: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<ModelSort>("fresh");
  const listRef = useRef<HTMLDivElement | null>(null);
  const [fadeTop, setFadeTop] = useState(false);
  const [fadeBottom, setFadeBottom] = useState(false);

  const sorted = useMemo(() => sortOptions(options, sort), [options, sort]);
  const now = Date.now();

  // Edge fades only where the list actually continues — measured on
  // scroll, after data/sort/open changes (a fresh measure can't ride the
  // scroll event alone).
  const measureFades = useCallback(() => {
    const el = listRef.current;
    if (el === null) return;
    setFadeTop(el.scrollTop > 4);
    setFadeBottom(el.scrollTop + el.clientHeight < el.scrollHeight - 4);
  }, []);
  useEffect(() => {
    const raf = requestAnimationFrame(measureFades);
    return () => cancelAnimationFrame(raf);
  }, [measureFades, open, query, sorted]);

  const changeSort = (next: ModelSort) => {
    setSort(next);
    // A new order starts from its top — keeping the old scroll offset
    // lands mid-list and hides the sort's headliners (the free block,
    // the newest releases).
    requestAnimationFrame(() => listRef.current?.scrollTo({ top: 0 }));
  };

  // Drop the search text between opens so each session starts unfiltered;
  // the sort choice survives — it is a preference, not a query. On open,
  // the list centers the picked row so the current choice is VISIBLE
  // (fresh sort puts 45-day releases first; the selection is usually
  // further down).
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => {
        listRef.current
          ?.querySelector('[data-picked="true"]')
          ?.scrollIntoView({ block: "center" });
      });
    } else {
      setQuery("");
    }
  }, [open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            role="combobox"
            aria-label={ariaLabel}
            aria-expanded={open}
            className="h-7 w-full min-w-0 justify-between gap-2 font-normal"
          />
        }
      >
        {renderValue()}
        <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent className="w-[26rem] p-0" align="start">
        <Command>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="search models…"
          />
          {/* The sort register + the price legend — one header line. The
              segmented container + accent active chip read as controls, not
              metadata. */}
          <div className="flex items-center justify-between gap-2 border-b border-border/60 px-2 py-1.5">
            <div
              role="group"
              aria-label="Sort models"
              className="flex min-w-0 items-center divide-x divide-border/60 border border-border/60"
            >
              {SORTS.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  title={entry.title}
                  aria-pressed={sort === entry.id}
                  onClick={() => changeSort(entry.id)}
                  className={cn(
                    "px-1.5 py-0.5 font-mono text-[0.6rem] lowercase outline-none transition-colors",
                    sort === entry.id
                      ? "bg-(--state-positive)/15 text-(--state-positive)"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {entry.label}
                </button>
              ))}
            </div>
            <span className="shrink-0 font-mono text-[0.6rem] lowercase text-muted-foreground">
              $ in / out per 1M
            </span>
          </div>
          {/* Edge fades say the list continues past either cut — the thin
              scroll affordance cmdk's list doesn't render itself. */}
          <div className="relative">
            {fadeTop ? (
              <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-4 bg-gradient-to-b from-popover to-transparent" />
            ) : null}
            <CommandList ref={listRef} onScroll={measureFades}>
            <CommandEmpty>no models match.</CommandEmpty>
            {sorted.map((option) => {
              const price = priceCell(option);
              const stamp = releaseStamp(option);
              const picked = isPicked(option.id);
              // The chip says "recently released" — under the newest sort
              // every row is one, so it would be pure noise (and width).
              const showNew =
                sort !== "fresh" &&
                option.releasedAt !== null &&
                now - option.releasedAt < NEW_WITHIN_MS;
              return (
                <CommandItem
                  key={option.id}
                  value={searchableValue(option)}
                  aria-selected={picked}
                  data-picked={picked || undefined}
                  onSelect={() => {
                    onPick(option.id);
                    if (closeOnPick) setOpen(false);
                  }}
                  title={[
                    option.id,
                    stamp !== null ? `released ${stamp}` : null,
                    option.cost !== null
                      ? `input $${option.cost.input.toFixed(2)} · output $${option.cost.output.toFixed(2)} per 1M tokens`
                      : "price unknown",
                  ]
                    .filter(Boolean)
                    .join(" — ")}
                  className="gap-2 data-[picked]:bg-accent/40"
                >
                  <Check
                    className={cn(
                      "size-3.5 shrink-0",
                      picked ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {/* Fixed provider and price columns: labels flex, provider
                      never ragged, prices right-aligned in one column so
                      the slashes align. */}
                  <span className="flex min-w-0 flex-1 items-center gap-1.5">
                    <span className="min-w-0 truncate text-[0.8rem] leading-none">
                      {option.label}
                    </span>
                    {showNew ? (
                      <span className="shrink-0 rounded-none bg-accent px-1 py-px font-mono text-[0.55rem] lowercase leading-none text-accent-foreground">
                        new
                      </span>
                    ) : null}
                  </span>
                  <span className="w-[5.5rem] shrink-0 truncate text-left font-mono text-[0.65rem] lowercase text-muted-foreground">
                    {option.providerLabel}
                  </span>
                  <span
                    className={cn(
                      "w-[6rem] shrink-0 text-right font-mono text-[0.65rem] tabular-nums",
                      price.tone === "unknown" && "text-muted-foreground/50",
                      price.tone === "free" && "text-(--state-positive)",
                      price.tone === "paid" && "text-muted-foreground",
                    )}
                  >
                    {price.text}
                  </span>
                </CommandItem>
              );
            })}
          </CommandList>
            {fadeBottom ? (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-4 bg-gradient-to-t from-popover to-transparent" />
            ) : null}
          </div>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/**
 * The single-select flavor: picking a model closes the listbox and reports
 * the composite id. `value` may be null (nothing common to show — the
 * picker renders a muted "mixed" hint then) or an id the catalog no longer
 * lists (stale settings — shown raw in mono rather than silently swapped).
 */
export function IdeationModelListbox({
  options,
  value,
  onSelect,
  ariaLabel,
}: {
  options: IdeationModelOption[];
  value: string | null;
  onSelect: (id: string) => void;
  ariaLabel: string;
}) {
  return (
    <IdeationModelListboxShell
      options={options}
      ariaLabel={ariaLabel}
      isPicked={(id) => id === value}
      onPick={onSelect}
      closeOnPick
      renderValue={() => <SingleValue options={options} value={value} />}
    />
  );
}

/**
 * The trigger's uniform vocabulary for an id the catalog no longer lists
 * (stale settings, provider key gone): split "<provider>/<model>" back into
 * the OptionValue shape instead of dumping the raw slug — same layout as a
 * live pick, with the tooltip carrying the honesty.
 */
function StaleValue({ id }: { id: string }) {
  const slash = id.indexOf("/");
  const provider = slash === -1 ? "" : id.slice(0, slash);
  const model = slash === -1 ? id : id.slice(slash + 1);
  return (
    <span
      className="flex min-w-0 items-baseline gap-1.5"
      title={`${id} — not in the current catalog (provider key absent or model unavailable)`}
    >
      <span className="truncate">{model}</span>
      {provider.length > 0 ? (
        <span className="shrink-0 font-mono text-[0.65rem] text-muted-foreground">
          {provider}
        </span>
      ) : null}
    </span>
  );
}

function SingleValue({
  options,
  value,
}: {
  options: IdeationModelOption[];
  value: string | null;
}) {
  if (value === null) {
    return (
      <span
        className="truncate text-muted-foreground"
        title="Steps use different models — picking one applies it to every step"
      >
        mixed
      </span>
    );
  }
  const option = findIdeationModelOption(options, value);
  if (option === null) {
    return <StaleValue id={value} />;
  }
  return <OptionValue option={option} />;
}

/**
 * The multi-select flavor: rows toggle membership and the listbox stays
 * open for further picks. Deselecting the last remaining model is refused
 * WITH a visible reason — every step must keep at least one model
 * (ideationStepModelsSchema's min(1)) — instead of silently doing nothing.
 */
export function IdeationModelMultiListbox({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: IdeationModelOption[];
  value: string[];
  onChange: (ids: string[]) => void;
  ariaLabel: string;
}) {
  const [refusedLast, setRefusedLast] = useState(false);
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <IdeationModelListboxShell
        options={options}
        ariaLabel={ariaLabel}
        isPicked={(id) => value.includes(id)}
        onPick={(id) => {
          // Catalog-absent ids (stale settings defaults — e.g. a provider
          // whose key is gone) ride along as UNREMOVABLE noise in multi
          // mode: no list row exists to deselect them, so every pick would
          // append to them ("zai/glm-5.3-flash +1"). Any active pick drops
          // them — the user's choice replaces the default, it never
          // accumulates behind it.
          const viable = value.filter(
            (v) => findIdeationModelOption(options, v) !== null,
          );
          if (value.includes(id)) {
            if (viable.length > 1) {
              setRefusedLast(false);
              onChange(viable.filter((v) => v !== id));
            } else {
              setRefusedLast(true);
            }
          } else {
            setRefusedLast(false);
            onChange([...viable, id]);
          }
        }}
        closeOnPick={false}
        renderValue={() => <MultiValue options={options} value={value} />}
      />
      {refusedLast ? (
        <p
          role="status"
          className="font-mono text-[0.6rem] lowercase text-muted-foreground"
        >
          each step keeps at least one model — pick a replacement first
        </p>
      ) : null}
    </div>
  );
}

function MultiValue({
  options,
  value,
}: {
  options: IdeationModelOption[];
  value: string[];
}) {
  const first = value[0];
  if (first === undefined) {
    return <span className="truncate text-muted-foreground">none</span>;
  }
  const option = findIdeationModelOption(options, first);
  return (
    <span className="flex min-w-0 items-baseline gap-1.5">
      {option === null ? (
        <StaleValue id={first} />
      ) : (
        <OptionValue option={option} />
      )}
      {value.length > 1 ? (
        <span className="shrink-0 font-mono text-[0.65rem] text-muted-foreground">
          +{value.length - 1}
        </span>
      ) : null}
    </span>
  );
}

/** Trigger value: model label with the provider as a mono micro-suffix. */
function OptionValue({ option }: { option: IdeationModelOption }) {
  return (
    <span className="flex min-w-0 items-baseline gap-1.5">
      <span className="truncate">{option.label}</span>
      <span className="shrink-0 font-mono text-[0.65rem] text-muted-foreground">
        {option.providerLabel}
      </span>
    </span>
  );
}
