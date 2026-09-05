import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useReducedMotion } from "motion/react";

import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@workspace-welcome/ui/components/carousel";
import type { CarouselApi } from "@workspace-welcome/ui/components/carousel";
import { cn } from "@workspace-welcome/ui/lib/utils";

/**
 * ViewCarousel — one widget, several views of the same data (graph ↔ table
 * ↔ list), cycling with label pills + arrows. Ported (read-only) from
 * bento's `DataCarousel` (the superset) onto the ui Carousel primitives.
 *
 * - `autoAdvance` is DETERMINISTICALLY staggered: interval (5–9 s) and
 *   phase both derive from an FNV-1a hash of the card ids, so sibling
 *   carousels never advance in unison and layouts survive reloads. It
 *   pauses on hover/focus and is OFF entirely under reduced motion.
 * - Below MIN_CONTENT container width the carousel degrades via container
 *   query: first card only, no pills, no arrows.
 */

export interface ViewCarouselCard {
  /** Stable id — also seeds this carousel's stagger. */
  id: string;
  label: string;
  node: ReactNode;
}

export interface ViewCarouselProps {
  cards: ViewCarouselCard[];
  /** Auto-advance with a deterministic per-instance stagger. */
  autoAdvance?: boolean;
  ariaLabel?: string;
  className?: string;
}

/** Container width below which the carousel shows the first card only. */
export const MIN_CONTENT = { w: 200, h: 120 };

/** FNV-1a — deterministic per-instance seeds (bento's hashSeed). */
function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function ViewCarousel({
  cards,
  autoAdvance = false,
  ariaLabel,
  className,
}: ViewCarouselProps) {
  const [api, setApi] = useState<CarouselApi | null>(null);
  const [selected, setSelected] = useState(0);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const reduced = useReducedMotion();

  useEffect(() => {
    if (!api) return;
    const onSelect = (embla: CarouselApi) => {
      if (!embla) return;
      setSelected(embla.selectedScrollSnap());
    };
    onSelect(api);
    api.on("select", onSelect);
    api.on("reInit", onSelect);
    return () => {
      api.off("select", onSelect);
      api.off("reInit", onSelect);
    };
  }, [api]);

  const seed = useMemo(() => cards.map((card) => card.id).join(), [cards]);
  const interval = useMemo(
    () => (autoAdvance ? 5000 + (hashSeed(seed) % 4000) : 0),
    [autoAdvance, seed],
  );
  const phase = useMemo(
    () => (interval > 0 ? hashSeed(`${seed}:phase`) % interval : 0),
    [interval, seed],
  );

  useEffect(() => {
    if (interval <= 0 || reduced || cards.length < 2 || !api) return;
    let timer: number;
    const tick = () => {
      if (!pausedRef.current) api.scrollNext();
      timer = window.setTimeout(tick, interval);
    };
    timer = window.setTimeout(tick, phase);
    return () => window.clearTimeout(timer);
  }, [api, interval, phase, reduced, cards.length]);

  if (cards.length === 0) return null;

  const paged = cards.length > 1;

  return (
    <div
      data-part="view-carousel"
      data-paused={paused || undefined}
      className={cn("@container flex min-h-0 min-w-0 flex-col", className)}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <Carousel
        setApi={setApi}
        opts={{ loop: autoAdvance }}
        className="flex min-h-0 flex-1 flex-col"
        aria-label={ariaLabel}
      >
        {/* Pills + arrows: hidden below the min container width, and not
            rendered at all when there is nothing to page — first card
            only, no chrome. */}
        {paged ? (
          <div className="hidden shrink-0 items-center gap-1 pb-1.5 @[200px]:flex">
          {cards.map((card, i) => (
            <button
              key={card.id}
              type="button"
              onClick={() => api?.scrollTo(i)}
              aria-pressed={selected === i}
              className={cn(
                "rounded-md px-2 py-1 font-mono text-[0.64rem] transition-colors",
                selected === i
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {card.label}
            </button>
          ))}
          <span className="ml-auto flex items-center gap-0.5">
            <CarouselPrevious
              variant="ghost"
              className="static size-6 translate-y-0 rounded-md border-transparent hover:border-border"
              aria-label={`Previous ${ariaLabel ?? "view"}`}
            />
            <CarouselNext
              variant="ghost"
              className="static size-6 translate-y-0 rounded-md border-transparent hover:border-border"
              aria-label={`Next ${ariaLabel ?? "view"}`}
            />
          </span>
        </div>
        ) : null}

        <CarouselContent className="min-h-0 flex-1">
          {cards.map((card, i) => (
            <CarouselItem
              key={card.id}
              className={cn("flex min-h-0 flex-col", i > 0 && "hidden @[200px]:flex")}
            >
              <div className="flex min-h-0 flex-1 flex-col">{card.node}</div>
            </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>
    </div>
  );
}
