# ADR 0004 — Web IDE distro: code-server, auto-installed on first use

Status: accepted (2026-08-21) — chosen by research recommendation; user was
not available for sign-off, so this decision is explicitly revisitable.

## Context

Three candidates researched (docs/research/2026-08-21-web-ide-server.md):
openvscode-server (dormant since Feb 2026, frozen on VS Code 1.109), the
VSCodium reh-web tarball (current but zero docs, deep-linking unverified),
and code-server (v4.133, Aug 2026, weekly releases, one version behind VS
Code). Lifecycle already fixed by ADR-0003: on-demand child process, one
shared instance, deep-linked per project.

## Decision

1. **code-server** is the IDE server. Rationale: documented `?folder=` deep
   links, single-flag `--auth none` for localhost, a real `GET /healthz`
   readiness endpoint, clean tarball spawn, active maintenance.
2. **Auto-install on first use.** First "Open IDE" downloads the official
   tarball into the app's data dir (`$XDG_DATA_HOME/workspace-welcome/ide/`),
   extracts, and starts. Settings can pin a different binary path later if
   wanted (mirrors the snitch command pattern from ADR-0001).
3. **Operations:** bind `0.0.0.0` (dev box on a LAN, browsed from other
   machines — user decision; `--auth none` accepted on that LAN),
   readiness = server-side poll of `http://127.0.0.1:<port>/healthz`, shut
   down by killing the process group (`kill(-pid, SIGTERM)`) so no children
   are orphaned. Browser-facing URLs are built client-side from
   `window.location.hostname` + port — never a hardcoded host.

## Consequences

- Extension marketplace is Open VSX — no proprietary MS extensions; anything
  published there installs fine.
- First use pays a one-time ~100–200 MB download with visible progress.
- SIGTERM behavior is undocumented upstream, hence the process-group kill.
