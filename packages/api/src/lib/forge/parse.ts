import type { ForgeFeedItem, ForgeIssue, ForgePull } from "./types";

/**
 * Pure mappers from `gh … --json` list output to typed forge rows.
 *
 * Zero I/O: these functions take the already-JSON.parse'd value (gh-cli.ts
 * parses stdout before calling) and never throw — rows that don't match the
 * documented shape are skipped silently, and a non-array top level yields [].
 * Structural failure of the gh call itself (non-zero exit, unparseable body)
 * is gh-cli.ts's job to turn into a thrown Error; here only row-level
 * malformation is tolerated. The defensive accessor style mirrors
 * ../report-export.ts.
 *
 * Boundary contract: row urls are constrained to https here (see
 * `isHttpsUrl`), so nothing downstream — sqlite, `href`, the user feed — can
 * carry a `javascript:`/`data:` scheme.
 */

// --- Defensive unknown accessors (report-export.ts style) ---------------------

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

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

// --- Shared row fields ---------------------------------------------------------

/**
 * gh reports states UPPERCASE ("OPEN"); the snapshot only holds open items,
 * so a row is kept only when its state normalizes to "open" — anything else
 * (a stray "CLOSED", a non-string) is skipped rather than coerced.
 */
function isOpenState(value: unknown): boolean {
  return typeof value === "string" && value.toLowerCase() === "open";
}

/**
 * The url is the one row field that keeps flowing after the parse — into
 * sqlite storage, the board's `href`, and the user feed — so this guard is
 * the module's trust boundary: only an https web link (case-insensitive
 * scheme prefix) is accepted, and a row carrying any other scheme
 * (`javascript:`, `data:`, plain `http:`) is skipped like any other
 * malformation, never rewritten.
 */
function isHttpsUrl(value: string): boolean {
  return /^https:\/\//i.test(value);
}

/** `author` is `{ login }` or null; a login-less object also degrades to null. */
function mapAuthor(value: unknown): string | null {
  const author = asRecord(value);
  if (author === null) return null;
  return asString(author.login);
}

/**
 * `labels` is an array of label objects (gh includes id/color/description —
 * only `name` is consumed) or null; null and non-arrays both yield [], and
 * entries without a string name are dropped individually.
 */
function mapLabels(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const names: string[] = [];
  for (const raw of value) {
    const label = asRecord(raw);
    const name = label === null ? null : asString(label.name);
    if (name !== null) names.push(name);
  }
  return names;
}

/**
 * The issue list's `comments` field is shape-drifted across gh versions: the
 * Phase-8 live smoke captured an array of comment objects (a 0-comment issue
 * reports []), while the older documented form was a plain count. Both are
 * honored — an array reports its length (entries are never inspected, like how
 * only `name` is consumed from label objects) and a finite number passes
 * through; anything else degrades to null. Pull rows carry no comments field.
 */
function mapCommentCount(value: unknown): number | null {
  if (Array.isArray(value)) return value.length;
  return asNumber(value);
}

// --- List parsers --------------------------------------------------------------

/** Rows of `gh issue list --json number,title,state,author,labels,updatedAt,url,comments`. */
export function parseIssueListJson(raw: unknown): ForgeIssue[] {
  if (!Array.isArray(raw)) return [];
  const issues: ForgeIssue[] = [];
  for (const entry of raw) {
    const row = asRecord(entry);
    if (row === null) continue;
    const number = asNumber(row.number);
    const title = asString(row.title);
    const url = asString(row.url);
    if (number === null || title === null || url === null) continue;
    if (!isHttpsUrl(url)) continue;
    if (!isOpenState(row.state)) continue;
    issues.push({
      number,
      title,
      state: "open",
      author: mapAuthor(row.author),
      labels: mapLabels(row.labels),
      // gh names the field `comments`; the row type speaks of a count, and
      // gh's live shape is an array — mapCommentCount takes either form.
      commentCount: mapCommentCount(row.comments),
      updatedAt: asString(row.updatedAt),
      url,
    });
  }
  return issues;
}

/** Rows of `gh pr list --json number,title,state,author,isDraft,reviewDecision,labels,updatedAt,url`. */
export function parsePullListJson(raw: unknown): ForgePull[] {
  if (!Array.isArray(raw)) return [];
  const pulls: ForgePull[] = [];
  for (const entry of raw) {
    const row = asRecord(entry);
    if (row === null) continue;
    const number = asNumber(row.number);
    const title = asString(row.title);
    const url = asString(row.url);
    if (number === null || title === null || url === null) continue;
    if (!isHttpsUrl(url)) continue;
    if (!isOpenState(row.state)) continue;
    // gh reports review decisions UPPERCASE ("APPROVED") — passed through
    // verbatim; its "no review yet" is the empty string, mapped to null.
    const reviewDecision = asString(row.reviewDecision);
    pulls.push({
      number,
      title,
      state: "open",
      author: mapAuthor(row.author),
      // isDraft isn't identity-bearing: a shape-drifted row degrades to
      // "not a draft" rather than being dropped.
      isDraft: asBoolean(row.isDraft) ?? false,
      reviewDecision:
        reviewDecision !== null && reviewDecision.length > 0
          ? reviewDecision
          : null,
      labels: mapLabels(row.labels),
      updatedAt: asString(row.updatedAt),
      url,
    });
  }
  return pulls;
}

// --- Search parsers (user-level feed, plan §Phase 9) ---------------------------

/**
 * Search rows carry a `repository` OBJECT (the one field the list endpoints
 * lack). Its documented key for the "owner/repo" identity is `nameWithOwner`;
 * it is the only key consumed — siblings (id, name, owner, …) are never
 * inspected. A row whose repository yields no usable slug cannot be
 * attributed to a repo and is skipped, like any other malformed row.
 */
function mapRepoSlug(value: unknown): string | null {
  const repository = asRecord(value);
  if (repository === null) return null;
  return asString(repository.nameWithOwner);
}

/**
 * The row fields shared by both search kinds, mapped once: identity
 * (number/title/url/repoSlug) + open-state + the optional fields. `isDraft`
 * only exists in the prs search output — for issue rows the caller passes
 * false, never a guessed value.
 */
function mapSearchRow(
  entry: unknown,
  kind: "issue" | "pr",
): ForgeFeedItem | null {
  const row = asRecord(entry);
  if (row === null) return null;
  const number = asNumber(row.number);
  const title = asString(row.title);
  const url = asString(row.url);
  const repoSlug = mapRepoSlug(row.repository);
  if (
    number === null ||
    title === null ||
    url === null ||
    repoSlug === null
  ) {
    return null;
  }
  if (!isHttpsUrl(url)) return null;
  if (!isOpenState(row.state)) return null;
  return {
    kind,
    repoSlug,
    number,
    title,
    url,
    updatedAt: asString(row.updatedAt),
    labels: mapLabels(row.labels),
    // Same degradation rule as parsePullListJson: a shape-drifted isDraft
    // reads as "not a draft" rather than dropping the row.
    isDraft: kind === "pr" ? (asBoolean(row.isDraft) ?? false) : false,
  };
}

/**
 * Rows of `gh search issues … --json number,title,state,labels,updatedAt,url,repository`
 * → `kind: "issue"` feed items. Malformed rows are skipped, never thrown;
 * a non-array top level yields [].
 */
export function parseSearchIssuesJson(raw: unknown): ForgeFeedItem[] {
  if (!Array.isArray(raw)) return [];
  const items: ForgeFeedItem[] = [];
  for (const entry of raw) {
    const item = mapSearchRow(entry, "issue");
    if (item !== null) items.push(item);
  }
  return items;
}

/**
 * Rows of `gh search prs … --json number,title,state,isDraft,labels,updatedAt,url,repository`
 * → `kind: "pr"` feed items. Same tolerance rules as the issue search.
 */
export function parseSearchPullsJson(raw: unknown): ForgeFeedItem[] {
  if (!Array.isArray(raw)) return [];
  const items: ForgeFeedItem[] = [];
  for (const entry of raw) {
    const item = mapSearchRow(entry, "pr");
    if (item !== null) items.push(item);
  }
  return items;
}

/**
 * Truncation math behind ForgeSnapshot's flags: gh caps a list at --limit and
 * says nothing about what lies beyond, so a row count that reached the page
 * limit means "at least this many" — equality counts as truncated, which is
 * why counts render "50+" instead of a false exact number. Tested directly
 * (hand-writing PAGE_LIMIT rows in a fixture proves nothing the math doesn't).
 * The user-level feed (ForgeUserFeed.truncated) derives from the same helper.
 */
export function isTruncated(count: number, pageLimit: number): boolean {
  return count >= pageLimit;
}
