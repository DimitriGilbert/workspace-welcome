import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

import { detectStack } from "./detect";
import { gitInspect, gitStatusHash } from "./git";
import type {
  HealthAlert,
  Project,
  ProjectOverrides,
  Root,
  ScanResult,
  Settings,
} from "./types";

/**
 * Filesystem scanning that turns a root directory into a list of Projects.
 *
 * "Last worked on" (`updatedAt`) is the maximum of:
 *   - the most recent mtime among *source* files (skipping deps/build output)
 *   - the date of the latest git commit
 * This avoids both false freshness (git activity, no code changes) and false
 * staleness (uncommitted work that should still count as activity).
 */

const DEFAULT_DENYLIST = new Set([
  "node_modules",
  ".git",
  ".hg",
  ".svn",
  ".next",
  ".nuxt",
  "dist",
  "build",
  ".turbo",
  ".nx",
  ".cache",
  "target",
  ".gradle",
  "vendor",
  "__pycache__",
  ".venv",
  "venv",
  ".tox",
  "coverage",
  ".svelte-kit",
  ".angular",
  "out",
  ".parcel-cache",
  "Pods",
  "DerivedData",
]);

// Hard caps to keep scans fast on huge repos.
const MAX_DEPTH = 12;
const MAX_FILES = 50_000;

interface ScanConfig {
  roots: Root[];
  overrides: Record<string, ProjectOverrides>;
  settings: Settings;
}

export function mergeDenylist(settings: Settings): Set<string> {
  const set = new Set(DEFAULT_DENYLIST);
  for (const g of settings.excludeGlobs) {
    // Globs are overkill here; we match dir *names*, so strip any path-ish bits.
    const name = g.replace(/^\/+|\/+$/g, "").split("/").pop();
    if (name) set.add(name);
  }
  return set;
}

/** Is this entry name a hidden / dotfile we should skip at the root level? */
function isHidden(name: string): boolean {
  return name.startsWith(".");
}

/** Recursively find the newest mtime (ms) under `dir`, honoring the denylist. */
async function newestMtime(
  dir: string,
  deny: Set<string>,
  depth: number,
  state: { visited: number },
): Promise<number> {
  if (depth > MAX_DEPTH || state.visited > MAX_FILES) return 0;

  let entries: import("node:fs").Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }

  let newest = 0;
  for (const entry of entries) {
    state.visited++;
    if (state.visited > MAX_FILES) break;

    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (deny.has(entry.name)) continue;
      const child = await newestMtime(full, deny, depth + 1, state);
      if (child > newest) newest = child;
    } else if (entry.isFile()) {
      try {
        const s = await stat(full);
        const t = Math.max(s.mtimeMs, s.ctimeMs);
        if (t > newest) newest = t;
      } catch {
        // Ignore unreadable files.
      }
    }
  }
  return newest;
}

/** Best-effort directory creation time. */
async function birthtime(dir: string): Promise<number> {
  try {
    const s = await stat(dir);
    // birthtime is 0 on filesystems that don't support it; fall back to ctime.
    return s.birthtimeMs || s.ctimeMs;
  } catch {
    return Date.now();
  }
}

function overridesFor(
  path: string,
  overrides: Record<string, ProjectOverrides>,
): ProjectOverrides {
  return overrides[path] ?? defaultOverrides();
}

/**
 * Cheap per-project invalidation fingerprint. Combines two signals:
 *
 *   1. stat() mtimes — the project dir itself plus, for git repos, `.git/HEAD`
 *      (bumps on checkout/commit) and `.git/index` (bumps on add/commit). This
 *      catches commits, branch switches, staged changes, and root-level file
 *      add/remove — all without spawning any subprocess. NB: we deliberately
 *      exclude the `.git` *directory* mtime: a plain `git status` (no
 *      `--no-optional-locks`) writes temp files into `.git/` and bumps it, which
 *      would make every warm call mismatch. HEAD/index mtimes are stable.
 *
 *   2. For git repos only: a hash of `git status --porcelain` output (run with
 *      `--no-optional-locks` so it doesn't perturb the index). This is the one
 *      subprocess we allow on the warm path, because uncommitted edits to
 *      tracked files deep in the tree do NOT bump any directory mtime on Linux,
 *      so stat alone would let `updatedAt` go stale. The porcelain output
 *      changes whenever the working-tree dirty set changes.
 *
 * The git call runs only when a `.git` dir is present; non-repo projects fall
 * back to stat-only, which is sufficient for them (no git state to track).
 * Returns "missing" when the directory can't be stat'd — that forces a rescan
 * and surfaces deletions.
 */
export async function projectFingerprint(dir: string): Promise<string> {
  let mtimePart = 0;
  let hasGit = false;
  try {
    const s = await stat(dir);
    mtimePart = Math.max(s.mtimeMs, s.ctimeMs);
  } catch {
    // A *missing project dir* yields 0, which forces a rescan and surfaces
    // the deletion downstream.
    return "missing";
  }
  try {
    // `.git` existence check — we DON'T include its mtime in the fingerprint
    // because plain `git status` (run by gitInspect during a full scan) writes
    // temp files into `.git/` and bumps its dir mtime, which would make every
    // warm call mismatch. HEAD/index mtimes below are the stable, meaningful
    // signals.
    await stat(join(dir, ".git"));
    hasGit = true;
  } catch {
    hasGit = false;
  }
  if (hasGit) {
    for (const rel of [".git/HEAD", ".git/index"]) {
      try {
        const s = await stat(join(dir, rel));
        const t = Math.max(s.mtimeMs, s.ctimeMs);
        if (t > mtimePart) mtimePart = t;
      } catch {
        // Sentinel may not exist on partial repos; ignore.
      }
    }
  }

  if (!hasGit) return `s:${mtimePart}`;

  // One subprocess: hash the porcelain output so any working-tree change moves
  // the fingerprint. Cheaper than a full scan (no rev-list/log/config calls).
  const statusHash = await gitStatusHash(dir);
  if (statusHash === null) {
    // Not actually a repo (or git failed) → degrade to stat-only fingerprint.
    return `s:${mtimePart}`;
  }
  return `g:${mtimePart}:${statusHash}`;
}

/** Compute health alerts for a project given its git state. */
export function computeAlerts(project: Pick<
  Project,
  "git" | "updatedAt"
>): HealthAlert[] {
  const alerts: HealthAlert[] = [];
  const { git, updatedAt } = project;

  if (!git.isRepo) return alerts;

  if (!git.remote) {
    alerts.push({
      severity: "warn",
      code: "no-remote",
      message: "No remote configured",
    });
  }

  const ahead = git.ahead ?? 0;
  const behind = git.behind ?? 0;
  if (ahead > 0 && behind > 0) {
    alerts.push({
      severity: "error",
      code: "diverged",
      message: `Diverged: ${ahead} ahead, ${behind} behind`,
    });
  } else if (behind > 0) {
    alerts.push({
      severity: "warn",
      code: "behind",
      message: `${behind} commit${behind === 1 ? "" : "s"} behind upstream`,
    });
  } else if (ahead > 0) {
    alerts.push({
      severity: "info",
      code: "unpushed",
      message: `${ahead} unpushed commit${ahead === 1 ? "" : "s"}`,
    });
  }

  const dirty = git.dirtyCount ?? 0;
  if (dirty > 0) {
    alerts.push({
      severity: "info",
      code: "dirty",
      message: `${dirty} uncommitted file${dirty === 1 ? "" : "s"}`,
    });
  }

  const commitDate = git.lastCommit?.date;
  const daysSinceCommit = commitDate
    ? (Date.now() - new Date(commitDate).getTime()) / (1000 * 60 * 60 * 24)
    : Number.POSITIVE_INFINITY;

  if (dirty > 0 && daysSinceCommit > 21) {
    alerts.push({
      severity: "warn",
      code: "stale-wip",
      message: "Uncommitted changes sitting for 3+ weeks",
    });
  }

  const daysSinceUpdate =
    (Date.now() - new Date(updatedAt).getTime()) / (1000 * 60 * 60 * 24);
  if (daysSinceCommit > 90 && daysSinceUpdate > 90) {
    alerts.push({
      severity: "info",
      code: "dormant",
      message: "No activity in 90+ days",
    });
  }

  return alerts;
}

/**
 * Scan a single child directory of a root into a Project (without applying
 * overrides — those are merged later so the cache can re-merge cheaply when
 * only overrides change). Returns null if the directory can't be read.
 *
 * Exported so the scan cache can selectively re-scan one project whose
 * fingerprint changed, without re-walking every sibling.
 */
export async function scanProject(
  root: Root,
  entryName: string,
  deny: Set<string>,
): Promise<Project | null> {
  const dir = join(root.path, entryName);
  try {
    const [created, stack, git] = await Promise.all([
      birthtime(dir),
      detectStack(dir),
      gitInspect(dir),
    ]);

    // updatedAt: max(newest source mtime, last commit date).
    const newest = await newestMtime(dir, deny, 0, { visited: 0 });
    const commitMs = git.lastCommit?.date
      ? new Date(git.lastCommit.date).getTime()
      : 0;
    const updated = Math.max(newest, commitMs, created);

    const partial: Pick<Project, "git" | "updatedAt"> = {
      git,
      updatedAt: new Date(updated).toISOString(),
    };
    const alerts = computeAlerts(partial);

    // Overrides are intentionally left as defaults here; the caller (or the
    // scan cache) merges them in so a pin/note change doesn't require a rescan.
    return {
      path: dir,
      name: entryName,
      rootId: root.id,
      createdAt: new Date(created).toISOString(),
      updatedAt: partial.updatedAt,
      stack,
      git,
      alerts,
      pinned: false,
      note: "",
      lastOpenedAt: null,
      hidden: false,
    };
  } catch {
    // Skip unreadable subdirectories rather than failing the whole root.
    return null;
  }
}

/** List the visible child directories of a root (errors thrown to caller). */
export async function listRootChildren(
  rootPath: string,
): Promise<import("node:fs").Dirent[]> {
  const entries = await readdir(rootPath, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory() && !isHidden(e.name));
}

/** Merge a project's overrides onto a scanned Project (no rescan). */
export function applyOverrides(
  project: Project,
  ov: ProjectOverrides,
): Project {
  return {
    ...project,
    pinned: ov.pinned,
    note: ov.note,
    lastOpenedAt: ov.lastOpenedAt,
    hidden: ov.hidden,
  };
}

/** Default overrides used when a project has never been touched. */
export function defaultOverrides(): ProjectOverrides {
  return { pinned: false, note: "", lastOpenedAt: null, hidden: false };
}

/** Scan a single root into a list of projects (errors thrown up to caller). */
async function scanRoot(
  root: Root,
  deny: Set<string>,
): Promise<Project[]> {
  const childDirs = await listRootChildren(root.path);
  const projects = await Promise.all(
    childDirs.map((entry) => scanProject(root, entry.name, deny)),
  );
  return projects.filter((p): p is Project => p !== null);
}

/** Scan all roots, collecting per-root errors so the UI can surface them. */
export async function scanAll(config: ScanConfig): Promise<ScanResult> {
  const deny = mergeDenylist(config.settings);
  const rootErrors: ScanResult["rootErrors"] = [];

  const settled = await Promise.all(
    config.roots.map(async (root) => {
      try {
        const exists = await stat(root.path).catch(() => null);
        if (!exists || !exists.isDirectory()) {
          throw new Error("Directory does not exist");
        }
        return await scanRoot(root, deny);
      } catch (err) {
        rootErrors.push({
          rootId: root.id,
          path: root.path,
          message: (err as Error).message,
        });
        return [] as Project[];
      }
    }),
  );

  // Apply overrides (cheap; doesn't depend on the filesystem) and drop hidden.
  const projects = settled
    .flat()
    .map((p) =>
      applyOverrides(p, overridesFor(p.path, config.overrides)),
    )
    .filter((p) => !p.hidden);

  // Sort: pinned first, then most recently updated.
  projects.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  return { projects, rootErrors };
}
