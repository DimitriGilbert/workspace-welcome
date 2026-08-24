# Context

Domain glossary for workspace-welcome. Terms here are the vocabulary used in
code, UI copy, and docs. Keep entries current as concepts sharpen.

## Roots & projects

- **Root** — a configured directory whose immediate subdirectories become
  Projects. Lives in the store, editable in Settings.
- **Project** — one scanned subdirectory of a Root: filesystem metadata, git
  state, stack, alerts, overrides (pin / note / hide / last-opened).
- **Scan** — the cached pass over all Roots that produces Project state.
  Fingerprints decide which Projects get re-scanned.

## Reports (git-snitch)

- **Report** — a single self-contained HTML file produced by git-snitch.
  Two kinds: a *project report* (`git-snitch repo <path>`) and a *root
  report* (`git-snitch scan <root>` — comparative, all repos under a Root).
- **Report run** — one on-demand invocation of git-snitch. Regenerating
  overwrites the previous Report. Reports are cached under
  `$XDG_CACHE_HOME/workspace-welcome/reports/` and served at `/reports/<key>`
  so they open in a new browser tab from any machine the app is reached from.
- **Snitch command** — the configurable command the app spawns to run
  git-snitch. Local build preferred, published npm CLI as fallback (ADR-0001).

## File browser

- **File browser** — the per-Project lazy file listing (upload / rename /
  delete / new folder / download). Confined to the Project subtree; cannot
  escape the Project root (ADR-0002).
- **Trash-with-fallback** — deletion semantics: `gio trash` when available,
  otherwise permanent delete behind the same confirmation (ADR-0002).
  Availability arrives as `trashAvailable` on `files.list`; the delete
  result says which mode ran.

## Web IDE

- **IDE server** — a code-server child process (ADR-0004) serving a
  browser-based editor. Spawned on demand by the app, stopped from the UI;
  per-Project opening happens by deep-linking the shared instance with
  `?folder=` (ADR-0003). Auto-installed into the app data dir on first use.
  Binds all interfaces with `--auth none`; browser URLs are built client-side
  from `window.location.hostname`, so the server reports only the port.
