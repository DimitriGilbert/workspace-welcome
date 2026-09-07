/**
 * validate-layout — the static preset/registry validator (master plan §5 W4,
 * §3.4 enforcement (b); grep-invariant #6 runs it per wave + at C1).
 *
 * Pure TS on purpose: the node runner (`apps/web/scripts/validate-layout.mjs`)
 * loads the real registry + preset registry through Vite SSR and hands their
 * metadata here, so the check always sees exactly what the app ships.
 *
 * Per page (every theme's `dashboard` + `project`, plus dev fixtures that opt
 * in) it asserts:
 *
 * 1. every preset node's `widget` id resolves in the registry;
 * 2. every node's `requires` ⊆ the page's provider stack (derived from
 *    `PageLayout.context` + `report` — the static counterpart of the
 *    renderer's dev-mode DOM assertion);
 * 3. every node's `size` exists on the ladder or resolves down it
 *    (`parseSize`-well-formed and not below the registry `min` floor);
 * 4. structural sanity: version, unique node/region ids, kebab-case node
 *    ids, non-negative anchors within the desktop grid, resolvable flow
 *    references, well-formed ladder candidates, and the same widget/size
 *    checks for authored composite `slots`.
 */
import type { PageLayout, RegionNode, WidgetNode } from "./layout-types";
import { parseSize, rankOf } from "./size-class";
import type { SizeClass } from "./size-class";
import type { ContextKey } from "../registry";

/** Structural slice of a WidgetDef the validator needs (no React). */
export interface WidgetMeta {
  id: string;
  requires: readonly ContextKey[];
  min?: SizeClass;
}

export interface LayoutViolation {
  page: string;
  region: string;
  node?: string;
  kind:
    | "version"
    | "context"
    | "columns"
    | "duplicate-node-id"
    | "duplicate-region-id"
    | "node-id-format"
    | "unregistered-widget"
    | "size-format"
    | "below-min"
    | "requires"
    | "anchor"
    | "flow-missing"
    | "ladder-format";
  message: string;
}

export interface ValidateLayoutInput {
  /** Page label for violations (e.g. "mission-control:dashboard"). */
  label: string;
  layout: PageLayout;
  /** Registry metadata by widget id. */
  widgets: ReadonlyMap<string, WidgetMeta>;
  /** Registered flow `from` keys. */
  flowKeys: readonly string[];
}

/**
 * The provider keys a page mounts, derived exactly like the renderer's
 * stack (§3.4): settings always; workspace OR project (which nests
 * workspace); report unless `layout.report === false`.
 */
export function providerStackKeys(layout: Pick<PageLayout, "context" | "report">): ContextKey[] {
  const keys: ContextKey[] = ["settings"];
  if (layout.context === "project") {
    keys.push("project", "workspace");
  } else {
    keys.push("workspace");
  }
  if (layout.report !== false) keys.push("report");
  return keys;
}

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Format + registry-min check shared by a node's base size and its v2
 * per-breakpoint overrides (`label` names the field in the message). */
function validateFootprint(
  size: SizeClass,
  label: string,
  def: WidgetMeta,
  region: string,
  nodeId: string,
  violations: Violations,
): void {
  const parsed = parseSize(size);
  if (parsed === null) {
    violations.add({
      region,
      node: nodeId,
      kind: "size-format",
      message: `${label} "${size}" is not a well-formed SizeClass`,
    });
    return;
  }
  const min = def.min === undefined ? null : parseSize(def.min);
  if (min !== null && rankOf(parsed) < rankOf(min)) {
    violations.add({
      region,
      node: nodeId,
      kind: "below-min",
      message: `${label} "${size}" is below the registry min "${def.min}" for "${def.id}"`,
    });
  }
}

class Violations {
  readonly list: LayoutViolation[] = [];

  add(violation: Omit<LayoutViolation, "page">): void {
    this.list.push({ page: this.label, ...violation });
  }

  constructor(private readonly label: string) {}
}

function validateNode(
  node: WidgetNode,
  input: ValidateLayoutInput,
  stack: ReadonlySet<ContextKey>,
  region: string,
  violations: Violations,
  seenIds: Set<string>,
): void {
  if (!KEBAB.test(node.id)) {
    violations.add({
      region,
      node: node.id,
      kind: "node-id-format",
      message: `node id "${node.id}" is not kebab-case`,
    });
  }
  if (seenIds.has(node.id)) {
    violations.add({
      region,
      node: node.id,
      kind: "duplicate-node-id",
      message: `node id "${node.id}" is used more than once on the page`,
    });
  }
  seenIds.add(node.id);

  const def = input.widgets.get(node.widget);
  if (def === undefined) {
    violations.add({
      region,
      node: node.id,
      kind: "unregistered-widget",
      message: `widget "${node.widget}" is not registered`,
    });
  } else {
    const missing = def.requires.filter((key) => !stack.has(key));
    if (missing.length > 0) {
      violations.add({
        region,
        node: node.id,
        kind: "requires",
        message: `widget "${def.id}" requires [${missing.join(", ")}] — not in the page provider stack`,
      });
    }
    validateFootprint(node.size, `size`, def, region, node.id, violations);
    // v2 per-breakpoint overrides pack at the narrower boards — same format
    // and registry-min rules as the base size; an override may not cheat the
    // widget's honest floor by naming a footprint the registry rejects.
    if (node.tablet !== undefined) {
      validateFootprint(node.tablet, "tablet size", def, region, node.id, violations);
    }
    if (node.phone !== undefined) {
      validateFootprint(node.phone, "phone size", def, region, node.id, violations);
    }
  }

  if (node.at !== undefined) {
    const desktop = input.layout.columns.desktop;
    if (
      !Number.isInteger(node.at.x) ||
      !Number.isInteger(node.at.y) ||
      node.at.x < 0 ||
      node.at.y < 0 ||
      node.at.x >= desktop
    ) {
      violations.add({
        region,
        node: node.id,
        kind: "anchor",
        message: `anchor { x: ${node.at.x}, y: ${node.at.y} } is outside the ${desktop}-column desktop grid`,
      });
    }
  }

  for (const [slot, slotNodes] of Object.entries(node.slots ?? {})) {
    for (const slotNode of slotNodes) {
      validateNode(slotNode, input, stack, `${region}/${slot}`, violations, seenIds);
    }
  }
}

function validateRegion(
  region: RegionNode,
  input: ValidateLayoutInput,
  stack: ReadonlySet<ContextKey>,
  violations: Violations,
  seenIds: Set<string>,
): void {
  if (region.kind === "stack") {
    for (const node of region.widgets) {
      validateNode(node, input, stack, region.id, violations, seenIds);
    }
    return;
  }
  if (!input.flowKeys.includes(region.from)) {
    violations.add({
      region: region.id,
      kind: "flow-missing",
      message: `flow "${region.from}" is not registered`,
    });
  }
  const template: WidgetNode = {
    id: `${region.id}-template`,
    widget: region.template.widget,
    size: "1x1",
  };
  validateNode(template, input, stack, region.id, violations, seenIds);
  for (const [tier, classes] of Object.entries(region.template.ladders ?? {})) {
    if (classes.length === 0 || classes.some((entry) => parseSize(entry) === null)) {
      violations.add({
        region: region.id,
        kind: "ladder-format",
        message: `ladder "${tier}" is empty or holds an unparseable size class`,
      });
    }
  }
}

/**
 * Validate one page layout. Never throws — every problem comes back as a
 * violation entry so one run reports everything at once.
 */
export function validatePageLayout(input: ValidateLayoutInput): LayoutViolation[] {
  const violations = new Violations(input.label);
  const { layout } = input;

  // Format generations 1|2 — v2 adds the per-breakpoint node overrides. No
  // saved-layout store exists (grid-session is module memory), so presets
  // always re-pack from code; the version is the contract a future
  // persistence layer stores and checks against.
  if (layout.version !== 1 && layout.version !== 2) {
    violations.add({
      region: "(page)",
      kind: "version",
      message: `unsupported PageLayout version ${String(layout.version)} (supported: 1, 2)`,
    });
  }
  if (layout.context !== "workspace" && layout.context !== "project") {
    violations.add({
      region: "(page)",
      kind: "context",
      message: `unknown context "${String(layout.context)}"`,
    });
  }
  for (const [breakpoint, columns] of Object.entries(layout.columns)) {
    if (!Number.isInteger(columns) || columns < 1) {
      violations.add({
        region: "(page)",
        kind: "columns",
        message: `columns.${breakpoint} must be a positive integer (got ${String(columns)})`,
      });
    }
  }

  const stack = new Set(providerStackKeys(layout));
  const seenRegionIds = new Set<string>();
  const seenNodeIds = new Set<string>();
  for (const region of layout.regions) {
    if (seenRegionIds.has(region.id)) {
      violations.add({
        region: region.id,
        kind: "duplicate-region-id",
        message: `region id "${region.id}" is used more than once`,
      });
    }
    seenRegionIds.add(region.id);
    validateRegion(region, input, stack, violations, seenNodeIds);
  }

  return violations.list;
}
