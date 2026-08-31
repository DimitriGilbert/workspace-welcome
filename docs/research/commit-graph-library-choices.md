# Commit graph library choices

Researched 2026-08-31 against npm registry data, GitHub repo APIs, and source READMEs.
Question: a simple git commit graph (lanes + dots + refs, hover → commit message) for the
dashboard, fed by our own server-side `git log` parse, React 19 + Tailwind v4 + Base UI,
ideally distributable later as a shadcn-style copy-paste component. ~100–500 commits, no
pan/zoom/virtualization needed.

## Comparison table

| Candidate | Last release | React 19 | Styling | Runtime deps | Data input | License | Verdict |
|---|---|---|---|---|---|---|---|
| `@gitgraph/react` 1.6.0 | 2021-03-06 | Peer `>=16.8` (untested on 19) | Templates + inline SVG styles, not Tailwind | `@gitgraph/core` (dep-free) | Git-like API; array import not a documented path | MIT | **Dead** — repo archived July 2024, author recommends moving on |
| `@dolthub/commit-graph` 2.4.1 | 2026-03-17 | Peer `>=19.0.0` (first-class) | `graphStyle` object (`branchColors`, spacing); own tooltip stack | `react-tooltip`, `reactjs-popup`, `react-infinite-scroller`, `react-icons`, `classnames` | Plain array: `{sha, commit{author,message}, parents[]}` + `branchHeads` | MIT (npm) / Apache-2.0 (repo) | **Best library**, but 5 deps incl. a second tooltip system; fights Base UI + shadcn-distributability |
| `git-graph-svg` 2.0.5 | 2026-03-11 | Peer `>=18` | Render hooks | `delaunator` (odd for a DAG) | Unverified | MIT | 3-week-old package, 0-star repo (`notakshayrajput/RepositoryGraph`); unproven |
| `react-d3-graph` 2.6.0 | 2020-12-18 | Peer `react ^16.4`, `d3 ^5` — blocks 19 | Force-directed config | d3 peer | Generic nodes/edges — wrong abstraction for a git DAG | MIT | Wrong tool + stale; requires legacy peer-dep overrides |
| `react-git-graph` | — | — | — | — | — | — | Does not exist on npm (registry 404) |
| **Custom SVG lane component** | n/a | Yes (pure SVG, `"use client"`) | Tailwind classes + CSS vars, native fit | **Zero** | Our own `git log` parse, any shape we want | n/a | **Recommended** |

Sources: npm [registry @gitgraph/react](https://registry.npmjs.org/@gitgraph/react) and
[package page](https://www.npmjs.com/package/@gitgraph/react); [gitgraph.js repo — `archived: true`, pushed 2024-07-13, README states the project is archived](https://github.com/nicoespeon/gitgraph.js);
npm [@dolthub/commit-graph](https://www.npmjs.com/package/@dolthub/commit-graph); [dolthub/commit-graph repo — pushed 2026-08-03, 8 open issues, 3 stars, Apache-2.0, fork of liuliu-dev/CommitGraph (29 stars)](https://github.com/dolthub/commit-graph);
npm [git-graph-svg](https://www.npmjs.com/package/git-graph-svg); npm [react-d3-graph](https://www.npmjs.com/package/react-d3-graph).

## Why the libraries lose

- **@gitgraph/react** was the canonical choice but its repo is archived and the last npm
  publish is 5.5 years old ([repo](https://github.com/nicoespeon/gitgraph.js)). Its primary
  API is a git-like command DSL (`gitgraph.commit()`, `gitgraph.branch()`), not a
  commits-array sink; templates style SVG inline, so Tailwind theming means writing a
  custom template object anyway.
- **@dolthub/commit-graph** is the healthiest library (built for DoltHub production,
  [algorithm write-up](https://www.dolthub.com/blog/2024-08-07-drawing-a-commit-graph/),
  React 19 peer, accepts a plain commit array with `branchHeads`). But it ships
  `react-tooltip` + `reactjs-popup` for hover UI — we already have a Base UI Tooltip in
  `packages/ui/src/components/tooltip.tsx`, so we'd carry two tooltip systems and a
  style-object API that can't take Tailwind classes. Poor shadcn-style distributability.
- **D3 generally**: force-directed/network libs (`react-d3-graph` et al.) model the wrong
  problem; a git DAG needs deterministic lane assignment, not simulation, and the whole d3
  stack is heavy for dots and beziers.

## Build-it-yourself: cost and edge cases

The lane algorithm is well documented and small. DoltHub's
["Drawing a commit graph"](https://www.dolthub.com/blog/2024-08-07-drawing-a-commit-graph/)
(in turn crediting [pvigier's 2019 post](https://pvigier.github.io/2019-05-06-vim-graph-drawing.html))
describes it: commits in topological order give the row; classify each commit's children as
**branch children** (continue/create a lane — parent takes `min(child lanes)`) or **merge
children** (end a lane — parent takes the leftmost *finished* lane at or right of the child's
lane, else a new lane); childless heads get a new lane. Track lane start/end rows so finished
lanes are reused. This is ~100–200 lines of pure TypeScript over the parsed log, with zero
dependencies, rendering `<svg>`: vertical line segments per lane, cubic-bezier `<path>`s for
merge curves, `<circle>` nodes colored by lane, refs as small badges. Hover = wrap each node
in the existing Base UI `Tooltip`/`TooltipTrigger`. Fully SSR-safe as a `"use client"` component.

### Recommended data command (verified against this repo)

```sh
git log --date-order --max-count=500 --format=%H%x00%P%x00%d%x00%s%x00%an%x00%at
```

Fields are NUL-separated, records newline-separated (NUL cannot appear in git commit data).
`%P` is space-separated parent SHAs (empty for root commits), `%d` is decorations like
` (HEAD -> main, origin/main)` — trim and split on `, ` for the short-ref badges.
`--date-order` shows no parent before its children while staying chronological (GitHub-style);
`--topo-order` is the alternative if lanes should never interleave branches at the cost of
chronology ([git-log docs](https://git-scm.com/docs/git-log)). Parse server-side in
`packages/api` alongside the existing scanner/git logic; the component takes a typed
`CommitNode[]`.

### Edge cases that bite (all manageable)

- **Octopus merges (>2 parents)**: draw one bezier per parent; visually fine at small lane
  counts, but cap displayed lanes and collapse the rest (DoltHub's data model allows N
  parents but doesn't specially style octopuses).
- **Dangling lanes**: a lane whose branch ends without merging must be freed for reuse —
  requires the start/end-row column tracking above (this exact flaw in gitgraph.js —
  deleted-branch commits drawn on one path — is why DoltHub wrote their own).
- **Truncation** (`--max-count`): the last rendered commits have invisible parents; treat
  missing parents as childless for drawing. Branch tips each open a lane — correct behavior,
  same as GitHub.
- **First-parent focus**: lanes are assigned over the full parent graph; to emphasize the
  current branch, color lane 0 (the HEAD lane) with the kiln accent and dim others.

## Recommendation

**Build the custom SVG lane component** (~150–250 lines, zero runtime deps) in the repo's
UI kit. No surviving library fits: @gitgraph/react is archived with no 2021+ release, and the
only maintained option, @dolthub/commit-graph, drags in react-tooltip/reactjs-popup/react-icons
— duplicating our Base UI tooltip and killing copy-paste distributability. The lane-assignment
algorithm is ~100–200 lines of documented, deterministic code over a NUL-separated
`git log --date-order` parse we already control end-to-end. Rendering plain `<svg>` styled with
Tailwind classes keeps the kiln palette and makes the component a drop-in shadcn-style artifact;
hover tooltips reuse the existing Base UI `Tooltip` in `packages/ui/src/components/tooltip.tsx`.
Revisit @dolthub/commit-graph only if requirements grow to infinite scroll with diffs.
