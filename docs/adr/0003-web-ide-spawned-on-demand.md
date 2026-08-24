# ADR 0003 — Web IDE is spawned on demand and managed by the app

Status: accepted (2026-08-21)

## Context

The user wants a full VSCodium-family IDE available in a browser tab when
needed. Candidates (openvscode-server, code-server, `code serve-web`) are
researched separately; this ADR fixes the *lifecycle*, which is independent
of the distro.

## Decision

The app owns the IDE server lifecycle:

- The server runs as a child process of workspace-welcome, started on demand
  ("Open in IDE"), not as a systemd service.
- One shared instance serves all Projects: per-Project opening deep-links the
  running server with a folder parameter instead of spawning per Project.
- Settings (or the project page) shows running state and can stop/restart it.
- Bind to **all interfaces** (`0.0.0.0`) — this dashboard runs on a dev box
  that is routinely browsed from other machines, so the IDE must be reachable
  the same way. IDE URLs are built client-side from `window.location.hostname`
  (whatever host the dashboard was reached on); the server never hardcodes a
  host. `--auth none` is an explicit accepted trade-off on the LAN
  (single-user dev box; final distro call with the research).

## Consequences

- Nothing runs when unused; no manual systemd setup step.
- The app must handle: port selection, readiness detection before opening the
  tab, and not orphaning the process on app exit/restart (kill children).
- If the app crashes, the IDE process dies with it — acceptable for a local
  dashboard.
