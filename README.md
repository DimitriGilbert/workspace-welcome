# Workspace Welcome

A personal dashboard for your projects folder, running on your machine.

A self-hosted welcome board: point it at any directory where your work lives and it tracks git state, the stack, health, your GitHub items and more. Panels drag, resize, and shed; the set keeps growing.

No accounts, no cloud. It reads your filesystem and keeps its state in an embedded sqlite database that never leaves the box.

<!-- SCREENSHOT-TODO(dashboard): recapture with a themed dashboard board (mission-control, dark scheme) with forge chips and the "My issues & pull requests" feed widget visible, 1440px landscape. The old card-grid dashboard is retired. -->
<!-- SCREENSHOT-TODO(project): recapture with a project page with the note field, the files / artifacts / ideation tab surface, and the Issues & PRs forge board. -->

## Quick start

Needs Node 22+, `curl` (or `wget`), and `tar`. Keep `git` on PATH.

```bash
curl -fsSL https://welcome-workspace.dbuild.dev/install.sh | sh
```

Installs the latest release to `~/.local/share/workspace-welcome/app`, starts a systemd user service on port **37420**, prints the management commands. Open `http://localhost:37420` and add a directory from the gear icon; projects appear as the scan runs. Re-running the installer upgrades in place. macOS or no-systemd: add `--no-service` and run `node serve-prod.mjs`. Details: [getting started](https://welcome-workspace.dbuild.dev/docs/getting-started).

From source: clone, `pnpm install`, `pnpm dev` on the same port **37420**, your working tree.

## What it does

**Scans.** Every immediate subdirectory of the roots you add becomes a project: dates ("updated" is the later of newest source mtime and last commit), git state (branch, ahead/behind, uncommitted count, last commit, remote), stack detection from the manifest (Rust, Go, Node, Python, Ruby, Elixir, PHP, Java, Deno, Nix, Docker, …), and remote deep links for GitHub / GitLab / Bitbucket / Codeberg / sourcehut. A fingerprint cache keeps warm reloads at ~0.7s on a 187-project workspace instead of ~6.5s cold.

**Alerts.** Health is computed from that state (no remote, diverged, behind, unpushed, dirty, stale WIP with dirty + 3 quiet weeks, dormant at 90+ days) and rolls up into each board's attention surface.

**Boards, not a page.** The dashboard is a widget board in one of three themes: **bento** (mosaic + workspace pulse), **meadow** (mosaic + workspace digests), **mission-control** (fleet ledger table, triage board, vitals, report panels), each with a light and a dark scheme. Pick a theme in the header; the choice persists. Mission-control's triage board also flags your feed's PRs that have sat untouched for 30+ days.

**Forge.** Your open issues and pull requests, from the git remotes, without a rate-limit incident:

- A cross-repo **"My issues & pull requests"** feed on every dashboard theme: the signed-in account's open items across every GitHub repo, workspace or not.
- **Forge chips** on project surfaces: open issue/PR counts beside the git chips, from the repo's cached snapshot or (honestly labeled) from your feed.
- A per-project **Issues & PRs board** with review-decision badges and label filters.
- **Nothing auto-syncs.** Data appears when you press Sync; the server enforces a min-interval, dedupes in-flight work, and runs one fetch at a time. Reads come from sqlite only. GitHub via your own `gh` CLI today; the adapter contract leaves room for Gitea/GitLab. Settings → Forge lists every mapped repo with per-repo Sync and Sync all.

**Project pages.** A note field for "where I left off" (the feature I actually use), git actions (fetch / pull ff-only / push, branch switcher with a safety probe, read-only commit history), quick-open in editor / terminal / folder, and the tabbed surface: **files** (confined lazy file browser with upload, rename, download, delete-to-trash via `gio`), **artifacts** (build/test screenshots and videos from configured folders, streamed with Range support), and **ideation** (an AI interview that grills an idea one question at a time, then writes a PRD and plan into the project's `docs/`).

**Reports.** git-snitch per repo (project page) or comparatively across a root (Settings). HTML is cached under XDG and served at `/reports/<key>`; the boards also embed its digests (activity, health, code mix, AI usage). The CLI resolves Settings path → local build → `npx`.

**Browser IDE.** "Open IDE" starts a shared code-server instance deep-linked to the project folder. Installs itself on first use (~100–200 MB, once), stops from Settings, `--auth none` on a trusted LAN.

**Create & clone.** Scaffold a new better-t-stack project into a tracked root (with AGENTS.md generation), or export a portable clone script from selected remotes; the app doesn't clone for you.

## How it works

pnpm workspaces monorepo, TanStack Start (frontend + server routes), tRPC, Tailwind v4, Base UI components:

| Path | Package | Purpose |
|------|---------|---------|
| `apps/web` | `web` | The dashboard app: UI, server routes, tRPC API (dev port 37420) |
| `apps/docs` | `docs` | This site (dev port 8005), static to GitHub Pages |
| `packages/api` | `@workspace-welcome/api` | tRPC routers and all server logic: scanner, git, forge, store, reports, scaffolding |
| `packages/db` | `@workspace-welcome/db` | sqlite persistence: drizzle schema, embedded migrations, libsql client |
| `packages/ui` | `@workspace-welcome/ui` | Shared shadcn-style components on Base UI |
| `packages/env` | `@workspace-welcome/env` | Typed environment validation |
| `packages/config` | `@workspace-welcome/config` | Shared tsconfig.base.json |

**State.** Everything persisted (roots, overrides for pin / note / hide / last-opened, open commands, artifact-folder configs, forge snapshots, the feed) lives in one embedded sqlite database at `$XDG_DATA_HOME/workspace-welcome/workspace-welcome.db` (drizzle + libsql, WAL, embedded migrations, ADR-0006). First boot imports the legacy `store.json` / per-project JSON files once, losslessly; they stay on disk as untouched backups and are never written again. Reports stay disposable cache files under `$XDG_CACHE_HOME/workspace-welcome/reports/`; the code-server install sits under `$XDG_DATA_HOME/workspace-welcome/ide/`. No auth: it's a single-user local tool.

**Scan cache.** Each project has a cheap fingerprint (directory mtime, `.git/HEAD`, `.git/index`, a `git status --porcelain` hash); only projects whose fingerprint moved get re-scanned. Overrides re-merge onto cached projects without a rescan. Refresh re-probes everything; `{ force: true }` forces a full rescan.

## Releases and the docs site

```bash
pnpm run release 0.2.0     # clean tree required; --dry-run packages without uploading
pnpm run deploy:docs       # publish docs + the updated /install.sh
pnpm run test:install      # systemd-container E2E over the published release (--local for unreleased)
```

Releases are GitHub Releases with a self-contained per-platform tarball (`workspace-welcome-<version>-<os>[-musl]-<arch>.tar.gz`, production `node_modules` included, the native sqlite binding ships too) plus `SHA256SUMS.txt`. `scripts/release.sh` builds all workspaces and boot-tests the packaged tree before packing. `scripts/install.sh` is the installer behind the one-liner. `pnpm run deploy:docs` builds `apps/docs`, writes `CNAME` + `.nojekyll`, copies the installer in as the site's `/install.sh`, and force-pushes `dist/client` to `gh-pages` as a single fresh commit.

## Docs

- Site: [welcome-workspace.dbuild.dev](https://welcome-workspace.dbuild.dev): install guide, features, glossary, settings/data
- Vocabulary: [`CONTEXT.md`](CONTEXT.md): Root, Project, Scan, Report, Forge, Ideation, Artifacts
- Architecture map: [`docs/research/workspace-welcome-architecture.md`](docs/research/workspace-welcome-architecture.md)
- Decisions: [`docs/adr/`](docs/adr/): snitch invocation, confined file browser, web IDE, sqlite persistence (0006), forge integration (0007)
- Install/release design: [`docs/research/install-distribution-patterns.md`](docs/research/install-distribution-patterns.md)

## Status

It does what I need it to do. The alert thresholds are opinionated (3 weeks for "stale WIP", 90 days for "dormant") and easy to change in `packages/api/src/lib/scan.ts` if yours differ.
