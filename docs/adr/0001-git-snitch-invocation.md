# ADR 0001 — git-snitch invocation: configurable command, local build preferred

Status: accepted (2026-08-21)

## Context

Reports are produced by the git-snitch CLI (`@git-snitch/cli`). The user's
checkout at `~/workspace/gitsnitch` is typically *ahead* of the published npm
release (at decision time: 2 unreleased commits over v0.0.15), and `git-snitch`
is not installed globally. The app must spawn the CLI reliably without
requiring the user to keep a global install in sync.

## Decision

A single configurable **snitch path** in Settings:

1. Default resolution order at run time: if a built local CLI exists
   (`~/workspace/gitsnitch/apps/cli/dist/index.js`) use `node <path>`;
   otherwise `npx -y @git-snitch/cli`.
2. The setting is a PATH, not a command string: it points at the CLI entry
   file (typically `<repo>/apps/cli/dist/index.js`) and is run via `node`.
   A set-but-missing path fails the report run with a clear error rather
   than falling back silently. (Revised 2026-08-21 after user feedback:
   configurable path defaulting to the local checkout; the earlier
   full-command-override variant was dropped for simplicity.)

## Consequences

- No hard coupling to the gitsnitch repo: if it moves or isn't built, reports
  still work via npx (first npx run pays a download).
- Local unreleased changes are picked up by rebuilding gitsnitch, nothing to
  change here.
- The report run must surface CLI failures (non-zero exit, missing binary or
  path) rather than silently swallowing them.
