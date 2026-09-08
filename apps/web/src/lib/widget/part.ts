/**
 * Part definition contract (master plan §3.3, §3.5).
 *
 * `definePart` is the app-level wrapper the parts registry (`components/parts/registry.ts`,
 * P5) uses to turn a ui primitive or app part into a stamped, compliant part. One
 * source of truth for `min`: the value comes from the ui export (`MIN_CONTENT`) and
 * is passed in here — ui primitives never wrap themselves, and app imports never
 * cross into `packages/ui` for part metadata.
 *
 * Min-content negotiation (three layers, §3.3):
 * 1. Registry `min` (authored cell floor) — the runtime clamp owned by the widget
 *    registry, not here.
 * 2. Part px floors (`PartDef.min` → `data-part-min-w/h`) — advisory; the harness
 *    (M2 `part-min` probe) measures the DOM and validates them against cell density.
 * 3. Part self-degradation — in-rung variance is the part's own container-query job.
 *
 * A theme's cell density making a floor unsatisfiable at its authored class is a
 * harness finding, not runtime behavior.
 */
import { cloneElement, createElement, isValidElement } from "react";
import type { Attributes, ComponentType, FunctionComponent, ReactElement, ReactNode } from "react";

/** Advisory px floor below which a part is expected to degrade its presentation. */
export interface PartMin {
  w: number;
  h: number;
}

/**
 * A part definition: stable `id` (probe + docs identity, e.g. "donut",
 * "cadence-chart", "report-gate"), optional px `min` floor, and the component.
 * Generic over the part's own props — parts stay layout-agnostic (fill their box;
 * `h-full w-full min-h-0` is the part's job, positioning is the shell's).
 */
export interface PartDef<P extends object> {
  id: string;
  min?: PartMin;
  component: ComponentType<P>;
}

/**
 * Stamp `data-part="<id>"` and, when a px floor is declared, `data-part-min-w` /
 * `data-part-min-h` onto the part's rendered root — no wrapper element, so
 * fill-box/height chains and motion layout are untouched. Props merge shallowly:
 * if a part stamps its own `data-part`, the `definePart` id wins (the wrapper is
 * the single source of truth). Parts whose render returns nothing (e.g. a quiet
 * gate) render nothing; stamps only apply to host-element roots.
 */
export function definePart<P extends object>(def: PartDef<P>): ComponentType<P> {
  const { id, min, component: Component } = def;

  function Part(props: P): ReactNode {
    const rendered: ReactNode = createElement<P>(
      Component as FunctionComponent<P>,
      props as Attributes & P,
    );
    if (!isValidElement(rendered)) return rendered;

    return cloneElement(rendered as ReactElement<Record<string, unknown>>, {
      "data-part": id,
      ...(min === undefined
        ? {}
        : { "data-part-min-w": min.w, "data-part-min-h": min.h }),
    });
  }

  return Part;
}
