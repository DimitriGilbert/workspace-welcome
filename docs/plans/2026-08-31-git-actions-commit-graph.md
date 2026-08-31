# Plan: git push / fetch-branch / switch-branch + commit graph block

Date: 2026-08-31
Status: approved (user request)
Orchestration: subagent-orchestration (implementer → validator → fix loop ≤3; parallel phases get per-sub-phase validators + a phase-wide validator)
Research input: docs/research/commit-graph-library-choices.md (background agent, must land before Phase 3a dispatch)

## Goal

On the project detail page (`apps/web/src/routes/projects.$.tsx`):

1. **Push** the current branch to origin — mirroring the existing Fetch/Pull buttons.
2. **Fetch a specific branch** from origin — arrow button opening a control with a Select of
   existing origin branches + free-text custom name + spinner while running.
3. **Switch branch** — with a confirmation dialog that warns about messing up current work,
   escalating when an agent may be working on the repo.
4. **Commit graph** — simple DAG lanes with hover-to-message, as a 4th block on the detail
   page, full width like the file browser. Reusable component in packages/ui (shadcn-style,
   distributable later). Standard git only — no GitHub API.

## Ground truth (from discovery)

- Git ops live in `packages/api/src/lib/git.ts`: `gitFetch(dir)` = `git fetch --all --prune`,
  `gitPull(dir)` = `git pull --ff-only`, both via `gitAction(args, cwd)` →
  `execFileAsync("git", args, { cwd, timeout: 60_000, maxBuffer: 1MB })` returning
  `GitActionResult { ok, output }` (never throws). Inspection via `gitInspect` (branch,
  remote, ahead/behind, dirtyCount, lastCommit) with 4s timeout. Types in `lib/types.ts`
  (`GitInfo`).
- Router: `packages/api/src/routers/projects.ts` — `fetchRemote`/`pull` mutations are the
  template: `requireKnownProject(path)` → git op → `refreshCachedProject(path, settings)` →
  `if (!res.ok) throw new Error(res.output)` → `{ ok: true, message }`. Errors: plain
  `new Error`; client toasts `e.message`. Project path IS the repo dir and its identity.
- UI: pull/fetch buttons at `projects.$.tsx` ~L430-452 (size="xs", lucide icons, `animate-spin`
  on pending), `gitBusy` gate ~L240, `invalidateScan()` after success, sonner toasts.
- Full-bleed block template: `div.px-5.pb-6.pt-6.sm:px-8.lg:px-10` wrapping `<FileBrowser>`
  (~L594-597); the 4th block is a sibling with the same wrapper class.
- UI kit: Base UI `@base-ui/react ^1.6` — Dialog (controlled open pattern in
  `apps/web/src/components/file-browser/actions.tsx` L42-190 is the confirmation template),
  Select, Input, Tooltip, Popover exist; NO alert-dialog/hover-card/spinner — spinner idiom
  is `<Loader2 className="animate-spin" />`. No chart/d3 deps anywhere. React 19.2, Tailwind
  4.3, zod 4.4 (catalog). packages/ui exports subpath `@workspace-welcome/ui/components/*`,
  single-file shadcn "base-lyra" style with `data-slot` attrs.
- No agent-session detection exists. Risk proxies: dirtyCount (fresh `git status --porcelain`),
  `.git/index.lock` existence (git op in flight), `.git/index` mtime age (recent activity),
  `ide` shared server running (`lib/ide.ts` singleton).
- Gates: `pnpm run check-types` + `pnpm run build`. No tests/lint configured.

## Phase 1 — API: git operations (packages/api only)

Extend `lib/git.ts` (keep `GitActionResult` convention; execFile array args only — never a
shell) and `routers/projects.ts`:

1. `gitPush(dir)`: `git push -u origin HEAD` — pushes the current branch to the same-named
   ref on origin and sets upstream, covering first-push and already-tracked cases with one
   standard command.
2. `listBranches(dir)`: `git branch --format=%(refname:short)` + `git branch -r
   --format=%(refname:short)`; return `{ local: string[], remote: string[] }` — remote
   stripped of `origin/` prefix, `origin/HEAD` excluded, sorted.
3. `gitFetchBranch(dir, branch)`: `git fetch origin <branch>` — git errors naturally for
   unknown refs; output surfaces via the standard `{ok, output}`.
4. `gitSwitchBranch(dir, branch)`: `git switch <branch>` (git DWIM creates a tracked local
   branch from the unique `origin/<branch>` when no local one exists).
5. Branch name validation: shared zod schema — non-empty, ≤200 chars, must not start with
   `-`, no whitespace/control chars, none of `~ ^ : ? * [ \` ..` and no trailing `.` or `/`
   or `.lock`. Used by fetchBranch + switchBranch inputs.
6. `switchSafety(dir)`: fresh probe returning `{ dirtyCount: number, gitLock: boolean,
   indexIdleSeconds: number | null, ideRunning: boolean }` — `git --no-optional-locks status
   --porcelain` (count), stat `.git/index.lock`, stat `.git/index` mtime vs now (null if
   missing), ide running from the ide lib singleton.
7. `commitLog(dir, limit)`: `git log --date-order --max-count=<limit>
   --format=<record-sep fields>` producing per commit: hash, parent hashes, decorations
   (`%d`), subject, author name, author timestamp. Parse into typed `CommitLogEntry[]`
   (`{ hash, parents, subject, author, timestamp, refs: string[], isHead }` — parse `HEAD`
   + ref names out of decorations). Default limit 200, zod max 500.
8. New procedures on `projectsRouter`, all `{ path: z.string() }` + `requireKnownProject`:
   queries `branches`, `switchSafety`, `commitLog`; mutations `push`, `fetchBranch`
   `{path, branch}`, `switchBranch` `{path, branch}`. Mutations follow the fetchRemote
   template incl. `refreshCachedProject` (fetch/switch/push all change scan-relevant state).

Validator: read every changed hunk; verify arg-array construction (no shell), branch-name
schema rejects dangerous values (`-u`, `--upload-pack`, `..`, whitespace), `commitLog` parse
handles merges/octopus/empty repo (isRepo false → empty array, not throw), procedures match
router conventions, NO-SLOP, check-types + build.

## Phase 2 — UI: push, fetch branch, switch branch (apps/web only)

Owns `projects.$.tsx` (+ may extract a `apps/web/src/components/project-git-actions.tsx` if
the route file would grow unwieldy):

1. **Push button** beside Pull: `ArrowUpToLine` size="xs" (variant mirroring Pull), same
   `gitBusy` gate + `animate-spin` while pending, success/error toasts like pull.
2. **Fetch branch control**: an arrow button (e.g. `ArrowDownToLine`-family or chevron) next
   to Fetch opening a small Dialog/Popover: Select listing `trpc.projects.branches` remote
   options + an Input for a custom name (either suffices), confirm button with Loader2
   spinner while the `fetchBranch` mutation is pending; toast + `invalidateScan()` on done.
3. **Switch branch**: the current branch label in the git InfoCell becomes a button (or gains
   a switch affordance) opening a Dialog with Select of local + remote branches; on choose →
   confirmation Dialog (file-browser actions.tsx pattern): shows fresh `switchSafety` info —
   generic confirm normally; when `dirtyCount > 0 || gitLock || indexIdleSeconds < 120` the
   copy escalates: warns that an agent may be working and switching can mess up current work
   (mention dirty file count). Confirm runs `switchBranch` mutation, toasts, `invalidateScan()`.
4. Keep all existing behavior intact (gitBusy shared gate across push/fetch/pull/switch).

Validator: read the diff hunks; mirror-check against pull button conventions; confirm the
warning dialog escalates exactly per the safety rule; no dev server; check-types + build.

## Phase 3a — CommitGraph component (packages/ui only) — follows research verdict

`packages/ui/src/components/commit-graph.tsx` per docs/research/commit-graph-library-choices.md
recommendation (expected: custom SVG lane renderer, zero new deps). Pure/presentational:

- Props: typed commit entries (`hash, parents, subject, author, timestamp, refs, isHead`),
  optional render-prop/slot for the hover card content so date formatting stays in the app
  (date-fns lives in apps/web, not ui).
- Date-order lane assignment: first-parent trunk lane, one lane per divergent line, merge
  nodes return to trunk; lanes colored from theme tokens (kiln palette CSS vars), dots for
  nodes, straight/curved lane lines; HEAD + decorations visually distinguished.
- Hover on a row/node → Base UI Tooltip with full subject (+ author/time via slot).
- Single file, `data-slot` attrs, `cn` from ui lib, ≤ ~300 lines, no `use client` problems
  under TanStack Start SSR (mark client as needed).
- Validator: read the lane algorithm for correctness (forks, merges, octopus >2 parents,
  single-commit, empty), NO-SLOP (no new deps, no any), check-types + build.

## Phase 3b — Graph block integration (apps/web; after Phase 2 + 3a land)

- New full-width block on the detail page as a sibling of the FileBrowser wrapper (same
  `px-5 pb-6 pt-6 sm:px-8 lg:px-10` classes): section header "History" +
  `<CommitGraph>` fed by `trpc.projects.commitLog.queryOptions({ path, limit: 200 })`;
  map API entries → component props; author/time via the app-side slot (relativeTime +
  dateTooltip from `lib/format.ts`).
- States: loading skeleton, non-repo/empty → block hidden or empty-state message, error →
  quiet inline error. Refetch alongside scan invalidation (invalidate commitLog in
  `invalidateScan` helper or component-level).
- Validator: layout matches file-browser full-bleed pattern; data mapping types line up;
  check-types + build.

## Phase-wide validation (after 1, 2, 3a, 3b all pass)

Fresh validator reads all touched code together: router surface ↔ client calls ↔ component
props coherence; shared gitBusy gating; no duplicated types (single source in packages/api
types, AppRouter inference on client); NO-SLOP sweep; check-types + build.

## Out of scope

- Creating/deleting/renaming branches; merging; rebase; remote management beyond origin.
- Real agent-session detection (using the agreed proxies instead).
- Commits/push/deploy of the result (user will ask).

## Dispatch rules

NO-SLOP policy verbatim in every implementer/fixer dispatch; validators read code and enforce
it; gatekeeping before reporting done; max 3 fix attempts per phase.
