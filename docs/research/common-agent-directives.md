# Common Agent Directives — mined from the user's workspace

Phase 1 output for the AGENTS.md generator plan
(`docs/plans/2026-08-31-agents-md-generator.md`). This documents the user's real,
recurring conventions as written in their own root instruction files. It is the
human-readable source for the generator's distilled directive set (Phase 2).

## 1. Method

Immediate subdirectories of `/home/didi/workspace` were enumerated (26 project
directories; `clone_projects` skipped — it is a script file, not a project). Each
project root was checked for `AGENTS.md` and `CLAUDE.md`. 21 projects have a root
instruction file: **18 with `AGENTS.md`** (appart-limoges, arcade-vibe, atsynct,
Clanker, cropcircle-app, dbuild, docs-dgaf, FeedElity, Formedible, gitsnitch,
ideadump, launch-mommy, LearnABee, lmaafy, parseArger, solard, speaches-ui,
stationio) and **3 with only `CLAUDE.md`**, read as secondary corpus of equal
purpose (ai-skills, LiteChat, speaches). All 21 files were read in full; no other
files were consulted. Three projects (atsynct, dbuild, FeedElity) also contain a
`CLAUDE.md` alongside their `AGENTS.md`; per scope only the `AGENTS.md` was used
(FeedElity's `CLAUDE.md` is a symlink to its `AGENTS.md` anyway). Five projects
have no root instruction file (devbox-install, fck-chat-control, git-snitch,
sshm0, workspace-welcome) and contribute no evidence. Counts below distinguish
AGENTS.md (A) vs CLAUDE.md (C) sources.

## 2. Directives by theme

### 2.1 Package-manager discipline (parameter)

**Distilled:** Use the project's one package manager for everything; never use a
different one. The user's strongest phrasing: "Do not use npm, yarn, bun, or
parent-repo lockfiles for git-snitch work" (gitsnitch); "Use `pnpm` for all
package operations" (arcade-vibe); "Use `pnpm` (`packageManager` is
`pnpm@10.10.0`)" (stationio); "Use **Bun** as package manager (bun@1.2.15)"
(dbuild).

**Prevalence:** 17 of 18 A + 1 C pin a single PM. Explicit statements: gitsnitch,
arcade-vibe, atsynct, docs-dgaf, ideadump, launch-mommy, lmaafy, solard, stationio,
dbuild, FeedElity ("Use Bun") (all A); implied by commands throughout: Clanker,
cropcircle-app, Formedible, LearnABee, appart-limoges (A), LiteChat (C).
speaches-ui (A) runs pnpm inside its dev container ("Do NOT run `npm`, `pnpm`,
`npx`, `yarn` … directly on the host shell"). PM distribution: pnpm ×14, bun ×2
(dbuild, FeedElity), npm ×2 (appart-limoges, LiteChat). The only A with no PM pin
is parseArger (a Python project).

**Variations:** Newer bts-era files add "pinned via `packageManager`" (ideadump)
or "corepack" (docs-dgaf, lmaafy). Strength ranges from no dedicated PM statement
at all — Clanker's pnpm is implied only by its command listings — to a prohibition
list (gitsnitch).

### 2.2 Run everything from the repo root / respect repo boundaries

**Distilled:** Run commands and git operations from the project root. Nested or
legacy repositories are read-only references unless explicitly asked otherwise.

**Prevalence:** 10 A. "Always run commands from repo root" verbatim in atsynct,
docs-dgaf, ideadump, launch-mommy, lmaafy, solard; "Root-level Commands (Run from
repository root)" in appart-limoges. Repo-boundary variant: gitsnitch ("this
directory is its own git repository … Legacy files in the parent repo are
read-only references only") and stationio ("Run `git` commands from
`stationio-next`, not from the parent StationIO repo"). Related: FeedElity
("The old app … is only a behavioral and migration reference. Do not import …"),
solard (`old/` is "do not port, consult for behavior").

**Variations:** The bts projects state it as a root-command habit; the two
projects nested inside other git repos (gitsnitch, stationio) state it as a hard
boundary.

### 2.3 Monorepo shape table and filter/turbo navigation

**Distilled:** State the workspaces (pnpm workspaces + Turborepo), show the
package table, and give the two navigation commands: per-package
`pnpm --filter <name> <script>` and cross-package `pnpm turbo <task>`.

**Prevalence:** Package tables with `| Package | Name | Purpose |` in 6 A
(atsynct, docs-dgaf, ideadump, launch-mommy, lmaafy, solard); directory trees or
layout lists in Clanker, cropcircle-app, dbuild, docs-dgaf, lmaafy, FeedElity
("`apps/*` and `packages/*`"), gitsnitch, stationio. The exact
"`pnpm --filter …` / `pnpm turbo <task>`" pair appears in 8 A (the six tables plus
gitsnitch, stationio).

**Variations:** ideadump documents scaffold quirks in the table ("`packages/ideadump-lib`
ships as **`@ideadump/core`**. Directory and package name disagree — blame the
scaffold"); stationio documents a deliberately isolated nested workspace.

### 2.4 `bts.jsonc` as the stack reference

**Distilled:** "Treat `bts.jsonc` as the stack source of truth" (FeedElity);
"Treat `bts.jsonc` as the scaffold/stack reference" (stationio).

**Prevalence:** 2 A (FeedElity, stationio). Both are bts-scaffolded and explicit;
the other bts projects imply it by describing the Better-T-Stack layout instead.

### 2.5 Verification gate: check-types + build before done

**Distilled:** Run the workspace typecheck — and the build for real changes —
before reporting done. "Always run `pnpm run check-types` and `pnpm run build`
before committing" (arcade-vibe); "Run `npm run check-types` before commits"
(appart-limoges — check-types only, no build gate); "For verification, prefer
`bun run check-types` and `bun run build`" (FeedElity); "when you release to
user, the app must build !" (LiteChat, C).

**Prevalence:** 15 A + 1 C name the typecheck script; `check-types` is the
near-universal script name (bun projects too). Build-as-gate: arcade-vibe,
FeedElity, gitsnitch, stationio, Formedible ("ALWAYS use `pnpm run check-types`
(all packages) as the final verification"), speaches-ui, LiteChat (C);
appart-limoges gates on `npm run check-types` alone, with no build requirement.

**Variations:** Per-package narrow checks (`pnpm -F web exec tsc --noEmit`,
atsynct/docs-dgaf) are offered as the fast path, with the root check as the gate.
LearnABee adds a precision rule: build via the package script, "NEVER bare
`vite build`".

### 2.6 Fix every LSP/TypeScript error you introduce; never silence errors

**Distilled:** "You **must** fix all LSP / TypeScript errors introduced by your
changes before finishing a task" (atsynct, docs-dgaf, launch-mommy, lmaafy, solard,
ideadump); "fixing LSP errors is NOT OPTIONAL" (dbuild); "FIX LSP ERRORS ! THEY
ARE MANDATORY TO BE FIXED !" (cropcircle-app); "Do not silence TypeScript, lint,
or runtime errors. Fix the cause" (FeedElity verbatim; stationio broadens it to
"build, lint, runtime, or test failures"; gitsnitch phrases it as "Do not catch
and ignore failures").

**Prevalence:** 12 A. This is the user's most emotionally-marked rule — cropcircle-app
pairs it with "NO 'this is not what my fault so i wont fix the error' TOLERATED".

**Variations:** bts-table projects carry a dedicated "## LSP Errors" section;
the quality-bar projects (FeedElity, gitsnitch, stationio) fold it into "do not
silence failures"; dbuild repeats it four times with escalating caps.

### 2.7 No `any` — strict typing

**Distilled:** "**Never** use `any`, `as any`, `: any`. Not in function params,
not in type casts, not in generics. Use proper types, `unknown`, or branded
types" (docs-dgaf, launch-mommy, lmaafy, solard, Formedible verbatim);
"The use of `any` is strictly prohibited" (arcade-vibe); "`any`, `as any`, `:any`
are forbidden and punishable by DEATH" (cropcircle-app); "`:any` and `as any` are
forbidden ! STRICTLY FORBIDDEN !" (dbuild).

**Prevalence:** 13 A + 1 C analog (speaches: "Always use type hints for
function/method parameters and return types" in Python).

**Variations:** Two projects document narrow exceptions — atsynct (Convex
`v.any()` for unstructured payloads, test matchers, generated files) and ideadump
(test matchers, one documented env bridge, "match the existing cast rather than
fighting the types"). Wording strength: neutral (atsynct, ideadump) → all-caps
with expletives (cropcircle-app, dbuild).

### 2.8 `import type` for type-only imports

**Distilled:** "`verbatimModuleSyntax: true` — always use `import type` for
type-only imports" (atsynct, docs-dgaf, launch-mommy, lmaafy, solard, ideadump);
"use `import type` for type-only imports" (dbuild, FeedElity, gitsnitch,
cropcircle-app, arcade-vibe, appart-limoges).

**Prevalence:** 12 A.

**Variations:** Rationale differs ("to avoid import cycles" dbuild; verbatim flag
elsewhere); cropcircle-app adds the companion cast rule "Links and url must be
casted 'as Route'" (stack-specific, see §4).

### 2.9 Import order: external first, blank line, then local

**Distilled:** "External/workspace imports first, blank line, then local `@/`
imports" (docs-dgaf, launch-mommy, lmaafy, solard, atsynct, ideadump); "Keep
external imports first, then a blank line, then local imports" (FeedElity,
gitsnitch).

**Prevalence:** 10 A (the eight above plus cropcircle-app's grouped ordering and
appart-limoges' commented example).

**Variations:** Identical rule, three formulations (prose, numbered groups,
code sample).

### 2.10 DRY / single source of truth / reuse before creating

**Distilled:** "Always search for existing components before creating new ones"
+ "Single source of truth for types … Never redeclare the same type across
multiple files" (docs-dgaf, launch-mommy, lmaafy, solard, Formedible). The
user's caps-lock version: "YOU MUST REUSE EXISTING TYPES ! … it is as bad as
using `any`" (arcade-vibe); "DO NOT DEFINE TYPES OR INTERFACES EVERYWHERE ! I
WANT DRY SINGLE SOURCE OF TRUTH !" (cropcircle-app). Also "Reuse first" (ideadump,
atsynct).

**Prevalence:** 9 A explicit DRY sections (arcade-vibe, atsynct, cropcircle-app,
docs-dgaf, Formedible, ideadump, launch-mommy, lmaafy, solard); related in dbuild
("Follow existing code patterns as the style guide"), stationio ("Do not add
speculative compatibility layers"), FeedElity ("no speculative abstractions").
The "never hand-edit generated files" rule belongs to this family: atsynct
(`_generated/`), ideadump (`routeTree.gen.ts`), parseArger (generated parser
between markers).

**Variations:** UI-library-first ordering varies by stack (`@<scope>/ui/components`,
`@ideadump/ui`, `packages/ui`); component-placement sub-rules (feature
subdirectories, no non-exported helpers in pages) are consistent across the five
files that share the DRY template.

### 2.11 Check the catalog / existing package.json before adding a dependency

**Distilled:** "Check `pnpm-workspace.yaml` catalog and existing `package.json`
files before adding new packages … Use `catalog:` references when available"
(atsynct, docs-dgaf, launch-mommy, lmaafy, solard, ideadump, Formedible);
"Check existing workspace dependencies before adding new packages. Prefer
catalog/workspace references" (FeedElity, stationio).

**Prevalence:** 9 A.

**Variations:** ideadump adds a don't-touch corollary (transitive deps that look
unused are load-bearing: "Don't 'clean up' those entries").

### 2.7 vs 2.10 note: quality bar / production quality / no slop

**Distilled:** "Treat every implementation as production code, not a scaffold"
(FeedElity); "no AI slop, no placeholder implementations, no fake success states,
no mock-only behavior" (gitsnitch); "Treat every implementation as
production-grade, not a scaffold or demo. No AI slop …" (stationio); "Do not
leave placeholder code, `TODO`, or `FIXME`" (FeedElity); "no `TODO`, `FIXME`,
unused imports, unused variables, console-log hacks" (gitsnitch).

**Prevalence:** 3 A carry a full "Production Quality Bar" section (FeedElity,
gitsnitch, stationio); LiteChat (C) states the build-must-pass version. Secrets
discipline is stated in 5 files: "Never commit `.env` files" (appart-limoges),
"Never hardcode secrets; use env vars" (atsynct, ideadump), "Do not hardcode
secrets, credentials, user data, deployment URLs" (stationio), "Never print it"
(speaches-ui).

### 2.12 Dev-server guard

**Distilled:** The dev server is already running — do not start long-running dev
servers during agent work; only start one when the user explicitly asks or none
is clearly running.

**Prevalence:** 12 files (11 A + 1 C). Absolute form: "The dev server is **always
running**. Do NOT start it … Ever." (docs-dgaf, launch-mommy, lmaafy, solard);
"DO NOT RUN THE DEV SERVER ! IT IS RUNNING !" (cropcircle-app); "DO NOT START
LONG RUNNING PROCESSES ! NO `bun run dev` !!! Strictly forbidden !" (dbuild);
"NEVER run `npm run serve` or start any servers - user has their own dev
environment running !" (LiteChat, C). Conditional form: "Do not start long-running
dev servers unless the user explicitly asks" (FeedElity, gitsnitch); "do not
start another … unless the user explicitly asks or the server is clearly not
running" (atsynct, ideadump); "do not run unless explicitly requested" ×3 +
"Do not start dev servers or persistent tools during routine verification"
(stationio).

**Variations:** The conditional form is the newer, safer formulation; the
absolute form assumes a permanently running server (see §3.2).

### 2.13 Git safety: no destructive commands, no unsolicited commits

**Distilled:** No `git stash` (and by extension no reset/clean/checkout-discard);
no commits or pushes unless the user asks.

**Prevalence:** 8 files (7 A + 1 C). "### NO GIT STASH COMMANDS !" (docs-dgaf,
launch-mommy, lmaafy, solard); "Do not run `git stash` unless the user explicitly
asks … Do not create commits or push unless the user asks" (atsynct, ideadump);
LearnABee generalizes after an incident: "`git reset --hard` is FORBIDDEN.
`git clean` is FORBIDDEN … every command that DESTROYS uncommitted work …";
speaches (C): "Never revert uncommitted working-tree changes without asking."
Commit policy in LearnABee (orchestrator repo): commits only when a phase
validates green.

**Variations:** The four clones ban only stash; atsynct/ideadump add
no-unsolicited-commits; LearnABee is the strongest (root cause documented
in-file).

### 2.14 Don't invent commands; report what you couldn't run

**Distilled:** "If you need linting, tests … and no script is listed here,
inspect the relevant `package.json` first. Do not invent commands" (stationio);
"`pnpm turbo lint` when lint scripts exist" (gitsnitch); "If a command cannot be
run because of environment limitations, report that explicitly with the reason"
(FeedElity, gitsnitch, stationio).

**Prevalence:** 3 A (stationio, gitsnitch, FeedElity).

### 2.15 Progressive disclosure

**Distilled:** Keep the root file minimal; point to per-package/per-topic docs
for detail. "Per-package detail lives in each package's `README.md`" (ideadump);
"For detailed rules, read `docs/agent/quality.md`" (gitsnitch); explicit
"## Progressive Disclosure" sections (arcade-vibe, atsynct, launch-mommy, solard);
stationio prescribes the policy: "Keep this root file focused on expectations
that apply to the whole monorepo. Add nested `AGENTS.md` files … Prefer focused
docs over expanding this file."

**Prevalence:** 8 A (arcade-vibe, atsynct, ideadump, launch-mommy, solard,
stationio, gitsnitch, speaches-ui's `.env.example` pointer).

### 2.16 Load the relevant skill for a library

**Distilled:** "When working with libraries, **ALWAYS load the corresponding
skill** first" (arcade-vibe); "When working on Convex code, **always read
`packages/backend/convex/_generated/ai/guidelines.md` first**" (atsynct); "load
`convex` skill ! MANDATORY !" (cropcircle-app); "use context7 in case you need up
to date documentation" (dbuild); "tell agents to use existing skills"
(ai-skills, C).

**Prevalence:** 9 A + 1 C. "Relevant Skills" sections in docs-dgaf, launch-mommy,
lmaafy, solard, ideadump, atsynct.

**Variations:** Which skill is entirely stack-dependent (convex, tanstack-start,
trpc, formedible …), so the generator can only emit this as a config-derived
section, not a fixed line.

## 3. Contradictions & tensions

Resolutions are autonomous (user unavailable); each picks the dominant practice
across the corpus or the safest default, with the alternative noted.

1. **Package manager differs per project.** pnpm ×14 vs bun ×2 (dbuild,
   FeedElity) vs npm ×2 (appart-limoges, LiteChat-C). *Resolution:* make the PM a
   generator parameter read from `bts.jsonc`/`packageManager`; default `pnpm`
   (dominant, and the plan's own repo is pnpm). *Alternative considered:* hardcode
   pnpm — rejected, it would be wrong for bun scaffolds.
2. **Dev-server guard strength.** Absolute (6 files — "…Ever." verbatim only in
   the 4 template clones; cropcircle-app and dbuild are absolute in different
   phrasing) vs conditional "unless the user explicitly asks or the server is
   clearly not running" (5 files). *Resolution:* emit the conditional form — it is the most recent
   wording (atsynct, ideadump), it degrades gracefully when no server is running
   (fresh clones, CI), and it still forbids the harmful default. The absolute
   form stays available as a per-project override.
3. **`any` tolerance.** LiteChat (C) notes "`@typescript-eslint/no-explicit-any`
   is disabled" and Formedible says "use `any` sparingly with ESLint warnings" —
   against 13 files banning it outright. *Resolution:* strict no-`any` wins
   (dominant, and matches the plan's NO-SLOP policy); Formedible/LiteChat lines
   predate or diverge from the user's later standard.
4. **Verification-gate strength differs across projects.** arcade-vibe gates
   commits on both `pnpm run check-types` and `pnpm run build`; appart-limoges
   gates commits on `npm run check-types` alone, with no build requirement.
   *Resolution:* emit check-types as the universal gate plus the build for
   substantial changes — the §2.5 distilled form covers both, and commands are
   always emitted with the resolved PM (feeds §3.1 resolution). Proof the
   generator is needed — hand-maintained files rot.
5. **Commits.** speaches (C) prescribes commit craft (small, semantic, linear
   history) while atsynct/ideadump say "Do not create commits or push unless the
   user asks", and the plan says the user reviews the working tree. *Resolution:*
   common set takes "no commits/pushes unless asked" (safest, dominant);
   commit-craft guidance stays out of generated files.
6. **Lint/formatting.** appart-limoges and Formedible have ESLint scripts; most
   bts projects have none; dbuild says "No .eslintrc or .prettierrc … Follow
   existing code patterns"; speaches (C) wants `ruff format/check` (Python).
   *Resolution:* do not put lint in the common set; the generator emits lint
   commands only when the config/scripts actually have them (consistent with
   §2.14).
7. **Comments.** cropcircle-app/dbuild: "no comments"; speaches (C): "prefer
   zero … must explain WHY". *Resolution:* compatible — adopt the speaches
   formulation (zero by default, WHY-only when needed) as it subsumes the ban
   without forbidding justified comments; keep it out of the minimal set.
8. **Testing directives.** "No test framework; use Vitest when adding" (5 A) vs
   full TDD workflow (FeedElity, gitsnitch, stationio) vs configured suites
   (atsynct, ideadump, docs-dgaf, lmaafy). *Resolution:* out of the common set —
   the generator emits a testing section only from real scripts/config.

## 4. One-off / project-specific rules (NOT for the common set)

- Clanker: "DO NOT READ proto/ ! NEVER ! IT IS A PROTOTYPE …" (and keep out of
  token-wasting dirs).
- cropcircle-app: "NO '-' IN FILES USED BY CONVEX"; cast typed links `as Route`;
  Convex `_generated` availability means a compile error — check-types, don't
  dev-server.
- Formedible: fix in `packages/formedible/src/` → build → `quick-sync.js` →
  verify (monorepo sync workflow); "NEVER USE confirm OR alert !".
- speaches-ui: all installs/builds/tests run inside the project container
  (`docker compose run --rm app …`), never on the host.
- LearnABee: "No blind waits" — never `sleep`/`wait` to pass time; orchestrator
  dispatch conventions; e2e with `--workers=1`.
- speaches (C): Python style (3.12 generics syntax, pathlib over os.path,
  pydantic over dataclasses, `logger.xxx` over print, `ruff format` + `ruff check`).
- parseArger: never edit code between `# @parseArger-parsing` markers — edit
  declarations, run `bin/generate`; absolute paths in tool calls.
- ai-skills (C): subagent research workflow (parallel research agents,
  `.search-data/`, context-giving).
- dbuild: GitHub Pages static-export constraint ("no backend server !").
- stationio: `git status --short` before/after changes; isolated nested
  `apps/circuits` workspace.
- ideadump: two-stacks-in-one-repo table (local-first vs cloud scaffold);
  server-only singletons must not be imported client-side.

## 5. Generator-ready distillation

The minimal ordered directive set for EVERY generated AGENTS.md. Each item
traces to ≥2 corpus files (trace counts in parentheses; A = AGENTS.md,
C = CLAUDE.md-only). `[PARAM]` marks items whose text is derived from the
project's config. Wording is sized for a ≤60-line root file.

1. **Package-manager discipline** `[PARAM: package-manager name]` — Use `<pm>`
   for all package operations; never use a different package manager or another
   project's lockfile. (16: gitsnitch, arcade-vibe, atsynct, docs-dgaf, ideadump,
   launch-mommy, lmaafy, solard, stationio, dbuild …)
2. **Work from the repo root** — run commands and git operations from the project
   root; treat parent/legacy code as read-only reference. (10: atsynct, ideadump,
   gitsnitch, stationio, FeedElity, docs-dgaf …)
3. **Monorepo navigation** `[PARAM: layout + task runner]` — one-line stack
   description + package table; per-package `<pm> --filter <name> <script>`,
   cross-package `turbo <task>`. (10: atsynct, docs-dgaf, ideadump, launch-mommy,
   lmaafy, solard, gitsnitch, stationio, Clanker, cropcircle-app)
4. **`bts.jsonc` is the stack source of truth.** (2: FeedElity, stationio)
5. **Verification gate** `[PARAM: script names]` — run `<pm> run check-types`
   (and `<pm> run build` for substantial changes) before reporting done.
   (16: appart-limoges, atsynct, FeedElity, Formedible, gitsnitch, stationio,
   speaches-ui, LiteChat-C …)
6. **Fix every TypeScript/LSP error you introduce; never silence an error — fix
   the cause.** (12: atsynct, cropcircle-app, dbuild, docs-dgaf, FeedElity,
   Formedible, gitsnitch, ideadump, launch-mommy, lmaafy, solard, stationio)
7. **No `any`, `as any`, or `: any`** — use proper types, `unknown`, inference,
   or validated schemas. (13: arcade-vibe, atsynct, cropcircle-app, dbuild,
   docs-dgaf, FeedElity, Formedible, gitsnitch, ideadump, launch-mommy, lmaafy,
   solard, stationio)
8. **`import type` for type-only imports** (verbatimModuleSyntax). (12: appart-limoges,
   arcade-vibe, atsynct, cropcircle-app, dbuild, docs-dgaf, FeedElity, gitsnitch,
   ideadump, launch-mommy, lmaafy, solard)
9. **Import order: external/workspace first, blank line, then local imports.**
   (10: appart-limoges, cropcircle-app, atsynct, docs-dgaf, FeedElity, gitsnitch,
   ideadump, launch-mommy, lmaafy, solard)
10. **DRY, single source of truth** — search existing components/types before
    creating new ones; never redeclare types across files; never hand-edit
    generated files. (11: arcade-vibe, atsynct, cropcircle-app, docs-dgaf,
    Formedible, ideadump, launch-mommy, lmaafy, solard, parseArger, dbuild)
11. **Check the workspace catalog / existing package.json before adding a
    dependency; use `catalog:` refs when available.** (9: atsynct, docs-dgaf,
    FeedElity, Formedible, ideadump, launch-mommy, lmaafy, solard, stationio)
12. **Do not start long-running dev servers** — assume one is already running;
    start one only if the user explicitly asks or none is clearly running.
    (12: cropcircle-app, dbuild, docs-dgaf, FeedElity, gitsnitch, ideadump,
    launch-mommy, lmaafy, solard, atsynct, stationio, LiteChat-C)
13. **Git safety** — no `git stash`/`reset --hard`/`clean` or any command that
    destroys uncommitted work; no commits or pushes unless the user asks.
    (8: docs-dgaf, launch-mommy, lmaafy, solard, atsynct, ideadump, LearnABee,
    speaches-C)
14. **Production quality** — no placeholders, TODO/FIXME, unused imports/vars,
    fake success states, or hardcoded secrets. (5: FeedElity, gitsnitch,
    stationio, LiteChat-C, + secrets trace: appart-limoges, atsynct, ideadump,
    stationio, speaches-ui)
15. **Don't invent commands** — use scripts that exist in package.json; report
    any command you skipped or couldn't run, with the reason. (3: stationio,
    gitsnitch, FeedElity)

Optional config-derived sections (emit only when applicable, not part of the
fixed set): skills-to-load per stack (§2.16, 10 files), testing section from real
scripts (§3.8), lint/format from real scripts (§3.6), progressive-disclosure
pointers to docs the project actually has (§2.15, 8 files).

If a harder cap than 15 is ever needed, trim in reverse order: 15, 14, 9, 4 —
but never below item 12 (dev-server guard) or 13 (git safety); those are the
user's most emphatic, most repeated rules.
