`workspace-welcome` is a local dashboard for your projects folder — it scans directories for git state, stack, and health alerts, and scaffolds new better-t-stack projects. A fullstack TanStack Start app (tRPC-backed server routes inside the app); no database, no auth. Use `pnpm` for all package operations — never a different package manager or another project's lockfile. Run commands and git operations from the repo root.

Scaffolded with Better-T-Stack — treat `bts.jsonc` as the stack source of truth.

## Monorepo

pnpm workspaces monorepo.

| Path | Package | Purpose |
|------|---------|---------|
| `apps/web` | `web` | The dashboard app: UI, server routes, tRPC API (dev port 37420) |
| `apps/docs` | `docs` | Marketing + light docs site (dev port 8005); static to GitHub Pages |
| `packages/api` | `@workspace-welcome/api` | tRPC routers and all server logic — scanner, git, store, reports, scaffolding |
| `packages/ui` | `@workspace-welcome/ui` | Shared shadcn-style components on Base UI (Tailwind CSS v4) |
| `packages/env` | `@workspace-welcome/env` | Typed environment validation |
| `packages/config` | `@workspace-welcome/config` | Shared tsconfig.base.json |

## Commands

Dev: `pnpm dev` or `pnpm dev:web` (dashboard — Vite on port 37420); docs site: `pnpm dev:docs` (port 8005)
Build & typecheck: `pnpm build`, `pnpm run check-types`
Docs Pages deploy: `pnpm run deploy:docs` (builds `apps/docs`, writes CNAME/`.nojekyll`, force-pushes `dist/client` to `gh-pages` as a single fresh commit)
Per package: `pnpm --filter <name> <script>` — e.g. `pnpm --filter web build`; across packages: `pnpm -r <script>`
The api package also ships the AGENTS.md generator: `pnpm --filter @workspace-welcome/api agents-md --bts-jsonc <path/to/bts.jsonc>`

## Working agreements

Before reporting work done, run `pnpm run check-types` — and `pnpm run build` for substantial changes.
Fix every TypeScript/LSP error your changes introduce; never silence an error — fix the cause.
No `any`, `as any`, or `: any` — use proper types, `unknown`, inference, or validated schemas.
With verbatimModuleSyntax on, use `import type` for type-only imports.
Keep imports ordered: external/workspace imports first, a blank line, then local imports.
Search for existing components, types, and utilities before creating new ones; keep one source of truth for types, and never hand-edit generated files.
Check the `pnpm-workspace.yaml` catalog and existing `package.json` files before adding a dependency, and use `catalog:` references when available.
Do not start long-running dev servers — assume one is already running; start one only if the user explicitly asks or none is clearly running.
Never run `git stash`, `git reset --hard`, `git clean`, or anything else that destroys uncommitted work; no commits or pushes unless the user asks.
Treat everything as production code: no placeholders, `TODO`/`FIXME`, unused imports or variables, fake success states, or hardcoded secrets.
Only run scripts that exist in a package.json — inspect before inventing, and report anything you couldn't run with the reason.

## Where to look next

- Domain vocabulary (Root, Project, Scan, Report, IDE server): `CONTEXT.md`
- Architecture map for implementers — routes, scan cache, spawn patterns, quality gates: `docs/research/workspace-welcome-architecture.md`
- Design decisions (snitch invocation, file-browser confinement, web IDE): `docs/adr/`
