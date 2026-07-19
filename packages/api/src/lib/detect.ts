import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

import type { GitHost, RemoteInfo, StackInfo } from "./types";

/**
 * Stack detection and git remote parsing.
 *
 * Detection is deliberately conservative: we look only at the *presence* of a
 * well-known manifest file at the project root and read the minimum needed to
 * produce a label. No version-parsing, no transitive resolution.
 */

interface StackDef {
  id: string;
  label: string;
  manifest: string;
}

// Order matters: more specific manifests first so e.g. a Deno project isn't
// mis-reported as plain Node just because it also ships a package.json.
const STACK_DEFS: StackDef[] = [
  { id: "rust", label: "Rust", manifest: "Cargo.toml" },
  { id: "go", label: "Go", manifest: "go.mod" },
  { id: "deno", label: "Deno", manifest: "deno.json" },
  { id: "python-poetry", label: "Python", manifest: "pyproject.toml" },
  { id: "python-pip", label: "Python", manifest: "requirements.txt" },
  { id: "ruby", label: "Ruby", manifest: "Gemfile" },
  { id: "elixir", label: "Elixir", manifest: "mix.exs" },
  { id: "php", label: "PHP", manifest: "composer.json" },
  { id: "maven", label: "Java (Maven)", manifest: "pom.xml" },
  { id: "gradle", label: "Java (Gradle)", manifest: "build.gradle" },
  { id: "node", label: "Node.js", manifest: "package.json" },
  { id: "nix", label: "Nix", manifest: "flake.nix" },
  { id: "docker", label: "Docker", manifest: "Dockerfile" },
];

async function exists(path: string): Promise<boolean> {
  try {
    const s = await stat(path);
    return s.isFile();
  } catch {
    return false;
  }
}

/** Detect the project's stack from its root manifests. Returns null if unknown. */
export async function detectStack(dir: string): Promise<StackInfo | null> {
  for (const def of STACK_DEFS) {
    const manifestPath = join(dir, def.manifest);
    if (await exists(manifestPath)) {
      return {
        id: def.id,
        label: def.label,
        manifest: def.manifest,
      };
    }
  }
  return null;
}

const SCP_LIKE = /^(?:[\w.-]+@)?([\w.-]+):(.+)$/;
const HTTPS = /^https?:\/\/([\w.-]+)\/(.+)$/;

/** Classify a git host from its hostname. */
function classifyHost(hostRaw: string): GitHost {
  const host = hostRaw.toLowerCase();
  if (host === "github.com" || host === "www.github.com") return "github";
  if (host === "gitlab.com" || host === "www.gitlab.com") return "gitlab";
  if (host === "bitbucket.org" || host === "www.bitbucket.org")
    return "bitbucket";
  if (host === "codeberg.org" || host === "www.codeberg.org")
    return "codeberg";
  if (host === "git.sr.ht" || host.endsWith(".sr.ht")) return "sourcehut";
  return "other";
}

/** Build deep links for a host/slug pair. */
function buildLinks(host: GitHost, slug: string): RemoteInfo["links"] {
  switch (host) {
    case "github":
    case "gitlab":
    case "codeberg": {
      const web = `https://${hostName(host)}/${slug}`;
      return {
        web,
        issues: `${web}/issues`,
        pulls: `${web}/${host === "gitlab" ? "merge_requests" : "pulls"}`,
      };
    }
    case "bitbucket": {
      const web = `https://bitbucket.org/${slug}`;
      return {
        web,
        issues: `${web}/issues`,
        pulls: `${web}/pull-requests`,
      };
    }
    case "sourcehut": {
      // slug looks like "~owner/name"
      const web = `https://git.sr.ht/${slug}`;
      return { web, issues: `${web}/todo`, pulls: `${web}/patches` };
    }
    default: {
      // Generic: no known deep links beyond web home.
      const web = slug.includes("://") ? slug : `https://${slug}`;
      return { web, issues: web, pulls: web };
    }
  }
}

function hostName(host: GitHost): string {
  switch (host) {
    case "github":
      return "github.com";
    case "gitlab":
      return "gitlab.com";
    case "bitbucket":
      return "bitbucket.org";
    case "codeberg":
      return "codeberg.org";
    case "sourcehut":
      return "git.sr.ht";
    default:
      return "";
  }
}

/** Trim a trailing .git and any stray slashes from a repo path. */
function cleanRepoPath(repo: string): string {
  let r = repo.trim();
  if (r.endsWith(".git")) r = r.slice(0, -4);
  r = r.replace(/^\/+|\/+$/g, "");
  return r;
}

/**
 * Parse a raw git remote URL into a structured RemoteInfo.
 * Supports `git@host:owner/repo.git` (SSH / scp-like) and `https://host/owner/repo(.git)`.
 * Returns null when the URL can't be classified.
 */
export function parseRemote(rawUrl: string): RemoteInfo | null {
  const url = rawUrl.trim();
  if (!url) return null;

  let host = "";
  let repo = "";

  const https = url.match(HTTPS);
  if (https) {
    host = https[1] ?? "";
    repo = https[2] ?? "";
  } else {
    const scp = url.match(SCP_LIKE);
    if (scp) {
      host = scp[1] ?? "";
      repo = scp[2] ?? "";
    }
  }

  if (!host || !repo) return null;

  const hostType = classifyHost(host);
  const cleaned = cleanRepoPath(repo);
  if (!cleaned) return null;

  // Drop a leading username for ssh URLs like git@gitlab.com:alice/repo.git —
  // classifyHost already handled the host; here we only normalize the path.
  const slug = cleaned.startsWith("/") ? cleaned.slice(1) : cleaned;

  return {
    url,
    host: hostType,
    slug,
    links: buildLinks(hostType, slug),
  };
}

/** Read a small slice of a manifest file safely (used for future enrichment). */
export async function readManifestSlice(
  path: string,
  maxBytes = 4096,
): Promise<string | null> {
  try {
    const handle = await readFile(path);
    return handle.subarray(0, maxBytes).toString("utf8");
  } catch {
    return null;
  }
}
