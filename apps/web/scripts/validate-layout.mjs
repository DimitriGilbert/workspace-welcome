#!/usr/bin/env node
/**
 * validate-layout runner (master plan §5 W4, grep-invariant #6).
 *
 * Loads the SHIPPED registry + preset registry (+ dev fixtures that opt in)
 * through Vite SSR — the same modules the app evaluates, aliases and
 * `import.meta.glob` included — so this check can never drift from what the
 * build serves. For every theme preset it validates both pages
 * (`dashboard`, `project`) via the pure `validatePageLayout`:
 *
 *   - every node's `widget` id resolves in the registry;
 *   - every node's `requires` ⊆ the page's provider stack;
 *   - every node's `size` is on the ladder or resolvable down it.
 *
 * Output contract matches the harness (`PASS|FAIL|WARN <check> <detail>` +
 * JSON summary); exit ≠ 0 on any FAIL. `scripts/widget-check/
 * grep-invariants.mjs` discovers and spawns this script (invariant 6).
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Report, runEntry, writeJsonOut } from "../../../scripts/widget-check/lib/report.mjs";
import { createServer } from "vite";

const WEB_ROOT = fileURLToPath(new URL("..", import.meta.url));

const CHECK = "validate-layout";

/** Dev fixtures validated alongside the (currently empty) preset registry. */
const FIXTURE_MODULES = ["/src/widgets/lab/lab-preset.ts"];

/**
 * Core layout modules loaded through Vite SSR. Single source for the
 * specifiers below; a missing one fails fast with the path named, instead
 * of surfacing as an opaque ssrLoadModule error (P0.3).
 */
const LAYOUT_MODULES = {
  registry: "/src/widgets/registry.ts",
  themes: "/src/widgets/themes/index.ts",
  validator: "/src/widgets/runtime/validate-layout.ts",
  flows: "/src/widgets/runtime/flows.ts",
};

async function loadLayoutModules() {
  for (const specifier of Object.values(LAYOUT_MODULES)) {
    const filePath = path.join(WEB_ROOT, specifier);
    if (!existsSync(filePath)) {
      throw new Error(
        `layout module ${specifier} not found at ${filePath} — the tree moved; update LAYOUT_MODULES in apps/web/scripts/validate-layout.mjs`,
      );
    }
  }
  const server = await createServer({
    root: WEB_ROOT,
    configFile: `${WEB_ROOT}/vite.config.ts`,
    logLevel: "error",
    server: { middlewareMode: true },
    appType: "custom",
  });
  try {
    const registry = await server.ssrLoadModule(LAYOUT_MODULES.registry);
    const themes = await server.ssrLoadModule(LAYOUT_MODULES.themes);
    const validator = await server.ssrLoadModule(LAYOUT_MODULES.validator);
    const flows = await server.ssrLoadModule(LAYOUT_MODULES.flows);
    const fixtures = [];
    for (const specifier of FIXTURE_MODULES) {
      try {
        fixtures.push(await server.ssrLoadModule(specifier));
      } catch {
        // A fixture that does not exist yet is not an error.
      }
    }
    return { registry, themes, validator, flows, fixtures };
  } finally {
    await server.close();
  }
}

const body = async () => {
  const outIndex = process.argv.indexOf("--out");
  const outPath = outIndex >= 0 ? process.argv[outIndex + 1] : undefined;

  const report = new Report({ suite: CHECK, meta: { root: WEB_ROOT } });

  let modules;
  try {
    modules = await loadLayoutModules();
  } catch (error) {
    report.fail(CHECK, `could not load layout modules through Vite SSR: ${error.message}`);
    await writeJsonOut(report, outPath);
    return report;
  }

  const { registry, themes, validator, flows, fixtures } = modules;
  const widgetMeta = registry.widgetRegistry;

  /** @type {{ label: string, layout: unknown }[]} */
  const pages = [];
  for (const [id, preset] of themes.themePresets) {
    pages.push({ label: `${id}:dashboard`, layout: preset.dashboard });
    pages.push({ label: `${id}:project`, layout: preset.project });
  }
  for (const fixture of fixtures) {
    if (fixture?.labPreset !== undefined) {
      pages.push({ label: "lab:ladder", layout: fixture.labPreset });
    }
  }

  if (themes.themePresets.size === 0) {
    report.warn(
      CHECK,
      "no theme presets registered yet (T1 wave) — validating dev fixtures only",
    );
  }

  let failureCount = 0;
  for (const page of pages) {
    const violations = validator.validatePageLayout({
      label: page.label,
      layout: page.layout,
      widgets: widgetMeta,
      flowKeys: flows.flowKeys(),
    });
    for (const violation of violations) {
      failureCount += 1;
      const nodePart = violation.node === undefined ? "" : ` node ${violation.node}:`;
      report.fail(
        CHECK,
        `${page.label} region ${violation.region}${nodePart} ${violation.message}`,
      );
    }
    if (violations.length === 0) {
      report.pass(CHECK, `${page.label} resolves against the registry`);
    }
  }

  if (failureCount === 0) {
    report.pass(
      CHECK,
      `${pages.length} page(s) clean · ${widgetMeta.size} registered widget kind(s)`,
    );
  }

  await writeJsonOut(report, outPath);
  return report;
};

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  await runEntry(body);
}
