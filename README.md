# Workspace Welcome

A local dashboard for people who have too many projects and keep forgetting where they left off.

Point it at the folders where your projects live. It scans them, figures out the git state, guesses the language, and gives you one screen to answer the question every Monday morning: *what was I doing, and what's falling apart?*

No accounts, no database, no cloud. It runs on your machine and reads your filesystem.

## Why

My projects folder was a mess. Twenty-odd repos, half with uncommitted changes rotting for weeks, three with no remote, one I hadn't touched in a year. The folder view told me none of this. I wanted a screen that surfaced it — the stale WIP, the diverged branches, the thing I pinned last week because I meant to come back to it — without `cd`-ing into each one and running `git status`.

## What it does

**Scans** every immediate subdirectory of the roots you add and builds a project from each.

For every project it collects:

- **Creation and last-updated dates.** "Updated" is the later of the newest source-file mtime and the last commit, so neither a stray rebuild nor a commit with no code change falsely bumps it. Build output and deps (`node_modules`, `target`, `dist`, `.git`, ...) are skipped.
- **Git state.** Branch, ahead/behind upstream, uncommitted file count, last commit (message, author, date), and the remote.
- **Stack.** Detected from the manifest file — Rust (`Cargo.toml`), Go, Node, Python, Ruby, Elixir, PHP, Java (Maven/Gradle), Deno, Nix, Docker. Not exhaustive, but it covers the common ones.
- **Remote links.** Parses the remote URL into deep links for GitHub, GitLab, Bitbucket, Codeberg, and sourcehut — repo home, issues, and pull/merge requests. SSH and HTTPS both work.

Then it computes **health alerts** from that state:

| Alert | When | Severity |
|---|---|---|
| No remote | it's a repo with no remote | warn |
| Diverged | ahead *and* behind upstream | error |
| Behind | behind upstream | warn |
| Unpushed | commits not pushed | info |
| Dirty | uncommitted files | info |
| Stale WIP | dirty and last commit is 3+ weeks old | warn |
| Dormant | no activity in 90+ days | info |

The **Needs attention** panel rolls up everything at warn/error, sorted by last update, and folds away when you're done with it.

### Around the projects themselves

- **Pinned projects** live in their own section at the top — not just a pin icon on the same card.
- **Recency heat.** Recent projects get a vivid border that fades to neutral as they age (over ~90 days). You can tell at a glance what you've touched this week.
- **Per-project notes.** Each project has a "where I left off" note. This is the feature I actually use — the whole point is answering *"what was I doing here?"*
- **Hide.** Exclude something from the list without deleting it. Restorable from Settings.
- **Quick-open.** One click to open in your editor, open a terminal at the project, or reveal it in the file manager. The editor command is configurable (`code`, `cursor`, `zed`, whatever).
- **Reports.** A button on each project page runs git-snitch on that repo; Settings has one per tracked directory that scans everything under it. The HTML is cached and served by the app, opening in a new tab that swaps in the report once it's ready. The CLI path is configurable in Settings — local `~/workspace/gitsnitch` build by default, `npx` as fallback.
- **File browser.** A lazy file tree on each project page — drag-drop upload (10 MB a file, overwrites ask first), rename, new folder, download, and delete to trash when `gio` is around, permanent otherwise. Every path is resolved server-side and rejected if it escapes the project root.
- **Browser IDE.** "Open IDE" on a project page starts code-server — VS Code in a browser tab — deep-linked to that project's folder. One shared instance serves every project; it installs itself on first use, stops from Settings, and opens on whatever host you're browsing the dashboard from.

## Run it

Needs Node 22+, pnpm, and `git` on your PATH. `gio` is optional — the file browser falls back to permanent delete without it. The first "Open IDE" downloads code-server (~100–200 MB, once).

```bash
pnpm install
pnpm dev
```

Open `http://localhost:37420`. Add a directory from Settings (the gear icon, top-right). That's it — projects appear as the scan runs.

The dev server defaults to port **37420** (set in `apps/web/vite.config.ts`).

### Terminal quick-open

If you don't configure a terminal command, it auto-detects the first one it finds from: konsole, gnome-terminal, xfce4-terminal, mate-terminal, kitty, alacritty, wezterm, foot, tilix, xterm. Each gets the right working-directory flag for its CLI (`konsole --workdir`, `gnome-terminal --working-directory=`, etc. — they all disagree, which is why this exists). Set one explicitly in Settings if you care.

## How it works

Three packages, a pnpm workspace:

```
apps/web        TanStack Start app — the UI (also the server, via server route handlers)
packages/api    tRPC routers + the scanner (filesystem, git, stack detection, cache)
packages/ui     shadcn/ui components (base-ui primitives) + the design tokens
```

No database. No auth. The only persisted state is your roots, per-project overrides (pin, note, hide, last-opened), and the open commands — all in a single JSON file at `$XDG_CONFIG_HOME/workspace-welcome/store.json` (so `~/.config/workspace-welcome/store.json` on most Linux). Written atomically. Never leaves your machine.

Reports and the IDE add two more disk locations: generated report HTML under `$XDG_CACHE_HOME/workspace-welcome/reports/`, served by a server route at `/reports/<key>`, and the code-server install under `$XDG_DATA_HOME/workspace-welcome/ide/`. The file router resolves every path server-side and rejects anything outside the project root. The IDE runs as a managed child process — `--auth none`, bound to all interfaces so other machines on the LAN can reach it, killed with the app.

### The scan, and why it isn't slow

Scanning 180-ish projects (most of them git repos) naively means ~700 `git` subprocess calls on every page load. The first version did exactly that and took ~6 seconds.

`packages/api/src/lib/scan-cache.ts` fixes it. The scan result is cached in memory; on each subsequent call, each project is checked against a cheap fingerprint (the project directory's mtime, plus `.git/HEAD` and `.git/index` mtimes, plus one `git status --porcelain` hash for repos to catch deep edits that don't bump any directory mtime). Only projects whose fingerprint changed get re-scanned; the rest reuse their cached entry. Pin, note, hide, and last-opened changes never invalidate the cache — those are overrides, re-merged onto the cached projects.

On a workspace of 187 projects / 138 git repos:

- First load (cold): ~6.5s — the actual filesystem + git work.
- Subsequent loads (warm): ~0.7s.
- After a pin/note change: ~0.7s (no rescan).
- The Refresh button re-probes every fingerprint and re-scans anything that moved; `{ force: true }` on the `scan` procedure forces a full rescan.

### Stack and remote detection

`detect.ts` matches the first present manifest in a fixed priority order (Deno before Node, since a Deno project may also ship a `package.json`). `parseRemote` handles both `git@host:owner/repo.git` and `https://host/owner/repo(.git)`, classifies the host, and builds the right deep links per host's URL conventions (`/pulls` on GitHub, `/merge_requests` on GitLab, `/pull-requests` on Bitbucket, `/patches` + `/todo` on sourcehut).

## Tech

Scaffolded with [Better-T-Stack](https://github.com/AmanVarshney01/create-better-t-stack) — TanStack Start (frontend + server), tRPC, Tailwind v4, shadcn/ui. No auth, no ORM, no database.

## Status

It does what I need it to do. The alert thresholds are opinionated — 3 weeks for "stale WIP", 90 days for "dormant" — and easy to change in `packages/api/src/lib/scan.ts` if yours differ.
