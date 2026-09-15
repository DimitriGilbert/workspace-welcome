# Docs / marketing-site accuracy pass — discrepancy inventory

Branch `forge-sqlite`, HEAD `61c53db`, 2026-09-14. Explorer pass over
`apps/docs`, the root `README.md`, and every other readme, checked against
the product as it actually is on this branch (verified in `apps/web/src`,
`packages/api/src`, `packages/db/src`, `docs/adr/`, `CONTEXT.md`,
`AGENTS.md` — not trusted from memory).

The site copy was last touched 2026-09-03 (commit `26d36be`); the
sqlite persistence wave (ADR-0006) and the forge layer (ADR-0007) both
landed 2026-09-14. Every "no database" claim predates the DB; every page
predates forge, the widget-system themes, ideation, and artifacts.

## Product truth this pass verified (the bar the copy must meet)

- **Persistence** — `@workspace-welcome/db`: embedded sqlite over
  `@libsql/client`, WAL file at `$XDG_DATA_HOME/workspace-welcome/workspace-welcome.db`,
  drizzle schema, embedded TS migrations. `store.ts` / `project-config.ts`
  kept their facades and are DB-backed; first boot imports the legacy
  JSON (`store.json`, per-project configs) once, losslessly — those files
  are never written again and stay as untouched backups (ADR-0006).
- **Forge layer** — gh-CLI adapter (GitHub today; Gitea/GitLab reserved
  kinds, `cli | api` adapter contract). Sync is explicit-only (Sync
  buttons; nothing auto-syncs), server-guarded (5-min min-interval,
  in-flight dedupe, one-at-a-time queue, cached availability probe,
  50-per-list page cap rendering "50+", never false zeros). Snapshots
  cached in sqlite; reads are DB-only (ADR-0007).
- **Surfaces** — dashboard `/` is a themed widget board, three presets
  (bento, meadow, mission-control), each with a light and a dark scheme
  (Graphite/Paper, Daylight/Nightfall, Console/Daylight), theme picker,
  saved prefs, `?preset=`/`?scheme=` deep links, digit-switchable console
  views. All three carry the **forge feed** widget ("My issues & pull
  requests" — the account's open items across every GitHub repo,
  workspace or not). Mission-control adds the **fleet ledger** (a
  DataTable; degrades by shedding columns, never a register form), the
  **triage board** (error/warn rows plus feed PRs untouched 30+ days as
  warn rows), vitals, and report digests; bento adds the workspace pulse
  (tabbed snitch-report band: Activity / Health / Code / AI usage) and
  the project mosaic; meadow adds the workspace digests (report /
  momentum / rhythm / stacks / directories) and its own mosaic.
- **Project page** `/project/<path>` — themed boards with identity,
  note, git state, commit history, and the tabbed surface
  **files / artifacts / ideation**, plus the **project forge board**
  (Issues & PRs: repo snapshot, feed fallback with honest framing,
  PR review-decision badges, label filters, "50+" law).
- **Project lists** — forge chips (open issue/PR counts) beside the git
  chips; repo-snapshot counts or feed-attributed counts (tooltip says
  whose), never fabricated zeros.
- **Settings** — Workspace (roots add/remove + per-root report, hidden
  restore, shared code-server status/stop), Open commands (editor;
  terminal auto-detect: konsole, gnome-terminal, xfce4-terminal,
  mate-terminal, kitty, alacritty, wezterm, foot, tilix, xterm), gitsnitch
  path, Exclude globs, Ideation models, **Forge register** (mapped
  project↔repo links with cached counts, per-row Sync, Sync all, Force
  sync all).
- **Ports / install / deploy** — web dev 37420, docs dev 8005; GitHub
  release tarballs `workspace-welcome-<version>-<os>[-musl]-<arch>.tar.gz`
  + `SHA256SUMS.txt`; `install.sh` flags `--version --mirror --port
  --no-service --uninstall --purge --yes --dry-run`; systemd user unit
  (`--uninstall` keeps config/cache/data, `--purge --yes` wipes all
  three); `deploy:docs` = build → prepare (CNAME + `.nojekyll` + copies
  `scripts/install.sh` in as `/install.sh`) → `gh-pages --dotfiles -f -d
  dist/client` as a single fresh commit.

## 1. apps/docs — page-by-page

### `src/routes/index.tsx` (home)

| # | Claim | Reality | Fix |
|---|-------|---------|-----|
| H1 | "No accounts, no database, no cloud." | Embedded sqlite since ADR-0006 — "no database" is false. | Reworded (kept "no accounts, no cloud" honesty). |
| H2 | "What you get" lists three bullets; none mention forge, themes, ideation, or artifacts. | Forge feed/chips/boards and the three themes are the headline features of this branch; project page also has artifacts + ideation tabs. | Added forge + themes bullets; project-page bullet extended. |
| H3 | Hero image `dashboard.png` (also the OG/twitter image via `seo.ts`) shows the retired card-grid dashboard: "Needs attention" panel + project cards, no forge chips, no feed widget, no theme picker. | Current dashboard is a themed widget board (bento/meadow/mission-control) with forge chips, the "My issues & pull requests" feed, and a theme picker. | `STALE-SHOT` placeholder comment inserted (vision agent recaptures); alt text reworded to not pin card-era vocabulary. |

### `src/routes/features.tsx`

| # | Claim | Reality | Fix |
|---|-------|---------|-----|
| F1 | No forge section at all. | The flagship: cross-repo feed widget, project-list chips, project Issues & PRs boards (snapshot > feed fallback, review-decision badges, label filters), Settings → Forge register, explicit guarded syncs, GitHub-via-gh today, "50+" honesty. | New "Forge" section (copy only, existing section renderer). |
| F2 | No themes section. | Three dashboard/project themes, each light + dark, picker + saved prefs + deep links; mission-control fleet ledger + triage, bento workspace pulse, meadow digests. | New "Boards, not a page" themes section. |
| F3 | "Project workspace" bullets stop at git actions / quick-open. | Project surface is tabbed files / artifacts / ideation, and every theme carries the project forge board. | Bullets extended; artifacts + ideation described. |
| F4 | "Dashboard & health" bullet "Pinned section, recency heat over about 90 days, Recent vs Older" is card-era vocabulary (there is no separate pinned section / Recent-vs-Older split on the widget boards). | Pins survive (pin glyph in the ledger, pinned tiles, Pinned vitals count) and recency heat survives (~90-day fade); the *section* framing does not. | Bullet reworded to pins + recency heat. |
| F5 | Reports section says reports "open in a new tab" only. | True, but the boards also embed the report digests (workspace pulse / meadow report / mc report widgets: Activity / Health / Code / AI usage over one export, with MISSING/RUNNING/STALE/FRESH states). | One sentence added. |
| F6 | "Filter with / across name, path, stack, branch, remote, note" — verified still true (shared header filter + bento chrome + meadow header; `lib/search.ts` fields). | Accurate. | Kept. |

### `src/routes/docs/getting-started.tsx`

| # | Claim | Reality | Fix |
|---|-------|---------|-----|
| G1 | "Where state lives": "Config / roots / pins / notes: `$XDG_CONFIG_HOME/workspace-welcome/store.json`". | State is the sqlite DB at `$XDG_DATA_HOME/workspace-welcome/workspace-welcome.db`; `store.json` is a one-time-import backup that is never written again. Forge snapshots + feed ride the same DB. | Row corrected; legacy-backup note added; forge-cache row added. |
| G2 | "For the nerds": "No auth, no ORM, no database." + package list omits `packages/db` (and `packages/env`). | Drizzle ORM over embedded sqlite in a dedicated `@workspace-welcome/db` package; monorepo has db + env + config packages. | Corrected; forge + db named. |
| G3 | Uninstall copy "Your config, the report cache, and the code-server install survive" — verified against `install.sh` (`--uninstall` keeps config/cache/data; `--purge --yes` removes all three, data "incl. the IDE server install"). | Accurate (config now = the DB under XDG data + legacy backups). | Kept; purge wording mentions data explicitly. |

### `src/routes/docs/concepts.tsx`

| # | Claim | Reality | Fix |
|---|-------|---------|-----|
| C1 | Root: "Stored in the local JSON store; edit in Settings." | sqlite store (`packages/db`), per CONTEXT.md. | Corrected. |
| C2 | Glossary has six terms; misses the vocabulary CONTEXT.md (the canonical glossary) now carries: Forge, Forge adapter, Forge sync, Forge snapshot, Forge chips, the feed, Artifact folders, Ideation, theme presets. | A reader of "docs" cannot find the words the app now uses. | Added Forge, Forge sync, Forge chips, Feed, Artifact folders, Ideation, Theme preset entries aligned with CONTEXT.md. |

### `src/routes/docs/settings.tsx`

| # | Claim | Reality | Fix |
|---|-------|---------|-----|
| S1 | "In Settings" omits the Forge register (mapped repos, per-repo Sync, Sync all / Force sync all), Exclude globs, and Ideation models. | All three exist on `/settings`. | Added; snitch/IDE/terminal wording checked against the widgets (Open commands, gitsnitch, Workspace). |
| S2 | "On disk": "Roots, pins, notes, hide, open commands → `store.json`" + "Store writes are atomic." | sqlite DB (transactional writes, WAL); legacy JSON is an import-only backup. | Row corrected to the DB path; atomicity wording corrected; legacy backup noted. |
| S3 | Trust boundary says nothing about outbound calls. | Forge sync is the one feature that talks off-box: explicit-only, through your own `gh` CLI, reads only. | Honest sentence added. |

### `src/routes/404.tsx`, `__root.tsx`, `seo.ts`, header/footer components

No stale claims. Root SEO description ("No accounts, no cloud") is still
true. Sitemap/robots/CNAME all list the five real routes. The docs site
itself renders dark-only (`className="dark"` on `<html>`) — that is a
site design fact, not a discrepancy.

## 2. README.md (root) — stale claims + structural problems

Stale claims:

| # | Claim | Reality |
|---|-------|---------|
| R1 | "No accounts, no database, no cloud." (intro) | sqlite since ADR-0006. |
| R2 | "How it works": "No database. No auth. The only persisted state is … a single JSON file at `$XDG_CONFIG_HOME/workspace-welcome/store.json` … Written atomically." | All persisted state (roots, overrides, settings, artifact-folder configs, forge snapshots, feed) is the embedded sqlite DB via `@workspace-welcome/db`; the JSON file is a one-time-import backup. |
| R3 | Monorepo listing shows 2 apps + 2 packages; omits `packages/db` and `packages/env` (and `packages/config`). | Six packages + two apps. |
| R4 | "Tech: … No auth, no ORM, no database." | Drizzle + libsql sqlite shipped. |
| R5 | Feature prose has no forge layer (feed, chips, boards, register), no themes (bento/meadow/mission-control), no ideation, no artifacts, no exclude globs, no fleet ledger / triage. | All shipped on this branch. |
| R6 | Reports: "The CLI path is configurable in Settings — local `~/workspace/gitsnitch` build by default, `npx` as fallback." | Resolution order is Settings-configured path → local build → npx (ADR-0001; `lib/snitch.ts`). |

Structural problems (the owner's "outdated wall of text" verdict):

- ~135 lines of dense first-person prose; the install one-liner — the
  thing most readers want — is buried at line 54 behind "Why" and a
  feature essay.
- No screenshots at all.
- No feature map: a reader cannot scan what exists; features and
  implementation war stories (scan-cache numbers, parseRemote details)
  are interleaved.
- "Status" closer is a shrug; no pointers to the docs site, ADRs,
  CONTEXT.md, or the architecture map that now exist.

## 3. Other readmes

- `.plans/attic/README.md` — describes its own quarantine accurately
  (checked: contents match). No fix.
- `packages/*` and `apps/*` ship **no readmes** — `AGENTS.md` is the
  instruction surface for the monorepo and is current. Nothing stale to
  fix; noted so nobody hunts for readmes that do not exist.

## 4. Screenshot / image assets — shot list for the vision agent

| File | Shows | Reality on this branch | Action |
|------|-------|------------------------|--------|
| `apps/docs/public/dashboard.png` (1440×728) | The retired card-grid dashboard: "Needs attention" panel, project cards, git/dirty chips, no forge chips, no feed widget, no theme picker. | Dashboard `/` is a themed widget board — bento / meadow / mission-control, each light+dark, with forge chips on project surfaces, the "My issues & pull requests" feed widget, a theme picker, and (mission-control) the fleet ledger + triage board. | **Recapture.** One shot per theme is ideal (min. one mission-control board at default dark with forge chips + feed visible). Same file path must be reused — it is also the OG/Twitter card image (`seo.ts` `OG_IMAGE_PATH`). |
| `apps/docs/public/*` (robots, sitemap, CNAME) | Text metadata | Accurate | None. |
| repo-root `dash-3440-{activity,health,code,ai}.png` | Zoomed crops of the current **Workspace Pulse** widget's four tabs (the bento snitch-report band) at 3440px. | Untracked, gitignored owner reference strays (2026-09-08) — NOT site assets. | None (do not deploy); useful as current-era reference frames for the recapture. |

Recapture notes: keep 1440-wide-ish landscape, PNG, same filename
(`dashboard.png`); the home hero `<figure>` and every OG/Twitter card
pull that one file. Inserted in-context markers:
`STALE-SHOT` comments sit next to each stale `<img>` in the source.

## 5. Docs build/deploy pipeline copy

- `pnpm run deploy:docs` chain verified against
  `scripts/prepare-docs-deploy.js` + `scripts/deploy-docs-gh-pages.js`:
  build → write `CNAME`/`.nojekyll` + copy `scripts/install.sh` → refuse
  to spawn unless the prepared markers exist → `pnpm gh-pages
  --dotfiles -f -d apps/docs/dist/client -m "deploy: …"` (single fresh
  commit). The old README wording matched; the rewritten README keeps an
  accurate, shorter version. No stale copy in the pipeline itself.
- The site's served `/install.sh` is a mirror of `scripts/install.sh`
  (single source of truth) — installer claims on
  `docs/getting-started` were re-verified flag-by-flag against the
  script (`--version`, `--mirror`, `--port`, `--no-service`,
  `--uninstall`, `--purge --yes`, `--dry-run`; darwin + musl asset
  naming).

## Headline count

30 findings: 15 stale/incomplete claims on the docs site, 6 stale claims
in the root README, 3 README structural problems, 1 stale hero/OG image
(recapture), 1 accurate-but-buried deploy copy note, plus verified-true
items kept (filter fields, uninstall semantics, ports, sitemap, attic
readme, absent package readmes). Fixed in this pass: every text item
above; the image is the vision agent's.
