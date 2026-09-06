/**
 * Log-scaled, set-relative recency scoring + tier blend for the widget system
 * (master plan §5, W2). Moved VERBATIM from the legacy mosaic module —
 * the math is byte-equal; only the shape
 * changed: the reference clock is INJECTED (`now` is a required option), the
 * tier count comes from the caller's ladder, and packing lives apart in
 * `pack-grid.ts`.
 *
 * Sizing rationale (unchanged). The previous hard day-threshold tiers bunched
 * whole workspaces into one size (a week of nothing-but-month-old repos
 * rendered every tile identical), so the scale here is LOGARITHMIC and
 * RELATIVE to the actual set: each age is mapped through log(1 + age) and
 * then normalized across the workspace's own freshest→oldest span. The log
 * does the real work — linear normalization would press every age under the
 * oldest project into the top of the scale, while the log spreads both the
 * fresh end (minutes vs days) and the old end (months vs years), so distinct
 * projects get distinct treatment. That normalized score is also blended
 * 50/50 with the project's set-relative rank (its quantile position among
 * equally-dated peers) to cut the tier bands — quantile-ish, per the
 * "log-scaled rank/age over the actual set" rule — so neither a tight commit
 * cluster nor one ancient outlier can bunch the workspace into a single size,
 * while the exported score stays the pure log-scaled recency the rings and
 * gauges render. A pinned project overrides to the top tier regardless of its
 * age; its score stays honest.
 *
 * Determinism: same input + same `now` → same scores. Pure TypeScript: no
 * node imports, no react, no clock reads.
 */

/** The slice of a project the scoring needs (`Project` satisfies this). */
export interface ScoreInputProject {
  /** Absolute path — the stable identity, used only to break exact ties. */
  path: string;
  /** ISO timestamp of the most recent meaningful activity. */
  updatedAt: string;
  /** Pinned projects override to the top tier; their score stays honest. */
  pinned?: boolean;
}

/** One scored project: the recency score and the tier it buys. */
export interface ProjectScore {
  /**
   * Raw log-scaled set-relative recency, 0..1 — 1 = freshest of the set,
   * 0 = oldest (or unparseable date). Tiles render rings/gauges from this.
   */
  score: number;
  /** Index into the caller's size ladder (top tier first); 0 is the top tier. */
  tierIndex: number;
}

export interface ScoreProjectsOptions {
  /** Reference clock for recency. Required — this module never reads Date.now. */
  now: number;
  /** Number of tiers in the caller's size ladder (top tier first). Minimum 1. */
  tierCount: number;
}

/** Path tie-break, plain codepoint order so locales can't perturb the scores. */
function byPath(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Score every project: log-scaled recency normalized over the set's own span,
 * blended 50/50 with the set-relative rank into tier indexes.
 *
 * Input order does not matter — results are returned per input index, and
 * every internal ordering is derived (age, then path).
 */
export function scoreProjects(
  projects: readonly ScoreInputProject[],
  options: ScoreProjectsOptions,
): ProjectScore[] {
  if (projects.length === 0) return [];

  const now = options.now;
  const tierCount = Math.max(1, Math.floor(options.tierCount));

  // --- Log-scaled recency score ---------------------------------------------
  //
  // log(1 + age) per project, then min-max normalized over the set's own
  // span. Identical ages share a score (and therefore a tier), so the
  // all-identical-dates degenerate case collapses to "everything is as fresh
  // as the set gets" instead of dividing by zero.

  const logAges = projects.map((project) => {
    const ms = Date.parse(project.updatedAt);
    return Number.isFinite(ms)
      ? Math.log1p(Math.max(0, now - ms))
      : null; // unparseable date → oldest, below every real age
  });

  let minLog = Number.POSITIVE_INFINITY;
  let maxLog = Number.NEGATIVE_INFINITY;
  for (const logAge of logAges) {
    if (logAge !== null && logAge < minLog) minLog = logAge;
    if (logAge !== null && logAge > maxLog) maxLog = logAge;
  }
  const spread = maxLog - minLog;
  const anyParseable = spread >= 0;

  const scores = logAges.map((logAge) => {
    if (logAge === null || !anyParseable) return 0;
    if (spread === 0) return 1;
    return Math.min(1, Math.max(0, 1 - (logAge - minLog) / spread));
  });

  // --- Tiers ------------------------------------------------------------------
  //
  // Tier cuts blend the normalized log-score with the project's set-relative
  // rank (quantile position, equals share a position): pure score bands would
  // bunch a tight cluster (29 repos touched inside two days would all read
  // "hero" next to one 400-day archive), while pure rank quantiles would
  // force heroes onto a workspace where nothing has been touched in years.
  // The 50/50 blend is the "log-scaled rank/age over the actual set" rule —
  // distinct projects get distinct treatment on both ends without lying
  // about absolute freshness. Pinned overrides to the top tier.

  const n = projects.length;
  const ageMs = projects.map((project) => {
    const ms = Date.parse(project.updatedAt);
    return Number.isFinite(ms) ? Math.max(0, now - ms) : null;
  });
  const rankOrder = projects.map((_, i) => i).sort((a, b) => {
    const aa = ageMs[a] ?? null;
    const bb = ageMs[b] ?? null;
    if (aa === null && bb === null) return byPath(projects[a]?.path ?? "", projects[b]?.path ?? "");
    if (aa === null) return 1;
    if (bb === null) return -1;
    if (aa !== bb) return aa - bb;
    return byPath(projects[a]?.path ?? "", projects[b]?.path ?? "");
  });
  const rankPos = new Array<number>(n).fill(0);
  let groupStart = 0;
  for (let i = 0; i < n; i++) {
    const idx = rankOrder[i];
    if (idx === undefined) continue;
    if (i > 0) {
      const prev = rankOrder[i - 1];
      const prevAge = prev === undefined ? null : (ageMs[prev] ?? null);
      const thisAge = ageMs[idx] ?? null;
      const sameTie =
        (prevAge === null && thisAge === null) ||
        (prevAge !== null && thisAge !== null && prevAge === thisAge);
      if (!sameTie) groupStart = i;
    }
    rankPos[idx] = n === 1 ? 0 : groupStart / (n - 1);
  }

  return scores.map((score, i) => {
    if (projects[i]?.pinned === true) return { score, tierIndex: 0 };
    const position = (score + (1 - (rankPos[i] ?? 0))) / 2;
    return {
      score,
      tierIndex: Math.min(tierCount - 1, Math.floor((1 - position) * tierCount)),
    };
  });
}
