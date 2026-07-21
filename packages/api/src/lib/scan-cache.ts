import { stat } from "node:fs/promises";

import {
  applyOverrides,
  defaultOverrides,
  listRootChildren,
  mergeDenylist,
  projectFingerprint,
  scanProject,
} from "./scan";
import type {
  Project,
  ProjectOverrides,
  Root,
  ScanResult,
  Settings,
} from "./types";

/**
 * Server-side scan cache.
 *
 * Problem it solves: `scanAll` walks every project dir and runs 5 sequential
 * `git` subprocess calls per repo (~690 spawns for 138 repos), every single
 * time the `projects.scan` query runs — i.e. on every page load and after every
 * override mutation (pin/note/hide/touch), even though the scanned data is
 * identical for those cases. That's a ~6s request for ~187 projects.
 *
 * Strategy:
 *   - Cache the expensive per-project scan output keyed by a cheap fingerprint
 *     (dir + `.git/HEAD`/`.git/index` mtimes, plus for repos one
 *     `git status --porcelain` hash to catch tracked-file edits that don't
 *     bump any directory mtime on Linux). Re-scan only projects whose
 *     fingerprint changed, plus any new/removed projects. Turns an O(all)
 *     scan into O(changed) on the warm path.
 *   - Key the whole cache by an `inputsHash` of roots (id+path) + excludeGlobs.
 *     Any change there (roots added/removed, excludeGlobs edited) forces a
 *     full invalidate.
 *   - Overrides (pin/note/hide/lastOpenedAt) are NEVER part of the cache key
 *     and never invalidate it. Every call re-reads the store and re-merges
 *     overrides onto the cached `Project[]` — so a pin toggle is effectively
 *     free rather than triggering a 6s rescan.
 *   - Dedupe concurrent scans: if two requests arrive mid-scan, they share one
 *     in-flight Promise (mirrors store.ts's `inFlight` pattern).
 *   - `force: true` bypasses the cache and does a full rescan (Refresh button).
 *
 * Correctness: a deleted project disappears because its fingerprint becomes 0
 * (dir gone) and it's dropped from the rebuilt list; a new project appears
 * because it shows up in `listRootChildren` with no cached entry; content
 * changes are caught by the fingerprint moving. Stale data never serves.
 */

interface CacheEntry {
  /** Scanned projects WITHOUT overrides applied (overrides are re-merged live). */
  projects: Project[];
  rootErrors: ScanResult["rootErrors"];
  /** Last fingerprints used to build this cache, keyed by absolute project path. */
  fingerprints: Map<string, string>;
}

interface ScanRequest {
  roots: Root[];
  overrides: Record<string, ProjectOverrides>;
  settings: Settings;
  force?: boolean;
}

let cache: CacheEntry | null = null;
/** Hash of (roots + excludeGlobs) the current cache was built for. */
let cachedInputsHash = "";
let inFlight: Promise<ScanResult> | null = null;

/**
 * Build a stable hash of the inputs that change *what gets scanned*.
 * Not a cryptographic hash — just a cheap equality key. Roots are sorted by id
 * so reordering doesn't invalidate.
 */
function inputsHash(roots: Root[], settings: Settings): string {
  const rootPart = [...roots]
    .map((r) => `${r.id}:${r.path}`)
    .sort()
    .join("|");
  const excludePart = [...settings.excludeGlobs].slice().sort().join("|");
  return `${rootPart}#${excludePart}`;
}

/** Drop the cache entirely. Called after roots/settings mutations. */
export function invalidateScanCache(): void {
  cache = null;
  cachedInputsHash = "";
}

/** Apply the (always-fresh) overrides onto scanned projects and filter hidden. */
function finalize(
  scanned: Project[],
  overrides: Record<string, ProjectOverrides>,
): Project[] {
  const merged = scanned.map((p) =>
    applyOverrides(p, overrides[p.path] ?? defaultOverrides()),
  );
  const visible = merged.filter((p) => !p.hidden);
  // Sort: pinned first, then most recently updated — matches the original scan.
  visible.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
  return visible;
}

/**
 * Run the (possibly partial) scan and refresh the cache.
 *
 * For each project under each root we compute a cheap fingerprint (stat
 * mtimes +, for repos, one `git status --porcelain` hash) and compare it to
 * the cached value. Matching projects reuse their cached `Project`; only
 * changed/new/removed projects pay the full `scanProject` cost (git inspect +
 * stack detect + recursive mtime walk). On a warm, unchanged workspace this
 * is O(projects) stat + git-status probes with zero full scans.
 *
 * Overrides are never part of the cache and are re-merged live at the end, so
 * a pin/note/hide/touch mutation does not invalidate anything here.
 */
async function refreshCache(req: ScanRequest): Promise<ScanResult> {
  const { roots, overrides, settings } = req;
  const deny = mergeDenylist(settings);
  const rootErrors: ScanResult["rootErrors"] = [];

  const hash = inputsHash(roots, settings);
  const inputsChanged = hash !== cachedInputsHash;
  const force = req.force === true;

  // Full invalidate when inputs changed or caller forced a refresh.
  if (inputsChanged || force) {
    cache = null;
    cachedInputsHash = inputsChanged ? hash : cachedInputsHash;
  }

  const base = cache;
  // Index cached projects by path once, so per-project reuse is O(1) not O(n)
  // (the previous `.find()` made the warm path O(projects^2)).
  const cachedByPath = new Map<string, Project>();
  if (base) {
    for (const p of base.projects) cachedByPath.set(p.path, p);
  }
  const fingerprints = new Map<string, string>();

  const settledRoots = await Promise.all(
    roots.map(async (root) => {
      try {
        const exists = await stat(root.path).catch(() => null);
        if (!exists || !exists.isDirectory()) {
          throw new Error("Directory does not exist");
        }
        const children = await listRootChildren(root.path);
        const results = await Promise.all(
          children.map(async (entry) => {
            const dir = `${root.path}/${entry.name}`;
            const current = await projectFingerprint(dir);
            fingerprints.set(dir, current);

            // "missing" means the dir couldn't be stat'd this pass — drop it
            // by returning null so a deleted project disappears from results.
            if (current === "missing") return null;

            const prev = base?.fingerprints.get(dir);
            if (prev !== undefined && current === prev) {
              const cached = cachedByPath.get(dir);
              if (cached) return cached;
              // Fingerprint matches but no cached Project (rare): fall through
              // to re-scan so we never serve a stale/empty entry.
            }
            return scanProject(root, entry.name, deny);
          }),
        );
        return results.filter((p): p is Project => p !== null);
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

  const allScanned = settledRoots.flat();

  // Persist override-free projects + fingerprints so a later pin/note change
  // doesn't dirty the cache.
  cache = { projects: allScanned, rootErrors, fingerprints };
  cachedInputsHash = hash;

  return { projects: finalize(allScanned, overrides), rootErrors };
}

/**
 * Get a scan result, reusing the cache when possible. Concurrent callers share
 * a single in-flight refresh — UNLESS one of them is a `force` rescan, which
 * must not be satisfied by (or share with) a warm in-flight scan.
 */
export function getScan(req: ScanRequest): Promise<ScanResult> {
  if (inFlight && !req.force) return inFlight;
  inFlight = (async () => {
    try {
      return await refreshCache(req);
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}
