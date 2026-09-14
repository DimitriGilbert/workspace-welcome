import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { parse } from "jsonc-parser";

import { isTruncated, parseIssueListJson, parsePullListJson } from "./parse";
import type { ForgeIssue, ForgePull } from "./types";

/**
 * Parser tests for the forge gh-JSON mappers (`pnpm --filter
 * @workspace-welcome/api test:forge`). Pure and offline: the only I/O is
 * reading the fixture files next door — no network, no child_process, no gh.
 *
 * Truncation note (why there is no `issue-list.truncated.json` fixture): the
 * snapshot flags `issuesTruncated` / `pullsTruncated` are NOT present in gh
 * output — gh caps a list at `--limit` and reveals nothing about what lies
 * beyond, so they derive from `isTruncated(rows.length, pageLimit)` at fetch
 * time (count >= limit ⇒ "at least this many open items" ⇒ render "50+").
 * Hand-writing a PAGE_LIMIT-long fixture would prove nothing the one-line
 * comparison doesn't, so the math is tested directly below against small
 * numbers plus the real PAGE_LIMIT boundary.
 */

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

/**
 * Fixtures mirror gh `--json` stdout but carry provenance comments, so they
 * are read as JSONC via jsonc-parser (the repo's bts.jsonc precedent) rather
 * than strict JSON.parse.
 */
function loadFixture(name: string): unknown {
  const value: unknown = parse(readFileSync(join(FIXTURES_DIR, name), "utf8"));
  return value;
}

/** Index access with noUncheckedIndexedAccess settled by assertion. */
function row<T>(rows: readonly T[], index: number): T {
  const value = rows[index];
  assert.ok(value !== undefined, `row ${index} missing`);
  return value;
}

test("issue fixture parses to exact rows", () => {
  const issues = parseIssueListJson(loadFixture("issue-list.sample.json"));
  assert.equal(issues.length, 4);

  const expectedFirst: ForgeIssue = {
    number: 128,
    title: "Scanner misses worktrees registered via extensions.worktree",
    state: "open",
    author: "dimitri",
    labels: ["bug", "scanner"],
    // Numeric form of gh's `comments` field (kept for tolerance).
    commentCount: 6,
    updatedAt: "2026-09-12T08:21:04Z",
    url: "https://github.com/octo-workshops/acme-cli/issues/128",
  };
  assert.deepEqual(row(issues, 0), expectedFirst);

  // Live-verified array form: the Phase-8 smoke captured a 0-comment issue
  // reporting `comments: []` — the count is the array length.
  const expectedSecond: ForgeIssue = {
    number: 131,
    title: "Dashboard shows stale counts right after a root rescan",
    state: "open",
    author: "mira-dev",
    labels: [],
    commentCount: 0,
    updatedAt: "2026-09-11T17:03:41Z",
    url: "https://github.com/octo-workshops/acme-cli/issues/131",
  };
  assert.deepEqual(row(issues, 1), expectedSecond);

  const expectedThird: ForgeIssue = {
    number: 119,
    title: "Crash when config.toml ends mid-table",
    state: "open",
    author: null,
    labels: ["bug"],
    // Array form — 2 entries, so the count is 2 (entries are never inspected).
    commentCount: 2,
    updatedAt: "2026-09-09T10:44:19Z",
    url: "https://github.com/octo-workshops/acme-cli/issues/119",
  };
  assert.deepEqual(row(issues, 2), expectedThird);

  // Remaining edge: numeric-zero form still parses (state UPPERCASE → "open").
  const fourth = row(issues, 3);
  assert.equal(fourth.state, "open");
  assert.equal(fourth.commentCount, 0);
});

test("issue commentCount maps array or numeric forms, anything else to null", () => {
  // The Phase-8 smoke captured `comments` as an array; gh's older numeric
  // form stays honored. Garbage degrades to null without dropping the row.
  const cases: ReadonlyArray<{
    raw: unknown;
    expected: number | null;
  }> = [
    { raw: [], expected: 0 },
    { raw: [{}, {}, {}], expected: 3 },
    { raw: 6, expected: 6 },
    { raw: 0, expected: 0 },
    { raw: "6", expected: null },
    { raw: Number.NaN, expected: null },
    { raw: null, expected: null },
    { raw: { count: 2 }, expected: null },
  ];
  for (const { raw, expected } of cases) {
    const issues = parseIssueListJson([
      {
        number: 1,
        title: "shape probe",
        state: "OPEN",
        url: "https://x/y/i/1",
        comments: raw,
      },
    ]);
    const label = `comments: ${JSON.stringify(raw)}`;
    assert.equal(issues.length, 1, label);
    assert.equal(row(issues, 0).commentCount, expected, label);
  }
});

test("pull fixture parses to exact rows", () => {
  const pulls = parsePullListJson(loadFixture("pr-list.sample.json"));
  assert.equal(pulls.length, 4);

  const expectedFirst: ForgePull = {
    number: 214,
    title: "fix: worktree-aware scanner walk",
    state: "open",
    author: "dimitri",
    isDraft: true,
    // gh's "no review yet" is the empty string — the parser maps it to null.
    reviewDecision: null,
    labels: [],
    updatedAt: "2026-09-13T19:40:55Z",
    url: "https://github.com/octo-workshops/acme-cli/pull/214",
  };
  assert.deepEqual(row(pulls, 0), expectedFirst);

  const expectedFourth: ForgePull = {
    number: 201,
    title: "docs: document the XDG layout",
    state: "open",
    author: null,
    isDraft: false,
    reviewDecision: null,
    labels: ["documentation"],
    updatedAt: "2026-09-08T14:26:48Z",
    url: "https://github.com/octo-workshops/acme-cli/pull/201",
  };
  assert.deepEqual(row(pulls, 3), expectedFourth);

  // Review decisions pass through verbatim in gh's UPPERCASE vocabulary.
  assert.equal(row(pulls, 1).reviewDecision, "APPROVED");
  assert.deepEqual(row(pulls, 1).labels, ["ready-to-merge", "refactor"]);
  assert.equal(row(pulls, 2).reviewDecision, "CHANGES_REQUESTED");
  assert.equal(row(pulls, 2).state, "open");
});

test("malformed issue rows are skipped silently, valid ones survive", () => {
  const mixed: unknown[] = [
    "not an object",
    null,
    // Missing required identity fields:
    { title: "no number", state: "OPEN", url: "https://x/y/i/1" },
    { number: "12", title: "string number", state: "OPEN", url: "https://x/y/i/12" },
    { number: 13, title: 42, state: "OPEN", url: "https://x/y/i/13" },
    { number: 14, title: "no url", state: "OPEN" },
    // Not an open row — cannot honestly populate the "open"-typed field:
    { number: 15, title: "closed row", state: "CLOSED", url: "https://x/y/i/15" },
    // Valid: lowercase state accepted, optional fields default.
    {
      number: 16,
      title: "lowercase open still parses",
      state: "open",
      url: "https://x/y/i/16",
    },
    // Valid: label entries without a string name drop individually.
    {
      number: 17,
      title: "junky labels",
      state: "OPEN",
      url: "https://x/y/i/17",
      labels: [{ name: "ok" }, { color: "ff0000" }, "junk", null],
    },
  ];
  assert.deepEqual(parseIssueListJson(mixed), [
    {
      number: 16,
      title: "lowercase open still parses",
      state: "open",
      author: null,
      labels: [],
      commentCount: null,
      updatedAt: null,
      url: "https://x/y/i/16",
    },
    {
      number: 17,
      title: "junky labels",
      state: "open",
      author: null,
      labels: ["ok"],
      commentCount: null,
      updatedAt: null,
      url: "https://x/y/i/17",
    },
  ]);
});

test("malformed pull rows are skipped silently, valid ones survive", () => {
  const mixed: unknown[] = [
    42,
    { number: 31, title: "no state", url: "https://x/y/p/31" },
    { number: 32, title: "no url", state: "OPEN" },
    { number: 33, title: "merged row", state: "MERGED", url: "https://x/y/p/33" },
    // Valid: absent isDraft degrades to false; absent reviewDecision → null.
    {
      number: 34,
      title: "bare minimum pull",
      state: "OPEN",
      url: "https://x/y/p/34",
    },
    // Valid: non-boolean isDraft degrades to false rather than dropping the row.
    {
      number: 35,
      title: "shape-drifted isDraft",
      state: "OPEN",
      url: "https://x/y/p/35",
      isDraft: "yes",
      reviewDecision: "",
    },
  ];
  assert.deepEqual(parsePullListJson(mixed), [
    {
      number: 34,
      title: "bare minimum pull",
      state: "open",
      author: null,
      isDraft: false,
      reviewDecision: null,
      labels: [],
      updatedAt: null,
      url: "https://x/y/p/34",
    },
    {
      number: 35,
      title: "shape-drifted isDraft",
      state: "open",
      author: null,
      isDraft: false,
      reviewDecision: null,
      labels: [],
      updatedAt: null,
      url: "https://x/y/p/35",
    },
  ]);
});

test("non-array top level yields an empty list, never a throw", () => {
  // The parsers take the already-JSON.parse'd value (gh-cli.ts parses stdout
  // first), so a raw JSON string is just a non-array like any other.
  const tops: unknown[] = [null, {}, { data: [] }, "[]", 42, true];
  for (const raw of tops) {
    assert.deepEqual(parseIssueListJson(raw), [], `issue input: ${String(raw)}`);
    assert.deepEqual(parsePullListJson(raw), [], `pull input: ${String(raw)}`);
  }
});

test("isTruncated derives the snapshot truncation flags", () => {
  // Real PAGE_LIMIT boundary: equality counts as truncated — gh stopped at
  // the limit, so "50" means "at least 50" and must render "50+".
  assert.equal(isTruncated(50, 50), true);
  assert.equal(isTruncated(49, 50), false);
  // Empty list can never be truncated.
  assert.equal(isTruncated(0, 50), false);
  // The math is scale-free — small fixture-sized numbers behave the same.
  assert.equal(isTruncated(4, 4), true);
  assert.equal(isTruncated(3, 4), false);
});
