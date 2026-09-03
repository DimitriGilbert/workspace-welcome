# Research: How similar tools install and distribute themselves (release script + install.sh + docs)

Date: 2026-09-03. Question: for workspace-welcome's plan (release script → GitHub
Releases tarball; docs-hosted `install.sh` that also installs a systemd **user**
service; rewritten install docs) — what do flagship installers, Node-server
projects, and release conventions actually do, and what should we copy?

All claims below were checked against primary sources on 2026-09-03: the actual
installer scripts (fetched raw), the actual GitHub release assets (GitHub
Releases API), official unit files, and official docs. File:line facts are from
the script sources as served that day.

## TL;DR

**The plan matches the dominant pattern; keep it, with these concrete choices.**

1. **Ship ONE platform-independent tarball containing a pruned production
   `node_modules`** — not a bundled Node runtime, not a single-binary compile.
   Precedent: code-server's standalone tarballs "bundle Node and node modules"
   ([coder docs][cs-install]); Ghost ships a source-only `.tgz` and lets the CLI
   bring Node ([Ghost release assets][ghost-rel]); Uptime Kuma ships no
   installable artifact at all (git clone + pm2, [wiki][uk-wiki]). workspace-welcome
   has **no native dependencies** (checked every `package.json` in the repo — no
   `better-sqlite3`/`sharp`/etc.), so a single `.tar.gz` fits all hosts; the only
   requirement is preinstalled Node 22+, enforced by the installer (the
   code-server/Ghost pattern of a hard version gate — [code-server npm docs][cs-npm],
   [Ghost-CLI node check][ghost-node]). `pnpm --filter web deploy --prod` produces
   exactly this portable layout: a deploy is "a portable package that can be
   copied to a server and executed without additional steps" with an isolated,
   production-pruned `node_modules` ([pnpm deploy docs][pnpm-deploy]).
2. **Single-binary is a no for now**: Node SEA is stability 1.1 "active
   development" with an experimental warning and requires bundling everything
   into one file ([Node SEA docs][node-sea]); `bun build --compile` would swap the
   runtime to Bun and admits its binary is "still way too big"
   ([bun docs][bun-compile]); `pkg` is archived/unmaintained ([vercel/pkg][pkg]).
3. **Install to a per-user dir (`~/.local/share/workspace-welcome`), never
   `/usr/local`, never sudo** — the code-server standalone installer defaults to
   `~/.local` ([code-server install.sh][cs-installsrc]); Rust/Deno/Bun/uv all
   install under `$HOME` (`.rustup`/`.deno`/`.bun`/`.local/bin`). A user-unit
   daemon needs no root and no PATH entry.
4. **Resolve "latest" via the `releases/latest/download/<asset>` redirect or the
   `releases/latest` HTTP redirect — not the GitHub API** — this is what
   Filebrowser ("Avoid GitHub API dependency/rate-limit failures by downloading
   from the latest-release redirect", [get.sh][fb-get]), Bun ([install.sh][bun-sh]),
   Beszel ([install-agent.sh][bz-agent]), and code-server (`%{url_effective}`
   trick, [install.sh][cs-installsrc]) all do; verified live that the redirect
   serves the asset.
5. **Verify checksums with a versioned `SHA256SUMS.txt`** uploaded next to the
   tarball — the Beszel agent downloads `beszel_<version>_checksums.txt` and
   aborts on mismatch ([install-agent.sh][bz-agent]); Filebrowser, Beszel, and
   Caddy all publish a `<name>_<version>_checksums.txt` in every release
   (Releases API, queried 2026-09-03). Simplest robust variant: the installer
   downloads `SHA256SUMS.txt` from the same release and `grep`s its line.
6. **Wrap everything in a `main()` function** so a truncated `curl | sh` can't
   execute half a script ([Ollama install.sh][ol-sh]); expose `--version`,
   `--uninstall`, `--dry-run`, and env-var overrides ([netdata usage][nd-sh],
   [code-server][cs-installsrc], [Beszel][bz-hub]); be idempotent — re-running
   the installer **is** the upgrade story (Beszel stops the existing service and
   reinstalls in place, backs up the old binary as `.bak` [bz-agent]; Gitea's
   upgrade doc is literally "replace the binary, `systemctl restart`"
   [gitea docs][gitea-binary]).
7. **systemd user unit**: copy the syncthing/code-server user-unit shape —
   `WantedBy=default.target`, `Restart=on-failure` (syncthing) / `Restart=always`
   (code-server), light hardening that works in a user session
   ([syncthing user unit][syn-user], [code-server-user.service][cs-unit]).
8. **Docs page**: one-liner first, a "what the script does / `--dry-run`"
   transparency block, requirements, manual-download alternative, service
   management, upgrade/uninstall — the code-server + uv layout
   ([code-server install][cs-install], [uv installation][uv-docs]). Ollama's
   bare `curl | sh` with zero explanation is the anti-pattern
   ([ollama.com/download][ol-dl]).

---

## 1. Installer scripts of flagship tools (source-level survey)

All facts read from the script sources listed in the first column.

| Script | OS/arch detection | Install location | Version resolution | Checksums | Sudo | Flags / env | Notes |
|---|---|---|---|---|---|---|---|
| [rustup-init.sh][rustup-sh] | `uname -s -m` + bitness probing via `head`/`tail` of `uname -m` output; `get_architecture()` | none (delegates to downloaded `rustup-init` binary) | static.rust-lang.org `dist/` layout | verification happens inside the signed `rustup-init` binary; Rust publishes GPG `.asc` for every artifact ([forge docs][rust-forge]) | never | `-y`, `--no-modify-path`, `--profile`, `--default-toolchain`, `RUSTUP_HOME`/`CARGO_HOME` | Tiny bootstrap → real installer; POSIX-sh compatible incl. ksh/zsh quirks |
| [deno install.sh][deno-sh] | `uname -sm` case table, `OS=Windows_NT` special-case | `$DENO_INSTALL:-$HOME/.deno/bin` | positional arg, else `dl.deno.land/release-latest.txt`; stable builds then fetched **from GitHub Releases** | none (deliberately; header: "Keep this script simple and easily auditable") | never | `-y`, `--no-modify-path`, `-h`, positional version | PATH setup delegated to an interactive bundled subcommand; prints final path + "Run 'deno --help'" |
| [bun install.sh][bun-sh] | `uname -ms` case table + `/etc/alpine-release` → musl + Rosetta check + AVX2 → `-baseline` | `$BUN_INSTALL:-$HOME/.bun/bin` | positional tag, else **`releases/latest/download/` redirect** | none | never | positional version + `debug-info` variant | Per-shell rc-file PATH patching (zsh/bash/fish, XDG_CONFIG_HOME aware); colored success message with next steps |
| [uv install.sh][uv-sh] | `uname -sm` case table; glibc/musl distinction | `$HOME/.local/bin` (pre-0.5: `~/.cargo/bin`); `UV_UNMANAGED_INSTALL` for custom | **pinned inside the script** (generated per release by cargo-dist), overridable via `INSTALLER_DOWNLOAD_URL` | **per-artifact SHA256 embedded in the script itself** and verified after download | never | `UV_NO_MODIFY_PATH`, `--help`, unmanaged-install mode | The gold standard for checksum-verified installers; multiple fallback download hosts (releases.astral.sh then GitHub); docs tell users the script "can be inspected first" ([uv docs][uv-docs]) |
| [ollama install.sh][ol-sh] | `uname -s`/`uname -m` + kernel string for WSL1/WSL2 + GPU probing (nvidia/amd/rocm, JetPack) | `/usr/local/bin` symlink + libs under `/usr/local/lib/ollama` | `OLLAMA_VERSION` env → `?version=` param on ollama.com | none | `SUDO=""` if root, else requires sudo | `OLLAMA_VERSION`, `remove`/uninstall path, `OLLAMA_USE_MODELS`-style env | Creates a **system user** `ollama`, writes a **system** unit, `systemctl enable`; whole script wrapped in `main()` "so that a truncated partial download doesn't end up executing half a script" |
| [Homebrew install.sh][brew-sh] | `uname` Darwin/Linux; macOS version floor/ceiling constants | `/opt/homebrew` (ARM mac) / `/home/linuxbrew/.linuxbrew` (Linux) — never user dir | git clone of the tap at HEAD | none | `have_sudo_access()` with `NONINTERACTIVE` handling | `NONINTERACTIVE=1`, `CI=1`, `INTERACTIVE` | The canonical "apt-repo-style" installer; disables its own analytics for the run |
| [netdata kickstart.sh][nd-sh] | distro detection via `/etc/os-release`, package-manager probing | native distro packages (preferred), static build, or source build | `--install-version`, release channel `nightly`/`stable` | distro packages → GPG/apt signing; docs publish an md5 of the script itself ([netdata linux docs][nd-linux]) | escalates via sudo/doas/pkexec or `ROOTCMD` | huge surface: `--non-interactive`, `--dry-run`, `--dont-start-it`, `--uninstall`, `--reinstall*`, `--auto-update-type`, `--disable-telemetry`, `--offline-install-source` | Detects and **updates existing installs** instead of reinstalling; full `usage()` block in-header is the docs |
| [pnpm install.sh][pnpm-sh] | shell-based, no arch needed (npm tarball) | `$PNPM_HOME:-~/.pnpm` (docs: "install to PNPM_HOME, defaulting to ~/.pnpm") | `PNPM_VERSION` env (version, major, or dist-tag) resolved via npm registry packument | **verifies npm registry signature (openssl) + integrity (sha512) of the tarball** | never | `PNPM_VERSION`, `PNPM_HOME` | The only surveyed installer doing signature verification of the artifact itself |
| [filebrowser get.sh][fb-get] | `uname -m` glob table + `uname` OS table | `/usr/local/bin`, fallback `/usr/bin`, Termux `$PREFIX/bin` | **`releases/latest/download/<asset>` redirect** — in-code comment: "Avoid GitHub API dependency/rate-limit failures by downloading from the latest-release redirect" | none | `sudo` only `if ((EUID))` (non-root), skipped on Termux | none | Single function w/ ERR trap; `setcap cap_net_bind_service` after install; verifies `type -p filebrowser` at end |
| [beszel install-agent.sh][bz-agent] / [install-hub.sh][bz-hub] | `uname -s` lowercased + arch detect; glibc vs musl via `ldd`; Alpine/OpenWrt/pfSense branches | hub: `/opt/beszel`, agent: `/opt/beszel-agent`; dedicated `beszel` system user | `-v/--version` flag, else `releases/latest/download/` | **agent verifies SHA256 against `beszel_<version>_checksums.txt`** fetched from the same release, aborts on mismatch; hub only does `tar -tzf` sanity check | assumes root for system install | `-p/--port`, `-k/--key`, `-u/--uninstall`, `-v/--version`, `-c/--mirror <url>`, `--auto-update`, `-h` | Writes systemd unit **with hardening** (below); optional `beszel update` self-update + systemd timer; "Existing installation detected. Stopping service for upgrade"; backup `.bak` of old binary; checks `systemctl is-active` before declaring success |
| [code-server install.sh][cs-installsrc] | `os()`/`arch()`; maps to deb/rpm/AUR/brew/npm/standalone paths | standalone: `$HOME/.local/lib/code-server-<ver>` + symlink `~/.local/bin/code-server` | `--version X.X.X`, else **`releases/latest` redirect URL via `curl -fsSLI -o /dev/null -w "%{url_effective}"`** | none in script (debs signed via apt repo instead) | only where needed (dpkg -i, /usr/local) | `--dry-run`, `--version`, `--edge`, `--prefix`, `--method`, ssh-remote mode; `~/.cache/code-server` download cache | Prints per-method post-install text incl. the systemd line; refuses to overwrite an existing same-version install |
| [node-red update-nodejs-and-nodered][nr-sh] | distro + Raspberry-Pi detection, `systemctl` presence | npm global + `/usr/bin/node-red` links | `--nodered-version`, latest otherwise | package-manager mediated | `sudo` throughout | `--node20/22/24` (forces Node major), `--nodered-user`, `--confirm-pi` | The "installer manages the Node runtime itself" example: apt-installs/patches Node.js before npm-installing Node-RED, then writes a systemd unit |

Patterns worth stealing, in rough priority order:

- **Bootstrap script stays small and auditable** (deno's stated design goal;
  rustup's tiny shell + real installer binary).
- **Latest-version without API calls**: `releases/latest/download/<asset>` and
  the `releases/latest` HTTP redirect (both verified working; see section 3).
- **Checksums either embedded in the generated installer** (uv/cargo-dist) **or
  a published per-release checksums file** (beszel/filebrowser/caddy). For a
  hand-rolled script, the checksums-file route is far less machinery.
- **`main()` wrapper + `set -eu`** against truncated pipes (ollama, bun).
- **Idempotent re-run = upgrade** (netdata "existing install handling",
  beszel "Stopping service for upgrade", code-server "already installed" check).
- **Print exactly what to do next** (URL/path) at the end — every good script
  ends with a short success block, and so does every good docs page.

## 2. What Node server apps actually ship (the crux)

### 2.1 Distribution matrix

| Project | Runtime | What a release contains | How it handles the Node requirement | Upgrade story |
|---|---|---|---|---|
| **Uptime Kuma** (v2.5.3) | Node | Release assets: only `dist.tar.gz` (7.3 MB, source/build output for its own updater) — **no installable tarball**. Official non-Docker install is `git clone` + `npm run setup` + `pm2 start server/server.js` ([wiki][uk-wiki]) | "Node.js >= 20.4" listed as a requirement; pm2 for backgrounding | `git pull` + setup re-run (self-documented); Docker is the primary path |
| **Ghost** (v6.62.0) | Node | Single platform-independent `ghost-6.62.0.tgz` (23 MB) — **source tree only, zero `node_modules`** (verified by downloading and listing the tgz; [release][ghost-rel]). Ghost-CLI resolves versions via the npm registry and runs the dependency install on the target ([Ghost-CLI version.js][ghost-ver], [install.js][ghost-inst]) | Ghost-CLI doctor **fails the install** if `process.versions.node` doesn't satisfy `engines.node` ([node-version.js][ghost-node]) | `ghost update` (CLI re-downloads release zip, migrates, restarts) |
| **code-server** (v4.135.0) | Node | **Self-contained per-platform tarballs** (`code-server-4.135.0-linux-amd64.tar.gz`, 235 MB) that "bundle Node and node modules" ([coder install docs][cs-install]), plus deb/rpm (nfpm-built, [build-packages.sh][cs-pkg]) and a package.tar.gz for npm | npm path hard-requires Node 24 ("code-server currently requires node v24", [npm-postinstall.sh][cs-npm-pi], [npm.md][cs-npm]); tarball path needs nothing but glibc ≥ 2.28 | `install.sh` re-run; deb/rpm via package manager |
| **Homebridge** | Node | **deb that bundles a Node runtime**: build.sh downloads `node-<ver>-linux-<arch>.tar.gz` at build time and ships it under `/opt/homebridge/bin/node` ([build.sh][hb-build], [start.sh][hb-start]) | none needed at runtime — the apt package owns Node ("installs the homebridge apt pkg versions of NodeJS…", [wiki][hb-wiki]) | `apt-get upgrade homebridge` |
| **Gitea** | Go | Single static binary per arch (`gitea-1.27.3-linux-amd64` naming), Sigstore + GPG signatures ([docs][gitea-binary]) | n/a | "replace the binary … `systemctl restart gitea`" ([docs][gitea-binary]) |
| **Caddy** | Go | `<name>_<ver>_<os>_<arch>.tar.gz` + `checksums.txt` + `.sig`/`.pem` + SBOMs per release (Releases API); systemd units shipped in the [caddyserver/dist][caddy-dist] repo | n/a | package manager or re-download |
| **Filebrowser** (v2.63.23) | Go | `<os>-<arch>-filebrowser.tar.gz` + `filebrowser_2.63.23_checksums.txt` (Releases API) | n/a | re-run [get.sh][fb-get] |
| **Beszel** (v0.18.8) | Go | `beszel_<ver>_<os>_<arch>.tar.gz` + `beszel_0.18.8_checksums.txt` + debs (Releases API) | n/a | re-run installer; built-in `beszel update` + optional daily systemd timer ([bz-hub]) |
| **Deno / Bun / uv / Rustup** | — | single binaries per triple | n/a (they *are* the runtime) | `deno upgrade`, `uv self update`, rustup self-managed |

Key takeaway for a **Node SSR app without Docker**: the field splits into (a)
"bring your own Node, ship source/pruned-deps" (Ghost, Uptime Kuma) and (b)
"ship the runtime, pay ~200 MB per artifact" (code-server, Homebridge). Nothing
mainstream compiles an SSR Node app to a single executable — SEA is
experimental ([node-sea]), `bun build --compile` exists but means switching
runtimes ([bun-compile]), and `pkg` is archived ([pkg]). Pruning to production
`node_modules` is the standard move — it is literally what pnpm's deploy command
exists for: "a portable package that can be copied to a server and executed
without additional steps", skipping devDependencies with `--prod`
([pnpm deploy][pnpm-deploy]); Next.js's equivalent `output: 'standalone'`
copies "only the necessary files for a production deployment including select
files in `node_modules`" via `@vercel/nft` tracing ([next docs][next-standalone]).

### 2.2 systemd units actually shipped

| Unit | Type | Restart | WantedBy | Notable lines | Source |
|---|---|---|---|---|---|
| syncthing **user** unit | simple | `on-failure` (RestartSec=1) | `default.target` | `StartLimitIntervalSec=60`/`Burst=4`; hardening: `SystemCallArchitectures=native`, `MemoryDenyWriteExecute=true`, `NoNewPrivileges=true` | [syncthing.service][syn-user] |
| code-server **user** template | `exec` | `always` | `default.target` | `ExecStart=/usr/bin/code-server` — a ready-made user-unit variant shipped next to the system template | [code-server-user.service][cs-unit] |
| code-server **system** template (`@%i`) | `exec` | `always` | `default.target` | `User=%i` — same file templated per user; docs say `sudo systemctl enable --now code-server@$USER` | [code-server@.service][cs-unit2], [cs docs][cs-install] |
| ollama (system) | simple | `always`, RestartSec=3 | `default.target` | `User=ollama` (dedicated system user created by the script), `Environment="PATH=..."` | embedded in [install.sh][ol-sh] |
| gitea (system) | simple | `always`, RestartSec=2s | `multi-user.target` | `User=git`, `WorkingDirectory=/var/lib/gitea`, `Environment=USER=git HOME=… GITEA_WORK_DIR=…`, commented `LimitNOFILE`, capability notes for <1024 ports | [gitea.service][gitea-unit] |
| beszel-agent (system) | simple | `on-failure`, RestartSec=5 | `multi-user.target` | `StateDirectory=beszel-agent`; hardening: `KeyringMode=private`, `LockPersonality=yes`, `ProtectClock=yes`, `ProtectHome=read-only`, `ProtectHostname=yes`, `ProtectKernelLogs=yes`, `ProtectSystem=strict`, `RemoveIPC=yes`, `RestrictSUIDSGID=true`; `Environment="PORT=…"` etc. | generated by [install-agent.sh][bz-agent] |
| beszel-hub (system) | simple | `always`, RestartSec=5 | `multi-user.target` | `WorkingDirectory=/opt/beszel`, `User=beszel`, `ExecStart=… serve --http "0.0.0.0:8090"` | generated by [install-hub.sh][bz-hub] |
| homebridge (system) | simple | `always`, RestartSec=3 | `multi-user.target` | `EnvironmentFile=-/etc/default/homebridge`, `WorkingDirectory=/var/lib/homebridge`, `ExecStartPre=-run-parts …/prestart.d`, `AmbientCapabilities=CAP_NET_BIND_SERVICE …` | [homebridge.service][hb-unit] |
| caddy (system) | simple/notify | `always` | `multi-user.target` | ships both `caddy.service` and `caddy-api.service` plus sysusers file | [caddyserver/dist][caddy-dist] |

Conventions: user units use `WantedBy=default.target` (syncthing, code-server);
system units use `multi-user.target`; nearly everything sets `Restart=always`
or `on-failure` with a small `RestartSec`; environment comes via `Environment=`
or `EnvironmentFile=`; a "start-limit" pair is common on the units that restart
aggressively. Sandboxing exists (beszel, syncthing) but is far from universal —
and the aggressive options (`ProtectSystem=strict`, `ProtectHome=read-only`)
conflict with a server whose state lives in `$HOME` XDG dirs unless you add
`ReadWritePaths=`, which nothing surveyed bothers to do for user units.

## 3. Release engineering on GitHub Releases

- **Assets**: a release can carry up to 1000 assets of < 2 GiB each; GitHub also
  auto-publishes source zip/tarball per tag ([about releases][gh-about]).
- **Asset naming**, observed across projects: `code-server-<ver>-<os>-<arch>.tar.gz`
  ([cs rel][cs-rel]); `beszel_<ver>_<os>_<arch>.tar.gz` and
  `<name>_<ver>_checksums.txt` ([beszel rel][bz-rel]);
  `<os>-<arch>-filebrowser.tar.gz` + `filebrowser_<ver>_checksums.txt`
  ([fb rel][fb-rel]); `caddy_<ver>_<os>_<arch>.tar.gz` + checksums + sigs +
  SBOMs ([caddy rel][caddy-rel]); and for runtime-agnostic Node apps a single
  `ghost-<ver>.tgz` ([ghost rel][ghost-rel]). Our single-tarball case is the
  Ghost/Uptime-Kuma shape: **`<name>-<version>.tar.gz`, no os/arch needed.**
- **Checksums**: a `<name>_<version>_checksums.txt`/`SHA256SUMS` file per
  release is the de-facto convention (Filebrowser, Beszel, Caddy all publish
  one; the Beszel agent's installer consumes exactly this format
  [bz-agent]). Rust publishes GPG `.asc` companions instead
  ([forge][rust-forge]); Gitea does Sigstore + GPG ([gitea docs][gitea-binary]).
- **Latest-release resolution without auth/rate limits**:
  - `https://github.com/<owner>/<repo>/releases/latest/download/<asset-name>` —
    a stable URL that 302s to the newest release's asset (used and documented
    in-file by Filebrowser's comment "Avoid GitHub API dependency/rate-limit
    failures" [fb-get], by Bun [bun-sh], by Beszel [bz-agent]); verified live
    during this research (302 → release-assets.githubusercontent.com, HTTP 200).
  - `.../releases/latest` itself 302s to `/tag/<version>` — code-server reads
    the effective URL to learn the version number
    (`curl -fsSLI -o /dev/null -w "%{url_effective}"`, [cs-installsrc]).
  - REST `GET /repos/{owner}/{repo}/releases/latest` returns "the most recent
    non-prerelease, non-draft release, sorted by created_at"; asset objects
    include `browser_download_url` and a `digest` field
    ([REST docs][gh-rest]). Requires no auth for public repos but shares the
    60 req/h unauthenticated rate limit.
- **`gh release create [<tag>] [<filename>...|<pattern>...]`** uploads assets as
  positional args (globs allowed); `--generate-notes` auto-writes notes,
  `--latest` marks the release Latest, `-d/--draft`, `-p/--prerelease`,
  `--notes-start-tag` for changelog bounds ([gh manual][gh-create]).
  `--latest` matters: it aligns the release page badge with what
  `releases/latest` serves.
- **Automations** (conventional, not required): **release-please** maintains a
  Release PR from Conventional Commits (`fix:` → patch, `feat:` → minor,
  `feat!:` → major) and creates the tag+release when it merges
  ([release-please-action][relplease]); **changesets** is the pnpm-monorepo
  common alternative — "versioning and changelogs with a focus on monorepos"
  ([changesets][changesets]). Both produce the same end state our hand-rolled
  script does; adopting one later is mechanical.

## 4. How best-in-class tools present their install docs

| Docs page | Structure |
|---|---|
| [code-server install][cs-install] | exact one-liner; `--dry-run` offered as a preview ("see exactly what this script will do"); per-OS outcome table (deb/rpm/AUR/brew/standalone/npm); requirements incl. glibc floor; standalone fallback to `~/.local`; systemd enable command + where the password/config lives |
| [uv installation][uv-docs] | one-liner + wget + **version-pinned installer URLs**; "the script can be inspected first" note; install location stated (`~/.local/bin`); PATH-modification warning; shell-completion section; `uv self update` upgrade; explicit uninstall (`rm ~/.local/bin/uv …`) |
| [deno install docs][deno-docs] | one-liner; install path (`$HOME/.deno/bin`) + `DENO_INSTALL` override; "if command not found, open a fresh terminal"; `deno upgrade` / `--version`; uninstall = `deno clean` + remove dir + rc line |
| [Gitea from binary][gitea-binary] | wget with exact versioned URL; **signature verification before anything else**; recommended directory layout (`/var/lib/gitea/{custom,data,log}`, `/etc/gitea`, `/usr/local/bin`); systemd unit linked; upgrade = swap binary + restart |
| [rustup.rs][rustup] | one sentence + one-liner + Windows `.exe` fallbacks; "display all supported installers" for everything else; nothing else — extreme minimalism |
| [Ollama download][ol-dl] | bare `curl … install.sh | sh` with "paste this in terminal" and **no explanation at all** of what the script does (creates users, writes units, installs GPU drivers) — the transparency anti-pattern |
| [netdata linux install][nd-linux] | copy-paste command (also generated in Cloud); explicit behavior bullets (detects existing install, prefers native packages, installs auto-update cron); verification steps ("confirm the Agent service is running"); `--non-interactive` note for CI |

Conventions worth copying for a small OSS project: (1) the one-liner is always
the first code block on the page; (2) somewhere near it, in one short list,
"what this script does" — code-server's `--dry-run` and uv's "inspect first"
are the two accepted ways to buy trust; (3) requirements stated as a short
checkable list (Node ≥ 22, systemd user session); (4) a manual-download
alternative with exact URLs for people who won't pipe curl to sh; (5) service
management + upgrade + uninstall as their own headings; (6) a final "open the
URL" step.

## Decisions for workspace-welcome

**Tarball** (built by `scripts/release.sh`, uploaded with `gh release create`):

```
workspace-welcome-<version>.tar.gz        # single, platform-independent
├── serve-prod.mjs                        # existing wrapper, unchanged
├── package.json                          # app manifest for module resolution
├── dist/
│   ├── client/…                          # static assets
│   └── server/server.js                  # fetch-handler entry
├── node_modules/…                        # pruned production deps (pnpm deploy)
└── VERSION                               # "1.2.3" — installer sanity check
+ SHA256SUMS.txt                          # separate asset, same release
```

- Build order: `pnpm build` (all workspaces) → `pnpm --filter web deploy --prod
  dist-pkg` (needs `inject-workspace-packages: true` in `pnpm-workspace.yaml`,
  or `--legacy`; deploy also produces a dedicated lockfile so the folder is
  portable, [pnpm deploy][pnpm-deploy]) → copy `apps/web/{serve-prod.mjs,dist}`
  into `dist-pkg` → tar + sha256 → `gh release create "v$VER"
  dist/workspace-welcome-<ver>.tar.gz dist/SHA256SUMS.txt --generate-notes --latest`.
- No native deps exist in any workspace package (verified 2026-09-03), so one
  tarball serves every OS/arch; do **not** bundle a Node runtime (250 MB tax for
  zero benefit at our scale) and do **not** compile (SEA experimental; bun = runtime
  switch; pkg archived).
- The one runtime requirement — Node ≥ 22 — is checked by the installer with a
  hard, actionable error (code-server/ghost pattern).

**install.sh** (served at `https://welcome-workspace.dbuild.dev/install.sh`,
mirrored in-repo at `scripts/install.sh`):

1. `#!/bin/sh`, `set -eu`, everything inside `main "$@"` (ollama truncated-download
   guard), `--help` prints the flag list.
2. Flags: `--version vX.Y.Z` (pinned install), `--uninstall` (`--purge` to also
   remove config/data), `--no-service`, `--dir <path>`, `--dry-run`.
   Env equivalents: `WW_VERSION`, `WW_INSTALL_DIR`, `WW_PORT`, `WW_HOST`.
3. Requirements check: `curl` or `wget`, `tar`, `sha256sum`/`shasum -a 256`
   (beszel's dual-detection), and `node -p process.versions.node` ≥ 22 —
   else exit with "install Node 22+ (https://nodejs.org)".
4. Version resolution: `WW_VERSION` or read the `releases/latest` redirect with
   `curl -fsSLI -o /dev/null -w '%{url_effective}'` (code-server trick); then
   download `workspace-welcome-<ver>.tar.gz` + `SHA256SUMS.txt` from
   `releases/download/<tag>/` and verify the archive's sha256 line — abort on
   mismatch (beszel pattern).
5. Install: extract via `mktemp -d` staging into
   `${XDG_DATA_HOME:-$HOME/.local/share}/workspace-welcome`; if a previous
   install exists, stop the service first and keep `serve-prod.mjs.bak`
   (beszel upgrade flow); never touch `$XDG_CONFIG_HOME/workspace-welcome/`
   (user state survives upgrades).
6. Config: if `apps/web/.env`-equivalent (`.env` beside `serve-prod.mjs`) is
   absent, write one with `PORT=37420`, `HOST=127.0.0.1`; never overwrite.
7. Service: write `~/.config/systemd/user/workspace-welcome.service`:

   ```ini
   [Unit]
   Description=workspace-welcome dashboard
   After=network-online.target

   [Service]
   Type=simple
   WorkingDirectory=%h/.local/share/workspace-welcome
   # node path resolved to an absolute path at install time (e.g. /usr/bin/node)
   ExecStart=/usr/bin/node serve-prod.mjs
   Environment=PORT=37420
   Environment=HOST=127.0.0.1
   Restart=on-failure
   RestartSec=5
   StartLimitIntervalSec=60
   StartLimitBurst=4
   NoNewPrivileges=true
   PrivateTmp=true

   [Install]
   WantedBy=default.target
   ```

   (`node` resolved by absolute path at install time; `NoNewPrivileges`/`PrivateTmp`
   are the safe subset of the syncthing/beszel hardening that works in a user
   session without `ReadWritePaths=` gymnastics.) Then
   `systemctl --user daemon-reload && systemctl --user enable --now
   workspace-welcome.service`, verify with `systemctl --user is-active` +
   a `curl` to the port (beszel's wait-and-check), and print: URL, the four
   `systemctl --user` management commands, `journalctl --user -u
   workspace-welcome -f` for logs, the re-run-to-upgrade line, and a note that
   headless machines need `sudo loginctl enable-linger $USER` for the user
   service to survive logout.
8. `--uninstall`: stop/disable/remove the unit, `daemon-reload`, delete the
   install dir; keep config/data unless `--purge`.

**Docs page** (`apps/docs`, Install section) — outline copied from code-server/uv:
one-liner → "what the script does" (6 bullets + `--dry-run` tip + link to the
script source) → requirements (Node ≥ 22, Linux + systemd user session; macOS =
run without service) → manual install (exact tarball + SHA256SUMS URLs, extract,
`node serve-prod.mjs`) → managing the service → upgrading (re-run the installer;
pin with `--version`) → uninstall → troubleshooting (port busy, service not
running after logout/linger, `journalctl --user`).

**Release cadence/tooling**: hand-rolled `scripts/release.sh` with
`gh release create --generate-notes --latest` now; release-please/changesets
remain the conventional upgrade path if releases become frequent — both produce
the same tag+release+notes our script would.

[rustup-sh]: https://raw.githubusercontent.com/rust-lang/rustup/master/rustup-init.sh
[rust-forge]: https://forge.rust-lang.org/infra/other-installation-methods.html
[rustup]: https://rustup.rs
[deno-sh]: https://raw.githubusercontent.com/denoland/deno_install/master/install.sh
[deno-docs]: https://docs.deno.com/runtime/getting_started/installation/
[bun-sh]: https://bun.sh/install
[bun-compile]: https://bun.com/docs/bundler/executables
[uv-sh]: https://astral.sh/uv/install.sh
[uv-docs]: https://docs.astral.sh/uv/getting-started/installation/
[ol-sh]: https://ollama.com/install.sh
[ol-dl]: https://ollama.com/download
[brew-sh]: https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh
[nd-sh]: https://raw.githubusercontent.com/netdata/netdata/master/packaging/installer/kickstart.sh
[nd-linux]: https://learn.netdata.cloud/docs/netdata-agent/installation/linux
[pnpm-sh]: https://get.pnpm.io/install.sh
[fb-get]: https://raw.githubusercontent.com/filebrowser/get/master/get.sh
[bz-agent]: https://raw.githubusercontent.com/henrygd/beszel/main/supplemental/scripts/install-agent.sh
[bz-hub]: https://raw.githubusercontent.com/henrygd/beszel/main/supplemental/scripts/install-hub.sh
[cs-installsrc]: https://raw.githubusercontent.com/coder/code-server/main/install.sh
[nr-sh]: https://raw.githubusercontent.com/node-red/linux-installers/master/deb/update-nodejs-and-nodered
[uk-wiki]: https://github.com/louislam/uptime-kuma-wiki/blob/master/docs/%F0%9F%94%A7-How-to-Install.md
[ghost-rel]: https://github.com/TryGhost/Ghost/releases/tag/v6.62.0
[ghost-ver]: https://github.com/TryGhost/Ghost-CLI/blob/main/lib/utils/version.js
[ghost-inst]: https://github.com/TryGhost/Ghost-CLI/blob/main/lib/commands/install.js
[ghost-node]: https://github.com/TryGhost/Ghost-CLI/blob/main/lib/commands/doctor/checks/node-version.js
[ghost-local]: https://docs.ghost.org/install/local/
[cs-install]: https://coder.com/docs/code-server/latest/install
[cs-rel]: https://github.com/coder/code-server/releases/tag/v4.135.0
[cs-pkg]: https://github.com/coder/code-server/blob/main/ci/build/build-packages.sh
[cs-npm]: https://github.com/coder/code-server/blob/main/docs/npm.md
[cs-npm-pi]: https://github.com/coder/code-server/blob/main/ci/build/npm-postinstall.sh
[cs-unit]: https://github.com/coder/code-server/blob/main/ci/build/code-server-user.service
[cs-unit2]: https://github.com/coder/code-server/blob/main/ci/build/code-server@.service
[hb-build]: https://github.com/homebridge/homebridge-apt-pkg/blob/latest/build.sh
[hb-start]: https://github.com/homebridge/homebridge-apt-pkg/blob/latest/deb/opt/homebridge/start.sh
[hb-wiki]: https://github.com/homebridge/homebridge/wiki/Install-Homebridge-on-Debian-or-Ubuntu-Linux
[hb-unit]: https://github.com/homebridge/homebridge-apt-pkg/blob/latest/deb/debian/homebridge.service
[gitea-binary]: https://docs.gitea.com/installation/install-from-binary
[gitea-unit]: https://github.com/go-gitea/gitea/blob/main/contrib/service/systemd/gitea.service
[caddy-dist]: https://github.com/caddyserver/dist/tree/master/init
[caddy-docs]: https://caddyserver.com/docs/install
[caddy-rel]: https://github.com/caddyserver/caddy/releases/tag/v2.11.4
[fb-rel]: https://github.com/filebrowser/filebrowser/releases/tag/v2.63.23
[bz-rel]: https://github.com/henrygd/beszel/releases/tag/v0.18.8
[syn-user]: https://github.com/syncthing/syncthing/blob/main/etc/linux-systemd/user/syncthing.service
[pnpm-deploy]: https://pnpm.io/cli/deploy
[node-sea]: https://nodejs.org/api/single-executable-applications.html
[pkg]: https://github.com/vercel/pkg
[nexe]: https://github.com/nexe/nexe
[next-standalone]: https://nextjs.org/docs/app/api-reference/config/next-config-js/output
[gh-about]: https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases
[gh-rest]: https://docs.github.com/en/rest/releases/releases?apiVersion=2022-11-28
[gh-create]: https://cli.github.com/manual/gh_release_create
[relplease]: https://github.com/googleapis/release-please-action
[changesets]: https://github.com/changesets/changesets
