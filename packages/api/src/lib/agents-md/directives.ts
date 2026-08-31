/**
 * The common directives every generated AGENTS.md carries — the structured
 * form of "Generator-ready distillation" in
 * docs/research/common-agent-directives.md (the human-readable source, with
 * per-item corpus trace counts). `source` cites that document's section.
 *
 * Items 1-3 of the distillation (package-manager discipline, work from the
 * repo root, monorepo navigation) are rendered by the stack-specific
 * Package Manager / Monorepo / Commands sections instead of this list; item
 * 4 (bts.jsonc as stack source of truth) sits in the file's intro paragraph.
 * Everything below is rendered verbatim into "Working agreements".
 */

export interface DirectiveContext {
  /** `<packageManager> run`, used to name the verification-gate scripts. */
  readonly runCmd: string;
  /** Package-manager-specific dependency-catalog guidance (full clause). */
  readonly catalogHint: string;
}

export interface Directive {
  readonly id: string;
  /** Cite of the section in docs/research/common-agent-directives.md. */
  readonly source: string;
  readonly text: (context: DirectiveContext) => string;
}

export const commonDirectives: readonly Directive[] = [
  {
    id: "verification-gate",
    source: "§2.5",
    text: (context) =>
      `Before reporting work done, run \`${context.runCmd} check-types\` — and \`${context.runCmd} build\` for substantial changes.`,
  },
  {
    id: "fix-errors",
    source: "§2.6",
    text: () =>
      "Fix every TypeScript/LSP error your changes introduce; never silence an error — fix the cause.",
  },
  {
    id: "no-any",
    source: "§2.7",
    text: () =>
      "No `any`, `as any`, or `: any` — use proper types, `unknown`, inference, or validated schemas.",
  },
  {
    id: "import-type",
    source: "§2.8",
    text: () =>
      "With verbatimModuleSyntax on, use `import type` for type-only imports.",
  },
  {
    id: "import-order",
    source: "§2.9",
    text: () =>
      "Keep imports ordered: external/workspace imports first, a blank line, then local imports.",
  },
  {
    id: "dry",
    source: "§2.10",
    text: () =>
      "Search for existing components, types, and utilities before creating new ones; keep one source of truth for types, and never hand-edit generated files.",
  },
  {
    id: "catalog",
    source: "§2.11",
    text: (context) => `${context.catalogHint}.`,
  },
  {
    id: "dev-server",
    source: "§2.12",
    text: () =>
      "Do not start long-running dev servers — assume one is already running; start one only if the user explicitly asks or none is clearly running.",
  },
  {
    id: "git-safety",
    source: "§2.13",
    text: () =>
      "Never run `git stash`, `git reset --hard`, `git clean`, or anything else that destroys uncommitted work; no commits or pushes unless the user asks.",
  },
  {
    id: "production-quality",
    source: "§2.7 vs §2.10 note",
    text: () =>
      "Treat everything as production code: no placeholders, `TODO`/`FIXME`, unused imports or variables, fake success states, or hardcoded secrets.",
  },
  {
    id: "no-invented-commands",
    source: "§2.14",
    text: () =>
      "Only run scripts that exist in a package.json — inspect before inventing, and report anything you couldn't run with the reason.",
  },
];
