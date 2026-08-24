# ADR 0002 — File browser confined to the project subtree; trash-with-fallback delete

Status: accepted (2026-08-21)

## Context

The file browser lives on each Project page and can upload, rename, and
delete files. Deletion and renaming are destructive; the browser must not
become an accidental whole-disk editor.

## Decision

1. **Scope.** Listing and operations are confined to the Project's own
   directory subtree. Paths are resolved server-side and rejected unless the
   real path stays inside the Project root (symlinks resolved). No
   navigating above the Project root.
2. **Delete.** `gio trash` when available (restorable from the file
   manager); if `gio` is missing, fall back to permanent delete. Both paths
   sit behind the same explicit confirmation in the UI; the fallback is
   labelled as permanent.

## Consequences

- Destructive actions are bounded by the Project root — one bad click can't
  touch other Projects or home-directory files.
- `gio` is a GLib tool present by default on Fedora; absence is expected
  only on minimal setups, where the permanent fallback kicks in.
- Uploads overwrite silently or with confirmation is a UI detail, not an
  architectural constraint (decided at implementation: confirm on collision).
