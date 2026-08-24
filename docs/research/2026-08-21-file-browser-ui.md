# Research: File browser UI component (Topic B)

Date: 2026-08-21. Question: how to build the per-project file browser (tree
or list, upload via drag-drop, rename, delete, download, new-folder; ADR-0002)
given the stack: **React 19.2, Tailwind v4.3, shadcn/ui built on `@base-ui/react`
1.6 (NOT Radix)**, copy-in preferred over opaque npm deps.

## TL;DR

**Recommendation: assemble from primitives.** No maintained copy-in
"file manager" exists that fits this stack; the two credible paths are a
headless tree library (`@headless-tree/react` primary, react-arborist
alternative) + `react-dropzone` for upload + existing base-ui components
(context-menu, dialog, input) for the actions. All server-side operations are
tRPC mutations anyway (the component shape is thin).

## 1. Copy-in components survey

| Candidate | What it is | License | Fit |
|---|---|---|---|
| **Kibo UI** ([repo][kibo], [site][kibo-site]) | shadcn-style registry (41 components, copy-in via `npx kibo-ui add`), now owned by shadcnblocks; closest match components: **Tree** (own primitives + Motion + Lucide; single/multi-select, keyboard nav; **no drag-drop, no inline rename**) and **Dropzone** (built on react-dropzone + Lucide) | MIT | Partial. Best copy-in building blocks, but there is **no file-manager component** — Tree+Dropzone still leave rename/delete/download/new-folder and lazy directory loading to us. |
| **Reui** tree/file-explorer ([page][reui]) | shadcn-style tree set incl. a file-explorer demo with type icons; notably ships **both a Radix and a Base UI (`@base-ui/react`) variant**; built on `@headless-tree/core`/`-react` | **Proprietary (KeenThemes), paid** — license forbids publishing the code in a public/open-source repo ([license][reui-license]) | Excluded despite the Base UI variant. Also: rename/delete are "compose it yourself", not built in. |
| **sadmann7/file-uploader** ([repo][sadmann]) | Full Next.js (T3) example app: shadcn + Radix, UploadThing backend, react-dropzone | MIT | Not a copy-in component — an app template with a cloud backend. Upload-only. |
| Community tree registries: [ggoggam/shadcn-treeview][ggog] (DnD tree, registry item), [MrLightful/shadcn-tree-view][mlight] | Radix-Collapsible-style tree copy-ins | MIT | Radix-based, Tailwind-v3 era, partial feature sets; would fight the base-ui setup. |
| Official shadcn/ui | Has **no** file manager; tree/file-tree requests remain open ([#355][sh355], [#4642][sh4642] — Radix declined to build a DnD tree) | — | Confirms the gap is real, not a search failure. |

[kibo]: https://github.com/shadcnblocks/kibo
[kibo-site]: https://www.kibo-ui.com/
[reui]: https://reui.io/components/tree
[reui-license]: https://reui.io/legal/license
[sadmann]: https://github.com/sadmann7/file-uploader
[ggog]: https://github.com/ggoggam/shadcn-treeview
[mlight]: https://github.com/MrLightful/shadcn-tree-view
[sh355]: https://github.com/shadcn-ui/ui/issues/355
[sh4642]: https://github.com/shadcn-ui/ui/issues/4642

Verdict: a copy-in "file manager" that satisfies upload+rename+delete+
download+new-folder on base-ui/Tailwind v4/React 19 **does not exist**. Kibo
UI is the only MIT copy-in worth pulling from (its Dropzone, possibly Tree),
and Reui is off-limits on licensing.

## 2. Building blocks (all verified against npm registry, Aug 2026)

### Tree state / view

| | **@headless-tree/react** (primary) | **react-arborist** (alternative) |
|---|---|---|
| Version / date | 1.7.0, active ([npm][ht-npm]) | 3.16.0, published ~Jul 2026 ([npm][ra-npm]) |
| License | MIT | MIT |
| React peers | `react: *`, `@headless-tree/core: *` | `react >= 16.14` (React 19 OK) |
| Runtime deps | **none** (~9.5 kB core + ~0.4 kB React bindings) | redux 5, react-dnd 14 (+html5 backend), react-window 1, use-sync-external-store |
| DnD | Yes (ordered/unordered + keyboard DnD module) | Yes (react-dnd) |
| Inline rename | Yes | Yes |
| **Lazy/async children** | **First-class**: sync or async data sources with caching ([repo][ht-repo]) | **Not built-in**: open feature request ([#309][ra-309]); emulate via controlled `data` + `onExpand` |
| Virtualization | Works with common virtualizers (docs cite 100k+ items) | Built in (react-window) |
| Maturity note | Successor to react-complex-tree; README says beta, "mostly stable and production ready" | 449k weekly downloads, built for the Brim/Zui file-tree use case |

For a *filesystem* browser, lazy directory loading is the decisive feature:
project directories can contain thousands of entries (node_modules, target/),
and the ADR-0002 subtree walk should be on demand. headless-tree's async data
source with caching matches exactly; with react-arborist we'd hand-roll the
fetch-on-expand bookkeeping against its controlled-data API.

### Primitives we already have

`@base-ui/react` **1.6.0 has no Tree component** (verified against the
installed package: accordion, alert-dialog, autocomplete, avatar, button,
checkbox, collapsible, combobox, **context-menu**, dialog, drawer, field,
input, menu, popover, progress, scroll-area, select, toolbar, tooltip, ...).
That's fine: the tree view comes from the headless lib, and everything around
it (right-click menu for rename/delete/download, dialogs for confirmations
and new-folder, inputs, progress for uploads) is covered by base-ui +
existing shadcn wrappers in `packages/ui`.

### Upload

- **react-dropzone 20.1.1** — MIT, peer `react >= 18`, deps attr-accept +
  file-selector, published via trusted publisher ([npm][rdz-npm]). Drag-drop
  + file dialog + validation; hooks only, styling is ours (Tailwind). This is
  also what Kibo UI's Dropzone wraps, so using it directly avoids copying
  Motion-dependent code we don't need.

[ht-npm]: https://registry.npmjs.org/@headless-tree/react/latest
[ht-repo]: https://github.com/lukasbach/headless-tree
[ra-npm]: https://registry.npmjs.org/react-arborist/latest
[ra-309]: https://github.com/jameskerr/react-arborist/issues/309
[rdz-npm]: https://registry.npmjs.org/react-dropzone/latest

## 3. Recommendation

**Assemble from primitives** (not a port of a radix-era copy-in component):

1. Tree: `@headless-tree/core` + `@headless-tree/react` — async/lazy loading
   per directory (tRPC `files.list` per folder), inline rename hooking a
   `files.rename` mutation, DnD available later if move-operation is ever
   wanted. Render rows with Tailwind classes + lucide icons (matches the
   design tokens in `packages/ui`); no radix, no CSS-in-JS.
2. Upload: `react-dropzone` dropzone on the tree panel; upload via tRPC
   mutation (multipart or raw body); confirm-on-collision per ADR-0002.
3. Actions: base-ui `context-menu` for rename/delete/download/new-folder,
   `dialog` + `input` for prompts and the delete confirmation (trash vs
   permanent fallback labelled per ADR-0002). Download served by a server
   route with `Content-Disposition: attachment` (see Topic C research).
4. Optional copy-in: Kibo UI's Dropzone if its polish is worth the Motion
   dependency; everything else stays first-party.

Why not react-arborist as primary: batteries included (virtualization, DnD)
but no first-class async loading — the one feature this browser genuinely
needs — and it drags redux + react-dnd into a stack that otherwise has
neither. Keep it as the fallback if headless-tree's beta status bites.

Why not Kibo Tree as the tree: no lazy loading story, no inline rename;
it's a nav-tree, not a filesystem tree.

## Not verified / caveats

- headless-tree is self-described beta ("mostly stable"); its async-loading
  API should be prototyped against our tRPC procedures before committing.
- Kibo UI's exact Tailwind v4 / React 19 support isn't stated on the site;
  it's copy-in code, so any friction is editable, but expect small fixes.
- No candidate was found offering server-side operations — all of them are
  UI-only. The tRPC file router (list/rename/delete/trash/upload) is ours to
  build regardless; ADR-0002 already fixed its security shape.
