#!/usr/bin/env node
/**
 * grep-invariants.mjs — the static half of the ONE harness (§3.8): the 7
 * grep invariants, enforced per wave + at C1.
 *
 *   1. themes-deps        components/themes/** must not import recharts,
 *                         @tanstack/react-table, useTRPC, @/lib/queries,
 *                         useQuery(, useMutation( (context hooks are the
 *                         allowed data path).
 *   2. color-literals     zero color literals in apps/web/src/widgets/**,
 *                         apps/web/src/components/{themes,widgets}/**,
 *                         apps/web/src/lib/widget/** and
 *                         packages/ui/src/components/** — with a CLOSED
 *                         grandfather allowlist for legacy packages/ui files
 *                         (baseline scan, M2). Files on the list are bounded
 *                         by their baseline count (edits may shrink, never
 *                         grow); files NOT on the list must be literal-free.
 *                         widget-namespace dirs are never allowlisted.
 *   3. theme-css          color literals in theme stylesheets (components/themes)
 *                         (invariant 2 exempts custom-property DECLARATION
 *                          lines in theme tokens.css files — that is their job)
 *                         only on custom-property declaration lines (--x: ...).
 *   4. severity-vocab     zero old severity vocabulary (`"error"`/`"warn"`
 *                         comparisons/assignments against severity) and zero
 *                         `no-root` in widgets/**, components/themes/** and
 *                         ui components/**.
 *   5. theme-widgets      theme widget-kind files import ≥ 1 of
 *                         parts/widgets-engine/lib-widget/contexts/ui; no
 *                         component name collides with a registry part id;
 *                         `d="M` path data in themes is flagged (WARN).
 *   6. validate-layout    the validate-layout script runs here when present
 *                         (it lands with W4; until then a WARN note).
 *   7. no-any             zero any-typing in the system namespace
 *                         (widgets, components/themes, components/widgets,
 *                         lib/widget, scripts/widget-check, packages/ui/src)
 *                         — casts included.
 *
 * Layout honesty (P0.3): LAYOUT_PATHS below is the single source of truth
 * for where the widget system lives; the anti-vacuous guard runs before
 * everything else (invariant scans AND baseline rewrites) and hard-FAILs
 * when a configured path is missing or an expected file class under the
 * themes tree is gone — a vanished tree can never degrade to
 * WARN-and-exit-0.
 *
 * Usage:
 *   node scripts/widget-check/grep-invariants.mjs                 # all 7
 *   node scripts/widget-check/grep-invariants.mjs --update-baseline
 *   node scripts/widget-check/grep-invariants.mjs --out path.json
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { Report, runEntry, writeJsonOut } from "./lib/report.mjs";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const BASELINE_PATH = fileURLToPath(new URL("./grep-invariants.color-literals.json", import.meta.url));

// ── LAYOUT_PATHS ─────────────────────────────────────────────────────────
// Single source of truth for where the widget system lives on disk (P0.3).
// Stage A phases relocate trees; they update THIS map — and only this map —
// in lockstep, and the anti-vacuous guard (guardLayout) hard-FAILs the
// moment a path here goes stale, so a moved/vanished tree can never again
// degrade the harness to a vacuous WARN-and-exit-0. Paths are repo-relative
// with POSIX separators.
const LAYOUT_PATHS = {
  // widget namespace root (invariants 1–5 scan it via the constants below)
  widgetsDir: "apps/web/src/widgets",
  // complete theme designs: <themesDir>/<slug>/{preset.ts,tokens.css,…}
  themesDir: "apps/web/src/components/themes",
  // theme preset registry barrel (glob-based, location-relative)
  themesIndex: "apps/web/src/components/themes/index.ts",
  // widget-kind registry (core kinds + themes glob)
  widgetRegistry: "apps/web/src/components/widgets/registry.ts",
  // part-id registry read by invariant 5's collision check
  partsRegistry: "apps/web/src/widgets/parts/registry.ts",
  // invariant 2's color-literal scan scopes. grandfathered: false marks the
  // widget-namespace dirs (never allowlisted); true the legacy packages/ui
  // components bounded by the closed grandfather baseline
  colorLiteralScopes: [
    { dir: "apps/web/src/widgets", grandfathered: false },
    { dir: "apps/web/src/components/themes", grandfathered: false },
    { dir: "apps/web/src/components/widgets", grandfathered: false },
    { dir: "apps/web/src/lib/widget", grandfathered: false },
    { dir: "packages/ui/src/components", grandfathered: true },
  ],
  // invariant 4's severity-vocabulary scan scopes (old "error"/"warn" vocab
  // + no-root): the widget system's TS surface, one "code" filter for all
  severityVocabScopes: [
    "apps/web/src/widgets",
    "apps/web/src/components/themes",
    "apps/web/src/components/widgets",
    "apps/web/src/lib/widget",
    "packages/ui/src/components",
  ],
  // invariant 7's no-any scan scopes, each with its historical file filter
  // ("code" = CODE_EXTENSIONS, ".mjs" = mjs scripts only)
  noAnyScopes: [
    { dir: "apps/web/src/widgets", files: "code" },
    { dir: "apps/web/src/components/themes", files: "code" },
    { dir: "apps/web/src/components/widgets", files: "code" },
    { dir: "apps/web/src/lib/widget", files: "code" },
    { dir: "scripts/widget-check", files: ".mjs" },
    { dir: "packages/ui/src", files: "code" },
  ],
};

const THEMES_DIR = path.join(REPO_ROOT, LAYOUT_PATHS.themesDir);

// Invariant 2: the widget-namespace scopes are never allowlisted — any color
// literal under these repo-relative prefixes fails outright.
const WIDGET_NAMESPACE_PREFIXES = LAYOUT_PATHS.colorLiteralScopes
  .filter((scope) => !scope.grandfathered)
  .map((scope) => `${scope.dir}/`);

const CODE_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".mjs", ".js", ".jsx"]);
const SKIP_DIRS = new Set(["node_modules", "dist", "build", ".git", ".turbo", ".output"]);

/** File filters for LAYOUT_PATHS.noAnyScopes entries (invariant 7). */
const NO_ANY_FILTERS = {
  code: (file) => CODE_EXTENSIONS.has(path.extname(file)),
  ".mjs": (file) => file.endsWith(".mjs"),
};

// Color literal patterns (§3.8 invariant 2). Hex, CONCRETE color functions
// (rgb/hsl/oklch/… always denote a specific color), and Tailwind
// concrete-palette utility classes count; token vars and token-based
// constructors (color-mix over var(--*)) do not — the D6 parts layer
// legitimately composes tokens through color-mix.
const COLOR_PATTERNS = [
  { kind: "hex", regex: /#[0-9a-fA-F]{3,8}\b/g },
  {
    kind: "color-function",
    regex: /\b(?:rgba?|hsla?|hwb|lab|lch|oklch|oklab)\s*\(/g,
  },
  {
    kind: "palette-class",
    regex:
      /\b(?:bg|text|border|ring|fill|stroke|from|to|via|shadow|outline|decoration|divide|accent|caret|selection|placeholder)-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)(?:-\d{2,3})?\b/g,
  },
];

const FORBIDDEN_THEME_IMPORTS = [
  "recharts",
  "@tanstack/react-table",
  "useTRPC",
  "@/lib/queries",
  "useQuery(",
  "useMutation(",
];

const OLD_SEVERITY_PATTERNS = [
  { kind: "comparison", regex: /\bseverity\s*(?:===|!==|==|!=)\s*["'](?:error|warn)["']/g },
  { kind: "comparison", regex: /["'](?:error|warn)["']\s*(?:===|!==|==|!=)\s*\bseverity\b/gi },
  { kind: "assignment", regex: /\bseverity\s*:\s*["'](?:error|warn)["']/g },
  { kind: "legacy-marker", regex: /\bno-root\b/g },
];

const ANY_PATTERNS = [
  { kind: "as-any", regex: /\bas\s+any\b/g },
  { kind: "typed-any", regex: /:\s*any\b/g },
  { kind: "generic-any", regex: /<any\s*[,>]/g },
  { kind: "array-any", regex: /\bany\[\]/g },
];

/** Recursively list files under `dir` (empty when the dir does not exist). */
function walkFiles(dir, filter) {
  const found = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) found.push(...walkFiles(fullPath, filter));
    } else if (filter === undefined || filter(fullPath)) {
      found.push(fullPath);
    }
  }
  return found;
}

function relToRepo(filePath) {
  return path.relative(REPO_ROOT, filePath);
}

function readLines(filePath) {
  return readFileSync(filePath, "utf8").split("\n");
}

function countMatches(lines, patterns) {
  const hits = [];
  lines.forEach((line, index) => {
    for (const pattern of patterns) {
      pattern.regex.lastIndex = 0;
      let match = pattern.regex.exec(line);
      while (match !== null) {
        hits.push({ line: index + 1, kind: pattern.kind, snippet: line.trim().slice(0, 140) });
        match = pattern.regex.exec(line);
      }
    }
  });
  return hits;
}

function countColorLiterals(lines) {
  const hits = [];
  lines.forEach((line, index) => {
    for (const pattern of COLOR_PATTERNS) {
      pattern.regex.lastIndex = 0;
      let match = pattern.regex.exec(line);
      while (match !== null) {
        hits.push({ line: index + 1, kind: pattern.kind, snippet: line.trim().slice(0, 140) });
        match = pattern.regex.exec(line);
      }
    }
  });
  return hits;
}

function loadBaseline() {
  try {
    const raw = JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
    return { files: raw.files ?? {}, updated: raw.updated ?? "(unknown)" };
  } catch {
    return { files: {}, updated: "(no baseline yet)" };
  }
}

// ── Anti-vacuous guard (P0.3) ────────────────────────────────────────────
// Walking a vanished directory yields zero files, and "nothing to check"
// historically degraded to a WARN-and-exit-0 — a green harness guarding
// nothing. guardLayout runs before every invariant and before any baseline
// rewrite; a stale LAYOUT_PATHS entry or a missing expected file class is a
// hard FAIL (exit 1) naming the path. Silent on a healthy tree.
const EXPECTED_THEME_FILE_CLASSES = [
  { kind: "preset.ts", pattern: /^[^\\/]+[\\/]preset\.ts$/, expected: 3 },
  { kind: "tokens.css", pattern: /^[^\\/]+[\\/]tokens\.css$/, expected: 3 },
  { kind: "custom.css", pattern: /^[^\\/]+[\\/]custom\.css$/, expected: 3 },
  { kind: "scheme-*.css", pattern: /^[^\\/]+[\\/]scheme-[^\\/]+\.css$/, expected: 3 },
];
const MIN_THEME_WIDGET_FILES = 40;

/**
 * @returns {boolean} true when every LAYOUT_PATHS entry resolves and the
 * themes tree still carries its expected file classes.
 */
function guardLayout(report) {
  const required = [
    ["widget namespace", LAYOUT_PATHS.widgetsDir],
    ["themes tree", LAYOUT_PATHS.themesDir],
    ["themes index", LAYOUT_PATHS.themesIndex],
    ["widget-kind registry", LAYOUT_PATHS.widgetRegistry],
    ["part-id registry", LAYOUT_PATHS.partsRegistry],
    ...LAYOUT_PATHS.colorLiteralScopes.map((scope) => ["color-literal scope", scope.dir]),
    ...LAYOUT_PATHS.severityVocabScopes.map((dir) => ["severity-vocab scope", dir]),
    ...LAYOUT_PATHS.noAnyScopes.map((scope) => ["no-any scope", scope.dir]),
  ];
  let ok = true;
  for (const [label, rel] of required) {
    if (!existsSync(path.join(REPO_ROOT, rel))) {
      report.fail("layout-paths", `${label} missing: ${rel} — LAYOUT_PATHS in scripts/widget-check/grep-invariants.mjs is stale`);
      ok = false;
    }
  }
  if (!ok) return false;
  const themeRels = walkFiles(THEMES_DIR).map((file) => path.relative(THEMES_DIR, file));
  for (const { kind, pattern, expected } of EXPECTED_THEME_FILE_CLASSES) {
    const found = themeRels.filter((rel) => pattern.test(rel)).length;
    if (found !== expected) {
      report.fail("layout-paths", `expected exactly ${expected} ${kind} under ${LAYOUT_PATHS.themesDir}/<slug>/, found ${found}`);
      ok = false;
    }
  }
  const themeWidgetFiles = themeRels.filter((rel) => /^[^\\/]+[\\/]widgets[\\/]/.test(rel)).length;
  if (themeWidgetFiles < MIN_THEME_WIDGET_FILES) {
    report.fail("layout-paths", `expected ≥${MIN_THEME_WIDGET_FILES} files under ${LAYOUT_PATHS.themesDir}/*/widgets/, found ${themeWidgetFiles}`);
    ok = false;
  }
  return ok;
}

/** Invariant 2's live scan: color-literal counts per file for all scopes. */
function scanColorLiterals() {
  const perFile = new Map();
  const files = LAYOUT_PATHS.colorLiteralScopes.flatMap((scope) =>
    walkFiles(path.join(REPO_ROOT, scope.dir), (file) => CODE_EXTENSIONS.has(path.extname(file)) || file.endsWith(".css")),
  );
  for (const file of files) {
    // Theme tokens.css AND scheme-*.css files declare the preset's token
    // VALUES — literals on custom-property declaration lines are their
    // purpose (§3.6.1/invariant 3; schemes ship the full manifest per color
    // scheme). Consumption sites (property: var/color literals) stay
    // zero-tolerance.
    const isThemeTokenSheet =
      file.includes(`${path.sep}themes${path.sep}`) &&
      (file.endsWith("tokens.css") || path.basename(file).startsWith("scheme-"));
    const lines = readLines(file);
    const scanned = isThemeTokenSheet
      ? lines.filter((line) => !/^\s*--[a-z0-9-]+\s*:/i.test(line))
      : lines;
    const hits = countColorLiterals(scanned);
    if (hits.length > 0) perFile.set(relToRepo(file), { path: file, hits });
  }
  return perFile;
}

function updateBaseline(report) {
  const perFile = scanColorLiterals();
  const files = {};
  for (const [rel, info] of perFile) {
    files[rel] = info.hits.length;
  }
  const sorted = Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b)));
  const payload = {
    description:
      "CLOSED grandfather allowlist of legacy packages/ui files containing color literals (invariant 2). " +
      "Regenerate with: node scripts/widget-check/grep-invariants.mjs --update-baseline. " +
      "Files on this list are legacy code slated for deletion at K1-K4: their literal count is an UPPER BOUND " +
      "(edits must shrink it, growth fails). New files and everything under " +
      `${WIDGET_NAMESPACE_PREFIXES.map((prefix) => `${prefix}**`).join(" and ")} are never allowlisted — any color literal there fails.`,
    updated: new Date().toISOString(),
    files: sorted,
  };
  writeFileSync(BASELINE_PATH, `${JSON.stringify(payload, null, 2)}\n`);
  report.pass("color-literals", `baseline regenerated: ${Object.keys(sorted).length} legacy file(s) grandfathered`);
}

const body = async () => {
  const args = process.argv.slice(2);
  const updateBaselineOnly = args.includes("--update-baseline");
  const outIndex = args.indexOf("--out");
  const outPath = outIndex >= 0 ? args[outIndex + 1] : undefined;

  const report = new Report({ suite: "grep-invariants", meta: { repoRoot: REPO_ROOT } });

  // Anti-vacuous gate: never scan (or rewrite the baseline against) a tree
  // LAYOUT_PATHS cannot resolve — fail loudly instead.
  if (!guardLayout(report)) {
    await writeJsonOut(report, outPath);
    return report;
  }

  if (updateBaselineOnly) {
    updateBaseline(report);
    await writeJsonOut(report, outPath);
    return report;
  }

  // ── Invariant 1: themes-deps ────────────────────────────────────────────
  {
    const themeFiles = walkFiles(THEMES_DIR, (file) => CODE_EXTENSIONS.has(path.extname(file)));
    const violations = [];
    for (const file of themeFiles) {
      const lines = readLines(file);
      lines.forEach((line, index) => {
        for (const needle of FORBIDDEN_THEME_IMPORTS) {
          if (line.includes(needle)) {
            violations.push(`${relToRepo(file)}:${index + 1} references ${needle}`);
          }
        }
      });
    }
    if (themeFiles.length === 0) {
      report.warn("themes-deps", "no theme files exist yet (T1 wave) — nothing to check");
    } else if (violations.length > 0) {
      for (const violation of violations.slice(0, 10)) report.fail("themes-deps", violation);
      if (violations.length > 10) report.fail("themes-deps", `…and ${violations.length - 10} more`);
    } else {
      report.pass("themes-deps", `${themeFiles.length} theme file(s) free of chart/table/query imports`);
    }
  }

  // ── Invariant 2: color-literals (closed grandfather allowlist) ─────────
  {
    const perFile = scanColorLiterals();
    const baseline = loadBaseline();
    const unlisted = [];
    const grown = [];
    const widgetsWithLiterals = [];
    for (const [rel, info] of perFile) {
      const inWidgetNamespace = WIDGET_NAMESPACE_PREFIXES.some((prefix) => rel.startsWith(prefix));
      const allowed = baseline.files[rel];
      if (inWidgetNamespace) {
        widgetsWithLiterals.push(`${rel}:${info.hits.length}`);
      } else if (allowed === undefined) {
        unlisted.push(`${rel} (${info.hits.length} literal(s))`);
      } else if (info.hits.length > allowed) {
        grown.push(`${rel} grew ${allowed} → ${info.hits.length}`);
      }
    }
    let ok = true;
    for (const entry of widgetsWithLiterals.slice(0, 10)) {
      report.fail("color-literals", `color literal(s) in the widget namespace: ${entry}`);
      ok = false;
    }
    for (const entry of unlisted.slice(0, 10)) {
      report.fail("color-literals", `color literal(s) in a file with no grandfather entry: ${entry}`);
      ok = false;
    }
    for (const entry of grown.slice(0, 10)) {
      report.fail("color-literals", `grandfathered file grew its literal count: ${entry}`);
      ok = false;
    }
    if (ok) {
      const grandfathered = Object.keys(baseline.files).length;
      report.pass(
        "color-literals",
        `zero literals in the widget namespace; packages/ui grandfather list intact (baseline ${baseline.updated}, ${grandfathered} file(s))`,
      );
    }
  }

  // ── Invariant 3: theme CSS literals only on declaration lines ──────────
  {
    const cssFiles = walkFiles(THEMES_DIR, (file) => file.endsWith(".css"));
    const violations = [];
    for (const file of cssFiles) {
      readLines(file).forEach((line, index) => {
        const hasLiteral = countColorLiterals([line]).length > 0;
        if (hasLiteral && !/^\s*--[\w-]+\s*:/.test(line)) {
          violations.push(`${relToRepo(file)}:${index + 1} — ${line.trim().slice(0, 100)}`);
        }
      });
    }
    if (cssFiles.length === 0) {
      report.warn("theme-css", "no theme CSS files exist yet (T1 wave) — nothing to check");
    } else if (violations.length > 0) {
      for (const violation of violations.slice(0, 10)) report.fail("theme-css", violation);
      if (violations.length > 10) report.fail("theme-css", `…and ${violations.length - 10} more`);
    } else {
      report.pass("theme-css", `${cssFiles.length} theme stylesheet(s): literals only on custom-property declarations`);
    }
  }

  // ── Invariant 4: severity vocabulary + no-root ─────────────────────────
  {
    const files = LAYOUT_PATHS.severityVocabScopes.flatMap((dir) =>
      walkFiles(path.join(REPO_ROOT, dir), (file) => CODE_EXTENSIONS.has(path.extname(file))),
    );
    const violations = [];
    for (const file of files) {
      for (const hit of countMatches(readLines(file), OLD_SEVERITY_PATTERNS)) {
        violations.push(`${relToRepo(file)}:${hit.line} ${hit.kind} — ${hit.snippet}`);
      }
    }
    if (violations.length > 0) {
      for (const violation of violations.slice(0, 10)) report.fail("severity-vocab", violation);
      if (violations.length > 10) report.fail("severity-vocab", `…and ${violations.length - 10} more`);
    } else {
      report.pass("severity-vocab", `${files.length} file(s): canonical severity only, no "no-root"`);
    }
  }

  // ── Invariant 5: theme widget kinds ────────────────────────────────────
  {
    const themeWidgetFiles = walkFiles(THEMES_DIR, (file) => {
      if (!CODE_EXTENSIONS.has(path.extname(file))) return false;
      // Scope: theme WIDGET-KIND files (themes/<slug>/widgets/*, minus the
      // index.ts barrel — an export surface, not a kind; the plan lets it
      // start empty-ish). Presets + token stylesheets are layout data.
      if (path.basename(file) === "index.ts") return false;
      const rel = path.relative(THEMES_DIR, file);
      return /^[^\\/]+[\\/]widgets[\\/].+/.test(rel);
    });
    const registryPath = path.join(REPO_ROOT, LAYOUT_PATHS.partsRegistry);
    /** @type {string[]} */
    let partIds = [];
    const registryExists = (() => {
      try {
        readFileSync(registryPath, "utf8");
        return true;
      } catch {
        return false;
      }
    })();
    if (registryExists) {
      partIds = [...readFileSync(registryPath, "utf8").matchAll(/\bid\s*:\s*["']([\w-]+)["']/g)].map(
        (match) => match[1],
      );
    }

    const importViolations = [];
    const collisions = [];
    const pathDataFlags = [];
    for (const file of themeWidgetFiles) {
      // utf8 matters: with no encoding readFileSync returns a Buffer whose
      // inherited Uint8Array.join("\n") concatenates byte NUMBERS — the
      // includes() checks below would never match any import.
      const content = readFileSync(file, "utf8");
      const importsSystem =
        content.includes("@/widgets/parts") ||
        content.includes("@/components/widgets") ||
        content.includes("@/lib/widget") ||
        content.includes("@/widgets/contexts") ||
        content.includes("@workspace-welcome/ui") ||
        content.includes("../parts") ||
        content.includes("../../runtime") ||
        content.includes("../../contexts");
      if (!importsSystem) {
        importViolations.push(`${relToRepo(file)} imports none of parts/runtime/contexts/ui`);
      }
      for (const match of content.matchAll(/d\s*=\s*["']M/g)) {
        pathDataFlags.push(
          `${relToRepo(file)}:${content.slice(0, match.index ?? 0).split("\n").length} contains SVG path data (d="M…) — parts own geometry`,
        );
      }
      for (const declaration of content.matchAll(/(?:function|const)\s+([A-Z][A-Za-z0-9]+)\s*[=(]/g)) {
        const componentName = declaration[1];
        const kebab = componentName.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
        if (partIds.includes(kebab)) {
          collisions.push(`${relToRepo(file)}: component ${componentName} collides with registry part id "${kebab}"`);
        }
      }
    }
    if (themeWidgetFiles.length === 0) {
      report.warn("theme-widgets", "no theme widget-kind files exist yet (T1 wave) — nothing to check");
    } else {
      let ok = true;
      for (const violation of importViolations.slice(0, 10)) {
        report.fail("theme-widgets", violation);
        ok = false;
      }
      for (const collision of collisions.slice(0, 10)) {
        report.fail("theme-widgets", collision);
        ok = false;
      }
      for (const flag of pathDataFlags.slice(0, 10)) {
        report.warn("theme-widgets", flag);
      }
      if (ok) {
        report.pass(
          "theme-widgets",
          `${themeWidgetFiles.length} theme widget file(s) compose parts/runtime/contexts; no part-id collisions (${partIds.length} registry part(s) known)`,
        );
      }
    }
  }

  // ── Invariant 6: validate-layout runs here ─────────────────────────────
  {
    const candidates = [
      path.join(REPO_ROOT, "scripts/validate-layout.mjs"),
      path.join(REPO_ROOT, "apps/web/scripts/validate-layout.mjs"),
      path.join(REPO_ROOT, "apps/web/src/widgets/validate-layout.mjs"),
    ];
    const scriptPath = candidates.find((candidate) => {
      try {
        readFileSync(candidate, "utf8");
        return true;
      } catch {
        return false;
      }
    });
    if (scriptPath === undefined) {
      report.warn("validate-layout", "validate-layout script not present yet (lands with W4) — skipped");
    } else {
      const result = spawnSync(process.execPath, [scriptPath], { cwd: REPO_ROOT, encoding: "utf8" });
      if (result.status !== 0) {
        report.fail(
          "validate-layout",
          `script exited ${result.status}: ${(result.stdout ?? "").trim().slice(-200) || (result.stderr ?? "").trim().slice(-200)}`,
        );
      } else {
        report.pass("validate-layout", `${relToRepo(scriptPath)} ran clean`);
      }
    }
  }

  // ── Invariant 7: no any ────────────────────────────────────────────────
  {
    const files = LAYOUT_PATHS.noAnyScopes.flatMap((scope) =>
      walkFiles(path.join(REPO_ROOT, scope.dir), NO_ANY_FILTERS[scope.files]),
    );
    const violations = [];
    for (const file of files) {
      for (const hit of countMatches(readLines(file), ANY_PATTERNS)) {
        violations.push(`${relToRepo(file)}:${hit.line} ${hit.kind} — ${hit.snippet}`);
      }
    }
    if (violations.length > 0) {
      for (const violation of violations.slice(0, 15)) report.fail("no-any", violation);
      if (violations.length > 15) report.fail("no-any", `…and ${violations.length - 15} more`);
    } else {
      report.pass("no-any", `${files.length} system-namespace file(s) free of any`);
    }
  }

  await writeJsonOut(report, outPath);
  return report;
};

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  await runEntry(body);
}
