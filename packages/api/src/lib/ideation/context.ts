import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";

import { agentsMdConfigFromBtsJsonc, parseBtsJsonc } from "../agents-md/bts-jsonc";
import { buildStackView } from "../agents-md/stack-view";
import { commitLog, gitInspect } from "../git";
import { mergeDenylist } from "../scan";
import { readSettings } from "../store";
import type { BtsJsoncConfig } from "../agents-md/types";

/**
 * Project context gatherer (PRD §4.1 context.ts): snapshots what the ideation
 * prompts need to know about a project — its bts.jsonc stack, a depth-limited
 * file tree, the README, git state — next to the user-typed idea, as one plain
 * JSON value that session.ts freezes to `.ideadump/ideation/<id>/context.json`
 * at session start.
 *
 * Server-only: Node imports throughout, never pulled into client-consumable
 * modules (the client-safe half of the pipeline is ideation/shared.ts).
 *
 * Failure policy: every component is optional and non-fatal — a project
 * without bts.jsonc, a non-repo, or a missing README simply omits that
 * component instead of throwing. Only errors on the project path itself
 * bubble to the caller (containment is enforced upstream, not here).
 */

/** Directory names skipped in addition to the scanner denylist (PRD §5). */
const EXTRA_DENIED_DIRS: readonly string[] = [".ideadump"];

/** File-tree caps: depth (project-root children = 1), per-directory, total. */
const TREE_MAX_DEPTH = 3;
const TREE_MAX_ENTRIES_PER_DIR = 40;
const TREE_MAX_TOTAL_ENTRIES = 200;

/** README content cap, in characters. */
const README_MAX_CHARS = 8_000;

/** How many recent commit subjects to include when the repo allows it. */
const RECENT_COMMIT_LIMIT = 5;

/** Commit-subject cap inside the human-readable summary. */
const SUMMARY_SUBJECT_MAX_CHARS = 60;

/** Root README candidates, first match wins. */
const README_CANDIDATES: readonly string[] = ["README.md", "README", "readme.md"];

/** Extensions treated as binary: such files never enter the tree summary. */
const BINARY_EXTENSIONS: ReadonlySet<string> = new Set([
  // images
  "png", "jpg", "jpeg", "gif", "webp", "avif", "bmp", "ico", "tif", "tiff",
  // audio / video
  "mp3", "wav", "flac", "ogg", "m4a", "aac", "mp4", "mov", "webm", "avi", "mkv", "m4v",
  // archives
  "zip", "tar", "gz", "tgz", "bz2", "xz", "7z", "rar",
  // documents
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
  // native artifacts
  "exe", "dll", "so", "dylib", "bin", "o", "a", "class", "jar", "wasm", "node",
  // fonts
  "woff", "woff2", "ttf", "otf", "eot",
  // opaque data
  "sqlite", "db", "dat", "psd",
]);

// --- shape --------------------------------------------------------------------

/** Stack summary derived from a parsed bts.jsonc; "none" values are null. */
export interface IdeationStackSummary {
  /** One-line description, reusing the AGENTS.md stack view's renderer. */
  description: string;
  /** Project name with original casing when the reproducible command has it. */
  projectName: string;
  packageManager: string;
  frontends: readonly string[];
  native: string | null;
  /** "self" means server routes inside the app rather than a split server. */
  backend: string | null;
  runtime: string | null;
  api: string | null;
  database: string | null;
  orm: string | null;
  auth: string | null;
  payments: string | null;
  webDeploy: string | null;
  serverDeploy: string | null;
  addons: readonly string[];
}

/** One node of the depth-limited file tree; directories carry children. */
export type IdeationFileTreeEntry =
  | { kind: "dir"; name: string; children: readonly IdeationFileTreeEntry[] }
  | { kind: "file"; name: string };

export interface IdeationFileTree {
  /** Directory depth cap represented (project-root children = 1). */
  maxDepth: number;
  /** Total entries included across all levels. */
  entryCount: number;
  /** True when per-directory or total entry caps dropped entries. */
  truncated: boolean;
  entries: readonly IdeationFileTreeEntry[];
}

export interface IdeationReadmeSummary {
  /** The candidate file name that matched at the project root. */
  file: string;
  /** First README_MAX_CHARS characters of the README. */
  content: string;
  /** Full character length before capping. */
  totalLength: number;
  /** True when content was cut at README_MAX_CHARS. */
  truncated: boolean;
}

/** One recent commit from the cheap `git log` walk. */
export interface IdeationRecentCommit {
  hash: string;
  subject: string;
  author: string;
  /** ISO timestamp derived from the commit time. */
  date: string;
}

export interface IdeationGitSummary {
  branch: string | null;
  /** True when the working tree has no uncommitted changes; null when unknown. */
  clean: boolean | null;
  /** Uncommitted file count; null when the status probe failed. */
  dirtyCount: number | null;
  /** Commits on the local branch not on upstream; null without upstream. */
  ahead: number | null;
  /** Commits on upstream not on the local branch; null without upstream. */
  behind: number | null;
  /** gitInspect's single latest commit, or null on an empty repo. */
  lastCommit: {
    message: string;
    author: string;
    /** ISO timestamp; null when git did not report one. */
    date: string | null;
  } | null;
  /** Newest-first recent commits; empty when the log walk failed. */
  recentCommits: readonly IdeationRecentCommit[];
}

/**
 * The frozen gatherer output: plain JSON only (no Map/Set/class instances),
 * so it round-trips through JSON.stringify into context.json unchanged.
 */
export interface IdeationProjectContext {
  /** Absolute path of the gathered project. */
  projectPath: string;
  /** ISO timestamp of the gather. */
  gatheredAt: string;
  /** The user-typed idea, verbatim. */
  idea: string;
  /** From bts.jsonc; null when the project is not better-t-stack. */
  stack: IdeationStackSummary | null;
  /** Always present; possibly empty when nothing readable remains. */
  fileTree: IdeationFileTree;
  /** First matching README at the project root; null when absent. */
  readme: IdeationReadmeSummary | null;
  /** From gitInspect plus a cheap log walk; null when not a git repo. */
  git: IdeationGitSummary | null;
}

export interface IdeationContextResult {
  /** The freezable context value written to context.json at session start. */
  context: IdeationProjectContext;
  /** Short human-readable one-liner for the panel's seeded-context display. */
  contextSummary: string;
}

// --- gather -------------------------------------------------------------------

/**
 * Gather a project's ideation context: bts.jsonc stack, depth-limited file
 * tree (honoring the scanner denylist plus `.ideadump`), README, git state,
 * and the user-typed idea — all components best-effort, the path itself not.
 */
export async function gatherProjectContext(
  projectPath: string,
  idea: string,
): Promise<IdeationContextResult> {
  // The scanner's denylist (defaults plus the user's excludeGlobs) keeps the
  // walk out of node_modules, .git, build outputs, … — the same set the scan
  // cache uses, so both views of a project agree on what counts.
  const deny = mergeDenylist(await readSettings());
  for (const name of EXTRA_DENIED_DIRS) deny.add(name);

  const [stack, fileTree, readme, git] = await Promise.all([
    readStackSummary(projectPath),
    buildFileTree(projectPath, deny),
    readReadme(projectPath),
    gatherGitState(projectPath),
  ]);

  const context: IdeationProjectContext = {
    projectPath,
    gatheredAt: new Date().toISOString(),
    idea,
    stack,
    fileTree,
    readme,
    git,
  };

  return { context, contextSummary: buildContextSummary(context) };
}

/** bts.jsonc → stack summary; any read or parse failure omits the component. */
async function readStackSummary(
  projectPath: string,
): Promise<IdeationStackSummary | null> {
  try {
    const text = await readFile(join(projectPath, "bts.jsonc"), "utf8");
    return stackSummaryFromBtsConfig(parseBtsJsonc(text), projectPath);
  } catch {
    return null;
  }
}

function stackSummaryFromBtsConfig(
  config: BtsJsoncConfig,
  projectPath: string,
): IdeationStackSummary {
  // Mirrors agents-md/cli.ts's private projectNameFrom: the reproducible
  // command carries the project name with its original casing, the directory
  // usually only a lowercased copy.
  const match = /better-t-stack@latest\s+(\S+)/.exec(config.reproducibleCommand);
  const projectName = match?.[1] ?? basename(projectPath);
  const normalized = agentsMdConfigFromBtsJsonc(config, projectName);
  return {
    description: buildStackView(normalized).description,
    projectName,
    packageManager: normalized.packageManager,
    frontends: [...normalized.frontends],
    native: normalized.native === "none" ? null : normalized.native,
    backend: normalized.backend === "none" ? null : normalized.backend,
    runtime: normalized.runtime === "none" ? null : normalized.runtime,
    api: normalized.api === "none" ? null : normalized.api,
    database: normalized.database === "none" ? null : normalized.database,
    orm: normalized.orm === "none" ? null : normalized.orm,
    auth: normalized.auth === "none" ? null : normalized.auth,
    payments: normalized.payments === "none" ? null : normalized.payments,
    webDeploy: normalized.webDeploy === "none" ? null : normalized.webDeploy,
    serverDeploy: normalized.serverDeploy === "none" ? null : normalized.serverDeploy,
    addons: [...normalized.addons],
  };
}

interface TreeBudget {
  /** Remaining entries before the total cap truncates the walk. */
  remaining: number;
  /** Set when any entry was dropped by a cap. */
  truncated: boolean;
}

async function buildFileTree(
  projectPath: string,
  deny: ReadonlySet<string>,
): Promise<IdeationFileTree> {
  const budget: TreeBudget = {
    remaining: TREE_MAX_TOTAL_ENTRIES,
    truncated: false,
  };
  // The root readdir is deliberately uncaught: an unreadable project path is
  // a path error and bubbles to the caller (containment lives upstream).
  const entries = await collectTreeEntries(projectPath, deny, 1, budget);
  return {
    maxDepth: TREE_MAX_DEPTH,
    entryCount: TREE_MAX_TOTAL_ENTRIES - budget.remaining,
    truncated: budget.truncated,
    entries,
  };
}

/**
 * One level of the depth-limited tree. Nested readdir failures degrade to an
 * empty children list (matching scan.ts's newestMtime behavior). Directories
 * sort before files, each alphabetically, so the frozen tree is deterministic.
 */
async function collectTreeEntries(
  dir: string,
  deny: ReadonlySet<string>,
  childDepth: number,
  budget: TreeBudget,
): Promise<IdeationFileTreeEntry[]> {
  if (childDepth > TREE_MAX_DEPTH) return [];

  const dirents = await readdir(dir, { withFileTypes: true });
  dirents.sort((a, b) => {
    const aDir = a.isDirectory();
    const bDir = b.isDirectory();
    if (aDir !== bDir) return aDir ? -1 : 1;
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });

  const entries: IdeationFileTreeEntry[] = [];
  let kept = 0;
  for (const dirent of dirents) {
    if (dirent.isDirectory()) {
      if (deny.has(dirent.name)) continue;
    } else if (!dirent.isFile() || isBinaryLooking(dirent.name)) {
      // Symlinks, sockets, fifos, and binary-looking files never appear.
      continue;
    }
    if (kept >= TREE_MAX_ENTRIES_PER_DIR || budget.remaining <= 0) {
      budget.truncated = true;
      break;
    }
    kept++;
    budget.remaining--;
    if (dirent.isDirectory()) {
      entries.push({
        kind: "dir",
        name: dirent.name,
        children: await collectTreeEntries(
          join(dir, dirent.name),
          deny,
          childDepth + 1,
          budget,
        ).catch(() => []),
      });
    } else {
      entries.push({ kind: "file", name: dirent.name });
    }
  }
  return entries;
}

function isBinaryLooking(name: string): boolean {
  const dot = name.lastIndexOf(".");
  // No extension, or a dotfile like ".gitignore" — judged by name only.
  if (dot <= 0) return false;
  return BINARY_EXTENSIONS.has(name.slice(dot + 1).toLowerCase());
}

/** First matching README candidate, length-capped; null when none exists. */
async function readReadme(
  projectPath: string,
): Promise<IdeationReadmeSummary | null> {
  for (const file of README_CANDIDATES) {
    const content = await readFile(join(projectPath, file), "utf8").catch(
      () => null,
    );
    if (content === null) continue;
    return {
      file,
      content:
        content.length > README_MAX_CHARS
          ? content.slice(0, README_MAX_CHARS)
          : content,
      totalLength: content.length,
      truncated: content.length > README_MAX_CHARS,
    };
  }
  return null;
}

/** gitInspect state plus a cheap recent-log walk; null for non-repos. */
async function gatherGitState(
  projectPath: string,
): Promise<IdeationGitSummary | null> {
  const info = await gitInspect(projectPath);
  if (!info.isRepo) return null;

  const log = await commitLog(projectPath, RECENT_COMMIT_LIMIT);
  return {
    branch: info.branch,
    clean: info.dirtyCount === null ? null : info.dirtyCount === 0,
    dirtyCount: info.dirtyCount,
    ahead: info.ahead,
    behind: info.behind,
    lastCommit: info.lastCommit,
    recentCommits: log.map((entry) => ({
      hash: entry.hash,
      subject: entry.subject,
      author: entry.author,
      date: new Date(entry.timestamp * 1000).toISOString(),
    })),
  };
}

// --- summary ------------------------------------------------------------------

function buildContextSummary(context: IdeationProjectContext): string {
  const bits: string[] = [];

  bits.push(
    context.stack === null
      ? "no bts.jsonc (not better-t-stack)"
      : `better-t-stack (${shortStackSummary(context.stack)})`,
  );

  const tree = context.fileTree;
  bits.push(
    `${tree.entryCount} entries (depth ≤ ${tree.maxDepth}${tree.truncated ? ", capped" : ""})`,
  );

  bits.push(context.readme === null ? "no README" : context.readme.file);

  bits.push(context.git === null ? "not a git repo" : shortGitSummary(context.git));

  return bits.join(" · ");
}

/** Compact stack one-liner: "tanstack-start · trpc · drizzle/postgres · pnpm". */
function shortStackSummary(stack: IdeationStackSummary): string {
  const parts: string[] = [];
  if (stack.frontends.length > 0) parts.push(stack.frontends.join(" + "));
  if (stack.native !== null) parts.push(stack.native);
  if (stack.backend !== null) parts.push(stack.backend);
  if (stack.api !== null) parts.push(stack.api);
  if (stack.orm !== null && stack.database !== null) {
    parts.push(`${stack.orm}/${stack.database}`);
  } else {
    if (stack.database !== null) parts.push(stack.database);
    if (stack.orm !== null) parts.push(stack.orm);
  }
  if (stack.auth !== null) parts.push(stack.auth);
  if (stack.payments !== null) parts.push(stack.payments);
  parts.push(stack.packageManager);
  return parts.join(" · ");
}

/** Compact git one-liner: "git: main, clean, latest 2 days ago: fix scan cache". */
function shortGitSummary(git: IdeationGitSummary): string {
  const parts: string[] = [];
  if (git.branch !== null) parts.push(git.branch);
  if (git.clean === true) parts.push("clean");
  else if (git.dirtyCount !== null) parts.push(`${git.dirtyCount} uncommitted`);

  const latest = git.lastCommit;
  const subject =
    latest !== null ? latest.message : git.recentCommits[0]?.subject ?? null;
  const date = latest !== null ? latest.date : git.recentCommits[0]?.date ?? null;
  if (subject !== null) {
    const trimmed = truncateText(subject, SUMMARY_SUBJECT_MAX_CHARS);
    parts.push(
      date === null
        ? `latest: ${trimmed}`
        : `latest ${relativeDays(date)}: ${trimmed}`,
    );
  }
  return `git: ${parts.join(", ")}`;
}

function relativeDays(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (!Number.isFinite(days) || days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 31) return `${days} days ago`;
  return `${Math.floor(days / 30)} months ago`;
}

function truncateText(text: string, maxChars: number): string {
  return text.length <= maxChars ? text : `${text.slice(0, maxChars - 1)}…`;
}
