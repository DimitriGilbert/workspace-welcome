import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

import { detectStack } from "./detect";
import { gitInspect } from "./git";
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
  return (
    overrides[path] ?? {
      pinned: false,
      note: "",
      lastOpenedAt: null,
      hidden: false,
    }
  );
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

/** Scan a single root into a list of projects (errors thrown up to caller). */
async function scanRoot(
  root: Root,
  deny: Set<string>,
  overrides: Record<string, ProjectOverrides>,
): Promise<Project[]> {
  const entries = await readdir(root.path, { withFileTypes: true });
  const childDirs = entries.filter(
    (e) => e.isDirectory() && !isHidden(e.name),
  );

  const projects = await Promise.all(
    childDirs.map(async (entry): Promise<Project | null> => {
      const dir = join(root.path, entry.name);
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

        const ov = overridesFor(dir, overrides);
        const partial: Pick<Project, "git" | "updatedAt"> = {
          git,
          updatedAt: new Date(updated).toISOString(),
        };
        const alerts = computeAlerts(partial);

        return {
          path: dir,
          name: entry.name,
          rootId: root.id,
          createdAt: new Date(created).toISOString(),
          updatedAt: partial.updatedAt,
          stack,
          git,
          alerts,
          pinned: ov.pinned,
          note: ov.note,
          lastOpenedAt: ov.lastOpenedAt,
          hidden: ov.hidden,
        };
      } catch {
        // Skip unreadable subdirectories rather than failing the whole root.
        return null;
      }
    }),
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
        return await scanRoot(root, deny, config.overrides);
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

  // Drop hidden projects — they're excluded from every list.
  const projects = settled.flat().filter((p) => !p.hidden);

  // Sort: pinned first, then most recently updated.
  projects.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  return { projects, rootErrors };
}
