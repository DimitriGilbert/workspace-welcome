/**
 * Output contract for the whole harness (master plan §3.8):
 *
 *   PASS|FAIL|WARN <check> <detail>
 *
 * lines on stdout as findings land, plus a JSON summary (written to `--out`
 * by run.mjs). Exit code: 0 = no FAIL findings, 1 = at least one FAIL,
 * 2 = harness/infrastructure error (nothing to report about the page).
 */

export const VERDICT_PASS = "PASS";
export const VERDICT_FAIL = "FAIL";
export const VERDICT_WARN = "WARN";

export class Report {
  /**
   * `expectedFailChecks`: checks whose FAIL findings are EXPECTED (the
   * self-test suite inverts the contract — a probe failing the known-bad
   * panel is the pass condition). They are still printed and recorded, but
   * flagged and excluded from the exit decision.
   */
  constructor({ suite, meta = {}, expectedFailChecks = [] }) {
    this.suite = suite;
    this.meta = meta;
    this.expectedFailChecks = new Set(expectedFailChecks);
    this.startedAt = new Date().toISOString();
    this.entries = [];
  }

  add(verdict, check, detail) {
    const expected =
      verdict === VERDICT_FAIL && this.expectedFailChecks.has(check);
    const entry = { verdict, check, detail, at: new Date().toISOString() };
    if (expected) entry.expected = true;
    this.entries.push(entry);
    process.stdout.write(`${verdict} ${check} ${detail}\n`);
    return entry;
  }

  pass(check, detail) {
    return this.add(VERDICT_PASS, check, detail);
  }

  fail(check, detail) {
    return this.add(VERDICT_FAIL, check, detail);
  }

  warn(check, detail) {
    return this.add(VERDICT_WARN, check, detail);
  }

  /** Line count per verdict — the suite's headline. */
  get counts() {
    const counts = { pass: 0, fail: 0, warn: 0 };
    for (const entry of this.entries) {
      if (entry.expected === true) continue;
      const key = entry.verdict.toLowerCase();
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }

  get ok() {
    return this.counts.fail === 0;
  }

  json() {
    return {
      suite: this.suite,
      ok: this.ok,
      counts: this.counts,
      startedAt: this.startedAt,
      finishedAt: new Date().toISOString(),
      ...this.meta,
      entries: this.entries,
    };
  }

  headline() {
    const { pass, fail, warn } = this.counts;
    const verdict = this.ok ? "OK" : "FAILED";
    process.stdout.write(
      `${this.suite}: ${verdict} — ${pass} pass, ${fail} fail, ${warn} warn\n`,
    );
  }
}

/** Exit codes shared by every harness entry point. */
export const EXIT_OK = 0;
export const EXIT_FAILURES = 1;
export const EXIT_HARNESS_ERROR = 2;

/**
 * Wrap a harness entry point: `body()` returns the run's {@link Report}
 * (after writing any --out JSON), or throws for infrastructure errors.
 * Headline verdict line decides exit 0/1; throws become a HARNESS line and
 * exit 2.
 */
export async function runEntry(body) {
  try {
    const report = await body();
    report.headline();
    process.exitCode = report.ok ? EXIT_OK : EXIT_FAILURES;
    return process.exitCode;
  } catch (error) {
    const stack = error instanceof Error ? (error.stack ?? "").split("\n").slice(1, 3).join(" | ") : "";
    process.stdout.write(
      `HARNESS harness-error ${error instanceof Error ? error.message : String(error)}${stack ? ` (${stack.trim()})` : ""}\n`,
    );
    process.exitCode = EXIT_HARNESS_ERROR;
    return EXIT_HARNESS_ERROR;
  }
}

/**
 * Write the JSON summary to `--out` when requested. Write failures are
 * reported but never flip the exit code (the run itself already decided it).
 */
export async function writeJsonOut(report, outPath) {
  if (outPath === undefined) return;
  const { writeFile, mkdir } = await import("node:fs/promises");
  const { dirname } = await import("node:path");
  try {
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, `${JSON.stringify(report.json(), null, 2)}\n`);
    process.stdout.write(`JSON summary written to ${outPath}\n`);
  } catch (error) {
    process.stdout.write(
      `WARN out Could not write JSON summary to ${outPath}: ${
        error instanceof Error ? error.message : String(error)
      }\n`,
    );
  }
}
