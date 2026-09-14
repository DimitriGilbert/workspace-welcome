import type { RemoteInfo } from "../types";
import { ghCliAdapter } from "./gh-cli";
import type { ForgeAdapter } from "./types";

/**
 * Forge adapter registry. Resolution is "first adapter whose `matches`
 * accepts the remote" — the only routing rule. Exactly one adapter exists
 * this round (the gh CLI); Gitea/GitLab are reserved ForgeKind values with
 * no stubs registered, so those remotes resolve to null today.
 */

export const adapters: readonly ForgeAdapter[] = [ghCliAdapter];

/** The adapter handling this remote, or null when the host is unsupported. */
export function resolveAdapter(remote: RemoteInfo): ForgeAdapter | null {
  for (const adapter of adapters) {
    if (adapter.matches(remote)) return adapter;
  }
  return null;
}
