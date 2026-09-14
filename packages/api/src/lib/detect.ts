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

// Remote grammar, in try order (parseRemote matches the first that hits):
// - HTTPS — scheme'd web remote; an explicit :port is allowed and dropped
//   (ports never affect host classification or links).
// - SSH_URL — explicit ssh:// remote; the optional user@ prefix and optional
//   :port are both matched but dropped. MUST be tried before SCP_LIKE, else
//   the scheme-less scp-like pattern captures the scheme itself ("ssh") as
//   the host.
// - SCP_LIKE — git's scp-like `user@host:path` form. It has NO port
//   semantics: `git@host:22/owner/repo` is host "host", path "22/owner/repo"
//   — faithful to git's own interpretation, deliberately not "fixed".
const HTTPS = /^https?:\/\/([\w.-]+)(?::\d+)?\/(.+)$/;
const SSH_URL = /^ssh:\/\/(?:[\w.-]+@)?([\w.-]+)(?::\d+)?\/(.+)$/;
const SCP_LIKE = /^(?:[\w.-]+@)?([\w.-]+):(.+)$/;

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

/**
 * Build deep links for a host/slug pair. `rawHost` is the hostname exactly as
 * captured from the remote URL: known hosts ignore it in favor of their
 * canonical `hostName(host)` mapping (so `www.github.com` still normalizes to
 * github.com links), while the generic fallback keeps it — unknown hosts have
 * no canonical name, and dropping the host produced broken host-less links.
 */
function buildLinks(
  host: GitHost,
  slug: string,
  rawHost: string,
): RemoteInfo["links"] {
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
      // Generic: unknown hosts have no known deep-link structure — keep the
      // captured host in the web link; issues/pulls alias web, as ever.
      const web = `https://${rawHost}/${slug}`;
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
 * Supports `https://host[:port]/owner/repo(.git)`,
 * `ssh://[user@]host[:port]/owner/repo(.git)`, and `git@host:owner/repo.git`
 * (scp-like, which carries no port semantics). Returns null when the URL
 * can't be classified.
 */
export function parseRemote(rawUrl: string): RemoteInfo | null {
  const url = rawUrl.trim();
  if (!url) return null;

  let host = "";
  let repo = "";

  // The try order is load-bearing — see the comment on the regex
  // declarations above. Stays sync and regex-only: parseRemote runs per
  // project per scan and on every forge.project query.
  const match = url.match(HTTPS) ?? url.match(SSH_URL) ?? url.match(SCP_LIKE);
  if (match) {
    host = match[1] ?? "";
    repo = match[2] ?? "";
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
    links: buildLinks(hostType, slug, host),
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
