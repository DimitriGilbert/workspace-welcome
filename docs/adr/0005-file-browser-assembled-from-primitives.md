# ADR 0005 — File browser assembled from primitives, not a copy-in component

Status: accepted (2026-08-21) — chosen by research recommendation; user was
not available for sign-off, so this decision is explicitly revisitable.

## Context

Research (docs/research/2026-08-21-file-browser-ui.md) found no maintained
copy-in file-manager component for this stack (React 19 + Tailwind v4 +
shadcn on base-ui). shadcn itself has none (open issues #355 / #4642); Reui
is proprietary; Kibo UI has a Tree but without lazy loading or rename;
sadmann7/file-uploader is a full Next.js app, not a component.

## Decision

Assemble the file browser from:

- **@headless-tree/react** (MIT, zero deps, ~10 kB) — tree logic with
  first-class async/lazy directory loading with caching and inline rename.
  Lazy loading is the one feature a real filesystem browser needs.
- **react-dropzone** (MIT, React 19-ready) — upload drag-drop.
- **Existing base-ui components** (dialog, context-menu, input, button) —
  rename / delete / download / new-folder actions over tRPC mutations.

## Consequences

- Visual style comes from the app's own tokens — no fighting a component's
  bundled styles; no radix or redux/react-dnd dragged in.
- The app owns the (small) composition layer, so subtree confinement
  (ADR-0002) is enforced server-side and simply reflected in the tree.
- More app code than a copy-in would have been — accepted; no candidate
  copy-in actually existed.
