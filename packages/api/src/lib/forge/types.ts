import type { RemoteInfo } from "../types";

/**
 * Forge adapter contract — the seam between project git remotes and forge
 * (GitHub / Gitea / GitLab) issue + pull data.
 *
 * Two adapter styles are deliberately supported: `"cli"` (a local CLI like
 * `gh`, driven via execFile — the only style implemented this round) and
 * `"api"` (direct HTTP, reserved for future adapters). Gitea/GitLab exist as
 * `ForgeKind` values and extension documentation only — no stub adapters.
 *
 * Adapters never run on the dashboard's read path: they are invoked only by
 * the explicit sync flow (see ./sync.ts, Phase 4b), which owns TTL, dedupe
 * and sequential-fetch discipline.
 */

/** Which forge an adapter talks to. */
export type ForgeKind = "github" | "gitea" | "gitlab";

/** How the adapter reaches the forge: local CLI vs direct HTTP API. */
export type AdapterStyle = "cli" | "api";

/**
 * Identity of one forge repository. `host` is the canonical web hostname
 * (e.g. "github.com") — distinct from `RemoteInfo.host`, which is the
 * coarse `GitHost` classification; the sync flow maps one to the other.
 */
export interface ForgeRepoRef {
  kind: ForgeKind;
  host: string;
  /** `owner/repo` — the slug both the CLI selector and DB keys use. */
  slug: string;
}

/** One open forge issue, as of the fetch that produced it. */
export interface ForgeIssue {
  number: number;
  title: string;
  state: "open";
  /** Author login; null for deleted/ghost accounts. */
  author: string | null;
  labels: string[];
  /** Comment count; null when the forge didn't report one. */
  commentCount: number | null;
  /** RFC 3339 timestamp; null when the forge didn't report one. */
  updatedAt: string | null;
  url: string;
}

/** One open forge pull request, as of the fetch that produced it. */
export interface ForgePull {
  number: number;
  title: string;
  state: "open";
  author: string | null;
  isDraft: boolean;
  /**
   * The forge's own review verdict, passed through verbatim (gh reports
   * UPPERCASE values like "APPROVED"); null when no review has happened.
   */
  reviewDecision: string | null;
  labels: string[];
  updatedAt: string | null;
  url: string;
}

/** The complete open-item state of one repo at one point in time. */
export interface ForgeSnapshot {
  ref: ForgeRepoRef;
  /** ISO timestamp of the fetch. */
  fetchedAt: string;
  issues: ForgeIssue[];
  pulls: ForgePull[];
  /**
   * True when a list hit the page limit — counts render as "50+", never a
   * false exact number (see isTruncated in ./parse.ts).
   */
  issuesTruncated: boolean;
  pullsTruncated: boolean;
}

/** Per-fetch knobs; adapters default `pageLimit` to PAGE_LIMIT. */
export interface ForgeFetchOptions {
  pageLimit: number;
}

/**
 * A source of forge data for the remotes it claims. Implementations must be
 * side-effect free until a method is called; `fetchSnapshot` throws `Error`
 * on failure (the sync service must see it to record last_sync_error).
 */
export interface ForgeAdapter {
  readonly kind: ForgeKind;
  readonly style: AdapterStyle;
  /** Whether this adapter handles the given parsed git remote. */
  matches(remote: RemoteInfo): boolean;
  /** Cheap probe (auth/binary present), cached — never a fetch. */
  isAvailable(): Promise<boolean>;
  fetchSnapshot(
    ref: ForgeRepoRef,
    opts?: ForgeFetchOptions,
  ): Promise<ForgeSnapshot>;
}
