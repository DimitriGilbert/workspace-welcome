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
    commentCount: 6,
    updatedAt: "2026-09-12T08:21:04Z",
    url: "https://github.com/octo-workshops/acme-cli/issues/128",
  };
  assert.deepEqual(row(issues, 0), expectedFirst);

  const expectedThird: ForgeIssue = {
    number: 119,
    title: "Crash when config.toml ends mid-table",
    state: "open",
    author: null,
    labels: ["bug"],
    commentCount: 2,
    updatedAt: "2026-09-09T10:44:19Z",
    url: "https://github.com/octo-workshops/acme-cli/issues/119",
  };
  assert.deepEqual(row(issues, 2), expectedThird);

  // Remaining edges: empty labels normalize to [], state UPPERCASE → "open".
  const second = row(issues, 1);
  assert.equal(second.state, "open");
  assert.deepEqual(second.labels, []);
  assert.equal(second.author, "mira-dev");
  assert.equal(second.commentCount, 0);
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
