# Research: Web IDE server distro (Topic A)

Date: 2026-08-21. Question: which browser-VSCodium-family IDE server should
workspace-welcome spawn as an on-demand child process (ADR-0003), on Fedora
Linux x64, bound to localhost, single user, deep-linked per project?

Environment ground truth: Node 22+ app, existing spawn patterns in
`packages/api/src/lib/spawn.ts`. Upstream VS Code at research time:
**1.134.0, released 19 Aug 2026** ([microsoft/vscode releases][vscode-rel]).

[vscode-rel]: https://github.com/microsoft/vscode/releases

## TL;DR

**Recommendation: code-server.** Actively maintained (weekly-ish releases,
currently tracks upstream VS Code one version behind), simplest
auth-free-localhost story (`--auth none`, one flag), documented `?folder=`
deep links, a real health endpoint (`/healthz`), and a plain tarball install.
openvscode-server is effectively dormant (last release Feb 2026, ~25 VS Code
versions behind). VSCodium's reh-web build is the pure-OSS runner-up but ships
with no usage instructions and had a packaging bug in the desktop
`codium serve-web` path.

## Comparison table

| | code-server | VSCodium reh-web (`bin/codium-server`) | openvscode-server |
|---|---|---|---|
| License | MIT ([repo][cs-repo]) | MIT (VS Code MIT sources, built by VSCodium) | MIT |
| Latest release | v4.133.0, **17 Aug 2026** ([releases][cs-rel]) | 1.126.04524, **7 Jul 2026** (tracks VS Code 1.126) ([releases][vsc-rel]) | v1.109.5, **20 Feb 2026** ([releases][ovs-rel]) |
| VS Code base | 1.133 (upstream is 1.134) | 1.126 | 1.109 (~25 versions behind) |
| Maintenance | Very active: 10 releases Jun 17–Aug 17 2026 | Active (monthly-ish) | **Stalled**: 6-month gap, unanswered "is this maintained?" discussion [#660][ovs-660]; linuxserver.io deprecated their image of it |
| Install | tarball from GitHub releases: `code-server-$V-linux-amd64.tar.gz` → `bin/code-server` ([install.md][cs-install]) | tarball `vscodium-reh-web-linux-x64-$V.tar.gz` → `bin/codium-server` ([releases][vsc-rel]; usage verified from [linuxserver.io's runner][ls-run]) | tarball `openvscode-server-v$V.tar.gz` → `./bin/openvscode-server` ([README][ovs-readme]) |
| Bind to localhost | `--bind-addr 127.0.0.1:PORT` (this is already the default; default port 8080) ([cli.ts][cs-cli]) | `--host 127.0.0.1` (default `localhost`) `--port PORT` (default 8000 for `serve-web`; `0` = random free port, `start-end` = range) ([serverEnvironmentService.ts][vscode-srv]) | `--host` (default localhost) `--port` (README documents default 3000) ([README][ovs-readme]) |
| Auth off for localhost | `--auth none` (values: `password`\|`none`; default `password`; `--hashed-password` only via env/config) ([cli.ts][cs-cli], [guide.md][cs-guide]) | `--without-connection-token` (default behaviour otherwise: a fresh UUID token per start, printed in the startup URL) ([serverEnvironmentService.ts][vscode-srv]) | `--without-connection-token` ([README][ovs-readme]) |
| Deep-link a folder | `http://HOST:PORT/?folder=/abs/path` — documented, with `?workspace=` and `payload` for files/lines; FAQ notes this is "upstream VS Code web behavior (the same mechanism vscode.dev uses)" ([FAQ][cs-faq]) | Same VS Code web mechanism (`?folder=`); deterministic server-side alternative: `--default-folder /abs/path` ("the workspace folder to open when no input is specified in the browser URL") ([serverEnvironmentService.ts][vscode-srv]) | `https://host/?folder=/abs/path` — user-confirmed working ([discussion #441][ovs-441]); no `?file=` equivalent |
| Readiness signal | **`GET /healthz`** → `{"status":"alive","lastHeartbeat"}` ([src/node/routes/health.ts][cs-health]); TCP accept also fine | TCP port accept (this is what the [linuxserver.io container][ls-run] uses: `nc -z 127.0.0.1 8000`); no documented HTTP health endpoint | TCP port accept; startup prints the URL when listening (README: "visit the URL printed in your terminal") |
| First run | Auto-writes `~/.config/code-server/config.yaml` containing a generated password ([install.md][cs-install], [guide.md][cs-guide]) | No config file; token auto-generated per start unless disabled | No config file; token auto-generated per start unless disabled |
| Extensions | Open VSX (Microsoft marketplace ToS-prohibited) ([FAQ][cs-faq]) | Open VSX by default ([docs/extensions.md][vsc-ext]) | Open VSX ([README][ovs-readme]) |
| Sysreqs | "1 GB RAM, 2 vCPU", glibc ≥ 2.28 ([README][cs-repo]) | not documented (VS Code-server class footprint) | not documented |
| Fedora x64 | linux-amd64 tarball / amd64.rpm ([install.md][cs-install]) | linux-x64 tarball | linux-x64 tarball |

[cs-repo]: https://github.com/coder/code-server
[cs-rel]: https://github.com/coder/code-server/releases
[cs-install]: https://raw.githubusercontent.com/coder/code-server/main/docs/install.md
[cs-cli]: https://raw.githubusercontent.com/coder/code-server/main/src/node/cli.ts
[cs-guide]: https://raw.githubusercontent.com/coder/code-server/main/docs/guide.md
[cs-faq]: https://raw.githubusercontent.com/coder/code-server/main/docs/FAQ.md
[cs-health]: https://raw.githubusercontent.com/coder/code-server/main/src/node/routes/health.ts
[vsc-rel]: https://github.com/VSCodium/vscodium/releases
[vsc-ext]: https://raw.githubusercontent.com/VSCodium/vscodium/master/docs/extensions.md
[ls-run]: https://raw.githubusercontent.com/linuxserver/docker-vscodium-web/master/root/etc/s6-overlay/s6-rc.d/svc-vscodium-web/run
[ovs-rel]: https://github.com/gitpod-io/openvscode-server/releases
[ovs-readme]: https://github.com/gitpod-io/openvscode-server
[ovs-660]: https://github.com/gitpod-io/openvscode-server/discussions/660
[ovs-441]: https://github.com/gitpod-io/openvscode-server/discussions/441
[vscode-srv]: https://raw.githubusercontent.com/microsoft/vscode/main/src/vs/server/node/serverEnvironmentService.ts

## Option details

### 1. code-server (Coder) — recommended

- **Install (standalone, no npm):** download
  `https://github.com/coder/code-server/releases/download/v$VERSION/code-server-$VERSION-linux-amd64.tar.gz`,
  extract to `~/.local/lib/code-server-$VERSION`, run `bin/code-server`
  ([install.md][cs-install]). Fedora RPM also exists. Requires glibc ≥ 2.28
  (any recent Fedora is far past that).
- **Our invocation shape:**
  `bin/code-server --bind-addr 127.0.0.1:<port> --auth none` — auth is then
  fully off (single-user localhost, exactly ADR-0003's "final call with the
  research"). Password auth (default) uses a generated password written to
  `~/.config/code-server/config.yaml` on first run; `--hashed-password`
  (argon2) is config/env-only, and password attempts are rate-limited
  ([cli.ts][cs-cli], [guide.md][cs-guide]).
- **Folder deep link:** resolution order is `?workspace=` → `?folder=` → CLI
  positional → last opened ([FAQ][cs-faq]). So one shared server instance +
  `http://127.0.0.1:PORT/?folder=/abs/project/path` per project satisfies
  ADR-0003's shared-instance model. `?folder=` must be absolute. The
  `/proxy/<port>/...` base paths are the Coder-platform reverse-proxy mode,
  not something plain code-server needs — plain use serves at `/`.
- **Readiness:** `GET /healthz` returns `{"status":"alive",...}` once up
  ([health.ts][cs-health]). Simple and unambiguous.
- **Maintenance:** releases v4.124.2 (16 Jun 2026) → v4.133.0 (17 Aug 2026),
  i.e. roughly weekly; each tracks an upstream VS Code bump (v4.133.0 =
  "Update to Code 1.133.0").

### 2. VSCodium reh-web (`vscodium-reh-web-linux-x64` tarball) — runner-up

- Same server target VS Code itself uses for "web host" — "reh-web ... is the
  server component of the command `codium serve-web` ... makes VSCodium
  accessible via a browser" ([docs/others.md][vsc-others]). VSCodium
  maintainers confirmed reh-web is the supported browser path and that the
  server is "from a VSCode source" ([discussion #1469][vsc-1469]).
- **Tarball entrypoint** is `bin/codium-server`; a real deployment runs
  `/app/vscodium-web/bin/codium-server --host 0.0.0.0 --port 8000
  --without-connection-token` ([linuxserver.io run script][ls-run]) — same
  shape we'd use with `--host 127.0.0.1`.
- **Flags** (shared with all VS Code-server derivatives, canonical list in
  [serverEnvironmentService.ts][vscode-srv]): `--host` (default localhost),
  `--port` (0 = random free port, ranges allowed), `--connection-token` /
  `--connection-token-file` / `--without-connection-token` (default = fresh
  UUID per start, embedded in the startup URL), `--server-base-path`,
  `--server-data-dir`, `--default-folder` / `--default-workspace`,
  `--telemetry-level off`.
- **Caveats:** no install/setup docs ship with the tarballs ("Surprisingly,
  there are no instructions for installation and setup" — [discussion
  #1469][vsc-1469]); the desktop `codium serve-web` command had a packaging
  bug (missing `code-tunnel-oss`, [issue #2305][vsc-2305], closed stale), so
  prefer the reh-web tarball over the desktop command.
- **Official `code serve-web`** (proprietary VS Code CLI) exposes the same
  flags plus `--accept-server-license-terms` — it is **not** an OSS-only
  option because the shipped `code` CLI/server artifacts are under
  Microsoft's VS Code license, not MIT. For an OSS-only setup, the VSCodium
  reh-web build is the equivalent. (Flag set cross-checked against usage in
  [microsoft/vscode#248417][vscode-248417]; secondary write-up: [Arm install
  guide][arm-guide].)

[vsc-others]: https://github.com/VSCodium/vscodium/blob/master/docs/others.md
[vsc-1469]: https://github.com/VSCodium/vscodium/discussions/1469
[vsc-2305]: https://github.com/VSCodium/vscodium/issues/2305
[vscode-248417]: https://github.com/microsoft/vscode/issues/248417
[arm-guide]: https://learn.arm.com/install-guides/vscode-remote/

### 3. openvscode-server (Gitpod) — works today, frozen

- Last release **v1.109.5, 20 Feb 2026** ([releases][ovs-rel]); historical
  cadence was roughly monthly-bimonthly (v1.101 Jun 2025 → v1.109 Feb 2026),
  so the current 6-month gap is a break in pattern. An "is the project still
  being actively maintained?" discussion ([#660][ovs-660], posted 18 Jun 2026)
  is still unanswered with zero maintainer replies. Third parties have drawn
  the conclusion (linuxserver.io deprecated their openvscode-server image in
  Jul 2026 "due to the upstream project no longer updating").
- Everything we need still works on the Feb 2026 build: `./bin/openvscode-server
  --host 127.0.0.1 --port N --without-connection-token`, `?folder=` deep links
  ([discussion #441][ovs-441]), Open VSX extensions ([README][ovs-readme]).
- Risk: VS Code 1.109-era extension API may progressively reject current
  open-vsx extension versions; security fixes stop. Not a good base for a new
  integration in Aug 2026.

## Operational notes (all options)

- **Readiness:** code-server → poll `GET /healthz`. reh-web/openvscode-server
  → poll TCP connect on the port (the approach real deployments use
  [ls-run]); once the port accepts, `GET /` returns the workbench (with
  token auth it redirects/needs the token — use `--without-connection-token`
  to keep the probe trivial).
- **Shutdown:** none of the three document SIGTERM behaviour. Do not rely on
  the child's own signal handling: spawn it as its own process group
  (`detached: true`, keep stdio pipes for logs — the *opposite* of
  `spawn.ts`'s current fire-and-forget `launch()`), track the pid, and stop
  it with `process.kill(-pid, "SIGTERM")` (group kill catches the server's
  grandchildren), escalating to SIGKILL after a grace period. Register an
  `exit`/`SIGTERM` hook so the IDE dies with the app (ADR-0003 consequence).
- **First run:** code-server writes `~/.config/code-server/config.yaml`
  (contains generated password — irrelevant under `--auth none`); the
  VS Code-server derivatives create a data dir but no config file; token
  (when not disabled) is generated per start and printed to stdout — if we
  ever keep tokens on, parse the URL from stdout rather than predicting it.
- **Memory footprint:** only code-server publishes a requirement ("1 GB RAM,
  2 vCPU" [README][cs-repo]). No primary source gives RSS numbers for any of
  the three; expect a few hundred MB per running instance (unverified
  ballpark — flagging explicitly). Not orphaning the process when unused
  (ADR-0003) matters more than the idle footprint.

## What could not be verified from primary sources

- SIGTERM/shutdown semantics of all three (no docs found) — mitigated by
  process-group kill regardless.
- Memory RSS figures for openvscode-server and reh-web (undocumented);
  code-server's "1 GB RAM" is a stated minimum, not observed usage.
- `?folder=` on `code serve-web` specifically: verified for code-server
  (official FAQ) and openvscode-server (user confirmation); for
  VSCodium reh-web it is inferred from the shared VS Code-web code base and
  the `--default-folder` description in
  [serverEnvironmentService.ts][vscode-srv]. If reh-web is chosen, verify
  `?folder=` once against the running server before wiring the UI.
