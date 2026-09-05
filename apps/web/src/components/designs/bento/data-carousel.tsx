import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

import { hashSeed } from "@/components/designs/bento/bento-metrics";

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@workspace-welcome/ui/components/carousel";
import type { CarouselApi } from "@workspace-welcome/ui/components/carousel";
import { cn } from "@workspace-welcome/ui/lib/utils";

export interface DataCarouselCard {
  label: string;
  content: ReactNode;
}

interface DataCarouselProps {
  cards: DataCarouselCard[];
  ariaLabel: string;
  /**
   * Auto-advance interval in ms. Omit or 0 = manual only. Advancing pauses
   * while the pointer is over the carousel or focus sits inside it.
   */
  autoMs?: number;
  /** Loop the cycle (default true when auto-advancing). */
  loop?: boolean;
  /**
   * Deterministic stagger seed (e.g. the project path): each carousel gets
   * its own 5–9s interval and phase offset from it, so tiles never advance
   * in unison and layouts are stable across reloads.
   */
  seed?: string;
  className?: string;
}

/**
 * The bento data carousel: rich cards cycling GRAPH ↔ TABLE (or any two
 * views of the same data) with manual arrows, clickable view labels, and an
 * optional auto-advance that pauses on hover and focus. Chrome is the
 * concept's glazed idiom — mono label pills, hairline arrows.
 */
export function DataCarousel({
  cards,
  ariaLabel,
  autoMs = 0,
  loop,
  seed,
  className,
}: DataCarouselProps) {
  const [api, setApi] = useState<CarouselApi | null>(null);
  const [selected, setSelected] = useState(0);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const cycles = loop ?? autoMs > 0;

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

  // Respect prefers-reduced-motion: no auto-advance at all.
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Per-tile stagger: interval 5–9s and a phase offset, both derived from
  // the seed so siblings never advance in unison yet stay deterministic.
  const interval = useMemo(() => {
    if (autoMs <= 0) return 0;
    return 5000 + (hashSeed(seed ?? cards.map((c) => c.label).join()) % 4000);
  }, [autoMs, seed, cards]);
  const phase = useMemo(
    () => (interval > 0 ? hashSeed(`${seed ?? ""}:phase`) % interval : 0),
    [interval, seed],
  );

  useEffect(() => {
    if (interval <= 0 || reducedMotion || cards.length < 2 || !api) return;
    let timer: number;
    const tick = () => {
      if (!pausedRef.current) api.scrollNext();
      timer = window.setTimeout(tick, interval);
    };
    timer = window.setTimeout(tick, phase);
    return () => window.clearTimeout(timer);
  }, [api, interval, phase, reducedMotion, cards.length]);

  return (
    <div
      data-paused={paused || undefined}
      className={cn("b-data-carousel flex min-h-0 flex-col", className)}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      {/* The header row lives INSIDE <Carousel> — the arrows read the
          carousel context. */}
      <Carousel
        setApi={setApi}
        opts={{ loop: cycles }}
        className="flex min-h-0 flex-1 flex-col"
        aria-label={ariaLabel}
      >
        <div className="flex shrink-0 items-center gap-1.5 pb-1.5" data-stop-propagation>
          {cards.map((card, i) => (
            <button
              key={card.label}
              type="button"
              onClick={() => api?.scrollTo(i)}
              aria-pressed={selected === i}
              className={cn(
                "rounded-md px-2 py-1 font-mono text-[0.64rem] transition-colors",
                selected === i
                  ? "bg-white/[0.08] text-foreground"
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
              aria-label={`Previous ${ariaLabel} view`}
            />
            <CarouselNext
              variant="ghost"
              className="static size-6 translate-y-0 rounded-md border-transparent hover:border-border"
              aria-label={`Next ${ariaLabel} view`}
            />
          </span>
        </div>

        <CarouselContent className="min-h-0 flex-1">
          {cards.map((card) => (
            <CarouselItem key={card.label} className="flex min-h-0 flex-col">
              <div className="flex min-h-0 flex-1 flex-col">{card.content}</div>
            </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>
    </div>
  );
}
