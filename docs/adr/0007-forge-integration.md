# ADR 0007 — Forge integration: adapter contract, explicit sync, DB snapshot cache

Status: accepted (2026-09-14)

## Context

The dashboard surfaces each project's open issues/PRs from its git remote's
forge (GitHub/Gitea/GitLab). The owner's GitHub account is rate-limited and
precious — accidental fetch storms or background polling are unacceptable.
Project→repo identity already existed: `gitInspect` parses
`remote.origin.url` into `RemoteInfo { url, host, slug, links }`.

## Decision

1. **Adapter contract supporting both styles.**
   `ForgeAdapter` (`packages/api/src/lib/forge/types.ts`) declares
   `style: "cli" | "api"` plus `matches(remote)`, cached `isAvailable()`,
   and `fetchSnapshot()`. Only the gh CLI adapter exists (execFile with a
   30 s timeout and 1 MB maxBuffer, errors rewrapped, never leaking raw
   exec failures). The registry resolves "first adapter whose `matches()`
   accepts the remote" (gh matches `remote.host === "github"`). Gitea and
   GitLab are reserved `ForgeKind` values only — no stubs are shipped.
2. **Sync is the anti-rate-limit architecture.** The ONLY door to a live
   fetch is the explicit `forge.sync` mutation behind a Sync button — no
   auto-sync on load, no polling, no bulk sync. Each call meets, in order:
   remote resolution → repo-link upsert → per-repo min-interval refusal
   (5 min server-side, bypassable with `force`) → per-repo in-flight dedupe
   (Map keyed `kind:host:slug`) → a process-wide sequential queue so only
   ONE adapter invocation (probe or fetch) is ever in flight — issues then
   pulls strictly sequential inside a snapshot → an availability probe
   (`gh auth status` exit code) cached 10 min in both polarities → page
   cap 50 per list, where a capped list renders "50+" / "a list hit the
   page limit" and never a false exact count. The read procedures
   (`forge.overview`, `forge.project`) are DB-only — rendering can never
   trigger network. The 60-min TTL (`SYNC_TTL_MS`) is a UI staleness hint
   only, never a fetch trigger.
3. **Snapshot semantics.** The forge tables hold "open items as of last
   sync": one successful sync transactionally replaces a repo's issue/pull
   rows (no history). A repo linked by a failed FIRST sync has no
   `lastSyncedAt` and is excluded from the overview — no fabricated zeros.
   A failed later sync retains the last good snapshot
   (`recordSyncFailure` never clears `lastSyncedAt`) — stale-but-real data
   stays rendered with the error surfaced.
4. **Fixture-based development, live-smoke budget.** gh output shapes are
   hand-authored fixtures (`packages/api/src/lib/forge/fixtures/`) plus
   pure-parser tests and fake-adapter sync tests — zero live `gh` during
   development. The single live smoke (Phase 8b) is budgeted at exactly 3
   gh invocations — `gh auth status`, one `gh issue list`, one `gh pr list`
   against this repo's own origin — captured to files and parsed offline;
   any reality-vs-fixture drift is fixed by iterating on the captures.
5. **Gitea/GitLab extension path (documented, not built).** A future
   settings-driven host map maps self-hosted remotes to forge kinds;
   api-style adapters implement the same `ForgeAdapter` interface and drop
   into the registry array; `canonicalWebHost` in `forge/db.ts` is the
   explicit seam where a new adapter's canonical host is declared. No API
   calls were invented ahead of a real instance.

## Consequences

- One adapter to maintain today; adding one is additive (registry entry +
  host map), not architectural.
- The rate-limit invariants live server-side in `sync.ts` — not
  bypassable through the read helpers — and are unit-tested with fake
  adapters recording call order.
- Machines without a working `gh` get an honest "gh not authenticated"
  refusal from the cached probe — never a crash or probe storm.
