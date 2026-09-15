/**
 * The git remote URL grammar, shared by `parseRemote` (server-side host
 * classification in ./detect) and the clone form's browser-safe schema in
 * ./clone-options. Node-free on purpose: the web client imports this module
 * directly, so it must stay pure and regex-only.
 */

// Remote grammar, in try order (matchRemoteUrl matches the first that hits):
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

export interface RemoteUrlMatch {
  host: string;
  repoPath: string;
}

/**
 * Match a raw git remote URL against the shared grammar. Returns the captured
 * host and repo path, or null when the URL fits no known form. The try order
 * is load-bearing — see the comment on the regex declarations above.
 */
export function matchRemoteUrl(rawUrl: string): RemoteUrlMatch | null {
  const url = rawUrl.trim();
  if (!url) return null;

  const match = url.match(HTTPS) ?? url.match(SSH_URL) ?? url.match(SCP_LIKE);
  if (!match) return null;
  const host = match[1] ?? "";
  const repoPath = match[2] ?? "";
  if (!host || !repoPath) return null;
  return { host, repoPath };
}

/**
 * The repository's own name from a remote URL — the last path segment with a
 * trailing `.git` and any stray slashes stripped ("git@host:owner/repo.git" →
 * "repo"). Seeds the clone form's directory-name field; "" when the URL
 * carries nothing usable. Not schema-validated: an odd-but-matching name
 * simply lands in the field, where the directory-name schema flags it.
 */
export function deriveRepoName(rawUrl: string): string {
  const match = matchRemoteUrl(rawUrl);
  if (!match) return "";
  const last = match.repoPath.replace(/\/+$/g, "").split("/").at(-1) ?? "";
  const name = last.endsWith(".git") ? last.slice(0, -4) : last;
  return name.trim();
}
