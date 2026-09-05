import { unlinkSync } from "node:fs";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";

import { z } from "zod";

import { gitInspect } from "./git";
import { reportsDir } from "./xdg";

/**
 * Structured JSON exports of git-snitch reports.
 *
 * The snitch HTML report is self-contained and embeds its full report payload
 * as JSON (`window.__GIT_SNITCH_REPORT_DATA__`, injected by the gitsnitch
 * renderer — see ADR-0001 for how the CLI is invoked). The CLI's own --json
 * flag replaces rather than accompanies the HTML file, so instead of paying
 * for a second full scan we extract that embedded payload from the HTML the
 * run already wrote. The extracted data is exactly what `git-snitch --json`
 * would print — nothing is fabricated app-side; the only additions are the
 * cheap working-tree probes (ahead/behind/dirty file count) that the CLI
 * does not include, taken via gitInspect at save time.
 *
 * The exported shape is a stable, chart-friendly contract defined below and
 * inferred through tRPC — gitsnitch internals never leak to clients. Old
 * cached reports (or a future CLI that changes its embedding) degrade to
 * null: every reader returns null or an empty list, never throws.
 */

// --- Public contract (source of truth, inferred through tRPC) -----------------

export const reportExportSeveritySchema = z.enum([
  "info",
  "warning",
  "critical",
]);

export const reportExportCommitSchema = z.object({
  hash: z.string(),
  shortHash: z.string(),
  message: z.string(),
  author: z.string(),
  /** Author date, ISO 8601. */
  date: z.string(),
});

export const reportExportLanguageSchema = z.object({
  language: z.string(),
  files: z.number(),
  lines: z.number(),
});

export const reportExportAlertSchema = z.object({
  id: z.string(),
  label: z.string(),
  severity: reportExportSeveritySchema,
  value: z.number(),
  summary: z.string(),
});

/** Commits per reporting period — the natural time-axis chart series. */
export const reportExportCadencePointSchema = z.object({
  period: z.string(),
  commits: z.number(),
});

export const reportExportAiUsageSchema = z.object({
  records: z.number(),
  cost: z.number(),
  tokens: z.object({
    input: z.number(),
    output: z.number(),
    total: z.number(),
  }),
});

/** One chartable project entry — the unit of every report. */
export const reportExportProjectSchema = z.object({
  name: z.string(),
  /** Absolute path of the repository. */
  path: z.string(),
  /** Path relative to the scanned root; null on single-repo reports. */
  relativePath: z.string().nullable(),
  /** Branch at report time; falls back to a fresh probe when the CLI omitted it. */
  branch: z.string().nullable(),
  /** Working-tree probes taken when the export was saved; null when unknown. */
  ahead: z.number().nullable(),
  behind: z.number().nullable(),
  dirtyFileCount: z.number().nullable(),
  lastCommit: reportExportCommitSchema.nullable(),
  totalCommits: z.number(),
  contributors: z.number(),
  languages: z.array(reportExportLanguageSchema),
  cadence: z.array(reportExportCadencePointSchema),
  alerts: z.array(reportExportAlertSchema),
  aiUsage: reportExportAiUsageSchema.nullable(),
});

export const reportExportSchema = z.object({
  /** The report key — same key as the HTML file, so the pair travels together. */
  key: z.string(),
  /** CLI report kind: one repository vs. a comparative scan of a root. */
  kind: z.enum(["repo", "scan"]),
  /** Human-oriented kind: "project" (repo) vs. "root" (scan/comparative). */
  label: z.enum(["project", "root"]),
  /** Absolute path the report was run against. */
  targetPath: z.string(),
  /** git-snitch period preset the run was scoped to; null = all history. */
  period: z.string().nullable(),
  /** When the CLI generated the report. */
  generatedAt: z.string(),
  /** When this export was persisted. */
  savedAt: z.string(),
  /** Single entry for repo reports; the comparative list for scan reports. */
  projects: z.array(reportExportProjectSchema),
  totals: z.object({
    commits: z.number(),
    contributors: z.number(),
    repositories: z.number(),
    languages: z.array(reportExportLanguageSchema),
    alerts: z.array(reportExportAlertSchema),
  }),
  aiUsage: reportExportAiUsageSchema.nullable(),
});

export type ReportExport = z.infer<typeof reportExportSchema>;
export type ReportExportProject = z.infer<typeof reportExportProjectSchema>;
export type ReportExportSummary = {
  key: string;
  kind: ReportExport["kind"];
  label: ReportExport["label"];
  targetPath: string;
  generatedAt: string;
  period: string | null;
  projectCount: number;
};

// --- Staleness (single source of truth for report-backed widgets) --------------
//
// The pure predicates live in ./report-staleness (dependency-free, browser
// safe); re-exported here so existing server imports of report-export keep
// resolving. Client code should import from report-staleness directly —
// pulling this module into a browser bundle drags in node:fs.

export {
  REPORT_STALE_TOLERANCE_MS,
  isReportStale,
  latestUpdatedAtOf,
} from "./report-staleness";

// --- Raw gitsnitch payload access ---------------------------------------------
//
// The payload is parsed defensively (accessors below, no trusted shape): a
// payload that doesn't match what the CLI currently embeds degrades to null
// rather than throwing into a report run.

/** Marker the gitsnitch renderer swaps for the serialized report payload. */
const PAYLOAD_MARKER = "__GIT_SNITCH_REPORT_DATA__";

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/**
 * Index of the brace that closes the JSON object opening at `open`, honoring
 * strings and escapes. -1 when the HTML ends first (truncated report).
 */
function jsonEndAt(html: string, open: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = open; i < html.length; i++) {
    const ch = html[i];
    if (ch === undefined) break;
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

interface ReportPayloadDiscriminant {
  kind: string;
  generatedAt: string;
}

function isPayloadDiscriminant(value: unknown): value is ReportPayloadDiscriminant {
  const record = asRecord(value);
  return (
    record !== null &&
    (record.kind === "repo" || record.kind === "scan") &&
    typeof record.generatedAt === "string"
  );
}

/**
 * Extract the report payload embedded in a snitch HTML report. Returns null
 * when the HTML carries no parseable payload (old cache, future CLI format).
 * The payload text is JSON with script-safe \u escapes, which JSON.parse
 * resolves natively — no unescaping pass needed.
 */
export function extractReportPayload(html: string): unknown {
  let from = 0;
  for (;;) {
    const at = html.indexOf(PAYLOAD_MARKER, from);
    if (at === -1) return null;
    from = at + PAYLOAD_MARKER.length;
    const open = html.indexOf("{", from);
    const nextMarker = html.indexOf(PAYLOAD_MARKER, from);
    // Only the assignment site is followed by the payload: skip occurrences
    // whose next brace belongs to a later marker (e.g. the renderer's own
    // runtime lookup of the same name).
    if (open === -1 || (nextMarker !== -1 && nextMarker < open)) continue;
    const end = jsonEndAt(html, open);
    if (end === -1) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(html.slice(open, end + 1)) as unknown;
    } catch {
      continue;
    }
    if (isPayloadDiscriminant(parsed)) return parsed;
  }
}

function mapAlerts(value: unknown): ReportExport["projects"][number]["alerts"] {
  return asArray(value)
    .map((raw): z.infer<typeof reportExportAlertSchema> | null => {
      const alert = asRecord(raw);
      if (alert === null) return null;
      const id = asString(alert.id);
      const label = asString(alert.label);
      const value = asNumber(alert.value);
      const summary = asString(alert.summary);
      if (id === null || label === null || value === null || summary === null) {
        return null;
      }
      const severity = asString(alert.severity);
      return {
        id,
        label,
        value,
        summary,
        severity:
          severity === "warning" || severity === "critical" ? severity : "info",
      };
    })
    .filter((alert): alert is NonNullable<typeof alert> => alert !== null);
}

function mapLanguages(
  value: unknown,
): ReportExport["projects"][number]["languages"] {
  return asArray(value)
    .map((raw): z.infer<typeof reportExportLanguageSchema> | null => {
      const stat = asRecord(raw);
      if (stat === null) return null;
      const language = asString(stat.language);
      const files = asNumber(stat.files);
      const lines = asNumber(stat.lines);
      if (language === null || files === null || lines === null) return null;
      return { language, files, lines };
    })
    .filter((stat): stat is NonNullable<typeof stat> => stat !== null);
}

function mapCadence(
  value: unknown,
): ReportExport["projects"][number]["cadence"] {
  return asArray(value)
    .map((raw): z.infer<typeof reportExportCadencePointSchema> | null => {
      const point = asRecord(raw);
      if (point === null) return null;
      const period = asString(point.period);
      const commits = asNumber(point.commits);
      if (period === null || commits === null) return null;
      return { period, commits };
    })
    .filter((point): point is NonNullable<typeof point> => point !== null);
}

function mapAiUsage(
  value: unknown,
): z.infer<typeof reportExportAiUsageSchema> | null {
  const usage = asRecord(value);
  if (usage === null) return null;
  const records = asNumber(usage.records);
  const cost = asNumber(usage.cost);
  const tokens = asRecord(usage.tokens);
  if (records === null || cost === null || tokens === null) return null;
  const input = asNumber(tokens.input);
  const output = asNumber(tokens.output);
  const total = asNumber(tokens.total);
  if (input === null || output === null || total === null) return null;
  return { records, cost, tokens: { input, output, total } };
}

/** Newest commit of a raw commits array, by committer then author date. */
function latestCommit(
  commits: unknown[],
): z.infer<typeof reportExportCommitSchema> | null {
  let best: z.infer<typeof reportExportCommitSchema> | null = null;
  let bestAt = "";
  for (const raw of commits) {
    const commit = asRecord(raw);
    if (commit === null) continue;
    const hash = asString(commit.hash);
    const message = asString(commit.message);
    const date = asString(commit.committedAt) ?? asString(commit.authoredAt);
    if (hash === null || message === null || date === null) continue;
    const shortHash = asString(commit.shortHash) ?? hash.slice(0, 7);
    const authorName = asRecord(commit.author)?.name;
    const author = asString(authorName) ?? "unknown";
    if (best === null || date > bestAt) {
      best = { hash, shortHash, message, author, date };
      bestAt = date;
    }
  }
  return best;
}

/**
 * Map one raw repo report (gitsnitch RepoReportData shape) to a project
 * entry. Returns null when the entry lacks the identity fields a chart can
 * address a project by (name + path).
 */
function mapProject(
  raw: unknown,
  relativePath: string | null,
): ReportExportProject | null {
  const report = asRecord(raw);
  if (report === null) return null;
  const repository = asRecord(report.repository);
  if (repository === null) return null;
  const name = asString(repository.name);
  const path = asString(repository.path);
  if (name === null || path === null) return null;
  const analysis = asRecord(report.analysis);
  const commits = asArray(report.commits);
  return {
    name,
    path,
    relativePath,
    branch: asString(repository.currentBranch),
    // Probed after mapping — see probeWorkingTrees.
    ahead: null,
    behind: null,
    dirtyFileCount: null,
    lastCommit: latestCommit(commits),
    totalCommits: asNumber(repository.totalCommits) ?? commits.length,
    contributors: asNumber(repository.totalContributors) ?? 0,
    languages: mapLanguages(analysis?.languages),
    cadence: mapCadence(analysis?.cadence),
    alerts: mapAlerts(analysis?.qualitySignals),
    aiUsage: mapAiUsage(report.aiUsage),
  };
}

/**
 * Fill the working-tree fields the report payload doesn't carry. Fresh probes
 * via the shared gitInspect helper (read-only, per-call timeouts, degrades to
 * null per repo) — a chart can thus overlay unpushed/dirty state on report
 * data, but the numbers are explicitly "as of save time", not report time.
 */
async function probeWorkingTrees(projects: ReportExportProject[]): Promise<void> {
  await Promise.all(
    projects.map(async (project) => {
      const info = await gitInspect(project.path);
      project.ahead = info.ahead;
      project.behind = info.behind;
      project.dirtyFileCount = info.dirtyCount;
      if (project.branch === null) project.branch = info.branch;
    }),
  );
}

// --- Persistence ---------------------------------------------------------------

/** File a report export lands in: reportsDir/<key>.json (next to <key>.html). */
export function reportJsonPath(key: string): string {
  return join(reportsDir(), `${key}.json`);
}

/**
 * Void a previous export when a fresh run starts for the same key — mirrors
 * the HTML void in startReportRun so a re-running report never serves stale
 * data to chart consumers mid-run.
 */
export function unlinkReportJson(key: string): void {
  try {
    unlinkSync(reportJsonPath(key));
  } catch {
    // ENOENT is the normal first-run case.
  }
}

/**
 * Build the export for a finished HTML report and persist it as
 * reportsDir/<key>.json. Returns false (never throws) when the HTML carries
 * no usable payload — the report itself stays valid, only the export is
 * missing. With `overwrite` (the just-rewrote-the-HTML case) an existing
 * export for the key is replaced; otherwise an existing export short-circuits
 * the build (the backfill path for reports cached before exports existed).
 */
export async function ensureReportJson(input: {
  key: string;
  kind: "repo" | "scan";
  targetPath: string;
  period?: string;
  /** The finished report HTML this export is extracted from. */
  htmlPath: string;
  overwrite?: boolean;
}): Promise<boolean> {
  if (input.overwrite !== true) {
    try {
      const existing = await readFile(reportJsonPath(input.key), "utf8");
      if (existing.length > 0) return true;
    } catch {
      // Normal first-save case — build below.
    }
  }
  const data = await buildReportJson(input);
  if (data === null) return false;
  try {
    await writeFile(reportJsonPath(input.key), data, "utf8");
    return true;
  } catch {
    return false;
  }
}

/** Build the pretty-printed JSON document for one report, or null. */
async function buildReportJson(input: {
  key: string;
  kind: "repo" | "scan";
  targetPath: string;
  period?: string;
  htmlPath: string;
}): Promise<string | null> {
  let html: string;
  try {
    html = await readFile(input.htmlPath, "utf8");
  } catch {
    return null;
  }
  const payload = extractReportPayload(html);
  if (!isPayloadDiscriminant(payload)) return null;
  const generatedAt = payload.generatedAt;
  const projects: ReportExportProject[] =
    payload.kind === "scan"
      ? asArray(asRecord(payload)?.projects)
          .map((raw) => {
            const entry = asRecord(raw);
            if (entry === null) return null;
            return mapProject(
              entry.report,
              asString(asRecord(entry.repository)?.relativePath),
            );
          })
          .filter((p): p is ReportExportProject => p !== null)
      : [mapProject(payload, null)].filter(
          (p): p is ReportExportProject => p !== null,
        );
  if (projects.length === 0) return null;
  await probeWorkingTrees(projects);

  const scanAnalysis = asRecord(asRecord(payload)?.analysis);
  const totals =
    payload.kind === "scan" && scanAnalysis !== null
      ? {
          commits: asNumber(scanAnalysis.totalCommits) ?? 0,
          contributors: asNumber(scanAnalysis.totalContributors) ?? 0,
          repositories: asNumber(scanAnalysis.totalRepositories) ?? projects.length,
          languages: mapLanguages(scanAnalysis.languages),
          alerts: mapAlerts(scanAnalysis.qualitySignals),
        }
      : {
          commits: projects.reduce((sum, p) => sum + p.totalCommits, 0),
          contributors: projects.reduce((sum, p) => sum + p.contributors, 0),
          repositories: projects.length,
          languages: projects[0]?.languages ?? [],
          alerts: projects[0]?.alerts ?? [],
        };

  const topAiUsage =
    payload.kind === "scan"
      ? mapAiUsage(scanAnalysis?.aiUsage)
      : (projects[0]?.aiUsage ?? null);

  const exportData: ReportExport = {
    key: input.key,
    kind: payload.kind === "scan" ? "scan" : "repo",
    label: payload.kind === "scan" ? "root" : "project",
    targetPath: input.targetPath,
    period: input.period ?? null,
    generatedAt,
    savedAt: new Date().toISOString(),
    projects,
    totals,
    aiUsage: topAiUsage,
  };
  return `${JSON.stringify(exportData, null, 2)}\n`;
}

/**
 * Read a persisted export by report key. Null for a malformed key, a report
 * that predates exports, or an unreadable/corrupt file — supplementary data
 * never throws into callers. Containment mirrors readReportHtml: the key is
 * regex-validated and the resolved path must stay inside reportsDir().
 */
export async function readReportJson(key: string): Promise<ReportExport | null> {
  if (!/^(repo|scan)-[a-z0-9.-]+-[a-f0-9]{8}$/.test(key)) return null;
  const dir = reportsDir();
  const file = resolve(dir, `${key}.json`);
  if (!file.startsWith(dir + sep)) return null;
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
  const result = reportExportSchema.safeParse(parsed);
  return result.success ? result.data : null;
}

/**
 * Index of persisted exports, newest first. Skips corrupt/legacy files rather
 * than failing the listing.
 */
export async function listReportJson(): Promise<ReportExportSummary[]> {
  let names: string[];
  try {
    names = await readdir(reportsDir());
  } catch {
    return [];
  }
  const summaries = await Promise.all(
    names
      .filter((name) => name.endsWith(".json"))
      .map(async (name) => {
        const key = name.slice(0, -".json".length);
        const data = await readReportJson(key);
        if (data === null) return null;
        return {
          key,
          kind: data.kind,
          label: data.label,
          targetPath: data.targetPath,
          generatedAt: data.generatedAt,
          period: data.period,
          projectCount: data.projects.length,
        } satisfies ReportExportSummary;
      }),
  );
  return summaries
    .filter((entry): entry is ReportExportSummary => entry !== null)
    .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
}
