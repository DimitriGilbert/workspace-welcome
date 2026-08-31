import { readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import process from "node:process";

import { agentsMdConfigFromBtsJsonc, BtsJsoncParseError, parseBtsJsonc } from "./bts-jsonc";
import { generateAgentsMd } from "./generate";
import type { BtsJsoncConfig } from "./types";

/**
 * Standalone CLI: generate an AGENTS.md from an existing project's
 * bts.jsonc (Phase 4 backfill entry point).
 *
 *   pnpm agents-md --bts-jsonc /path/to/project/bts.jsonc
 *   pnpm agents-md /path/to/project/bts.jsonc --out /path/to/project/AGENTS.md
 *
 * The project name defaults to the directory containing bts.jsonc.
 */

const usage = `Usage: agents-md [options] [path/to/bts.jsonc]

Generate a minimal AGENTS.md from a Better-T-Stack config.

Options:
  -b, --bts-jsonc <path>  Path to the project's bts.jsonc (or pass it positionally)
  -o, --out <file>        Write the result to a file instead of stdout
  -n, --name <name>       Project name (default: the directory containing bts.jsonc)
  -h, --help              Show this help
`;

interface CliOptions {
  readonly btsJsoncPath: string;
  readonly outPath: string | null;
  readonly projectName: string | null;
}

function parseArgs(argv: readonly string[]): CliOptions | null {
  let btsJsoncPath: string | null = null;
  let outPath: string | null = null;
  let projectName: string | null = null;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) break;
    const value = (): string | null => {
      const next = argv[index + 1];
      if (next === undefined) return null;
      index += 1;
      return next;
    };
    if (arg === "-b" || arg === "--bts-jsonc") {
      const next = value();
      if (next === null) return null;
      btsJsoncPath = next;
    } else if (arg === "-o" || arg === "--out") {
      const next = value();
      if (next === null) return null;
      outPath = next;
    } else if (arg === "-n" || arg === "--name") {
      const next = value();
      if (next === null) return null;
      projectName = next;
    } else if (arg.startsWith("-")) {
      return null;
    } else {
      btsJsoncPath = arg;
    }
  }
  return btsJsoncPath === null
    ? null
    : { btsJsoncPath: resolve(btsJsoncPath), outPath, projectName };
}

/**
 * The project name with its original casing lives in the reproducible
 * command ("pnpm create better-t-stack@latest SolarD --frontend …");
 * directory names are frequently lowercased copies of it.
 */
function projectNameFrom(reproducibleCommand: string, fallback: string): string {
  const match = /better-t-stack@latest\s+(\S+)/.exec(reproducibleCommand);
  return match?.[1] ?? fallback;
}

/** Returns the process exit code; output goes to stdout, diagnostics to stderr. */
export function main(argv: readonly string[]): number {
  if (argv.includes("-h") || argv.includes("--help")) {
    process.stdout.write(usage);
    return 0;
  }
  const options = parseArgs(argv);
  if (options === null) {
    process.stderr.write(usage);
    return 1;
  }

  let text: string;
  try {
    text = readFileSync(options.btsJsoncPath, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Cannot read ${options.btsJsoncPath}: ${message}\n`);
    return 1;
  }

  let config: BtsJsoncConfig;
  try {
    config = parseBtsJsonc(text);
  } catch (error) {
    if (error instanceof BtsJsoncParseError) {
      process.stderr.write(`${options.btsJsoncPath}: ${error.message}\n`);
      return 1;
    }
    throw error;
  }

  const fallbackName = basename(dirname(options.btsJsoncPath));
  const projectName =
    options.projectName ?? projectNameFrom(config.reproducibleCommand, fallbackName);
  const markdown = generateAgentsMd(agentsMdConfigFromBtsJsonc(config, projectName));

  if (options.outPath === null) {
    process.stdout.write(markdown);
  } else {
    writeFileSync(options.outPath, markdown);
    process.stderr.write(`Wrote ${options.outPath}\n`);
  }
  return 0;
}

process.exitCode = main(process.argv.slice(2));
