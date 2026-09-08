---
name: parallel-design-themes
description: Run a multi-theme UI design effort — several competing design variants built in parallel by agents on one shared core, verified visually against their references, kept switchable, and preserved until the owner validates. Use when the user wants multiple designs or themes explored from one product, asks for competing redesigns or design directions, wants common parts with per-theme widgets, or needs design variants kept side-by-side testable against an existing UI.
---

Run designs the way a foundry runs castings: one shared core, parallel isolated molds, visual inspection before anything ships, and nothing destroyed until the owner signs. The pipeline has six stages; each stage has a gate. The gates exist because three failures recur in this kind of work — **blind porting** (shipping designs nobody looked at), **flattening** (a shared layer erasing per-design identity), and **premature destruction** (deleting or replacing work the owner never validated). Every rule below traces to one of them.

## 1. Contracts before agents

Turn the owner's intent into a written brief, and settle every open question **before** any agent exists. Ask all unanswered questions in one round (a question tool or a numbered list), each with a recommended answer. Write the settled answers into a spec file as **binding decisions** — they outlive the conversation and override agent judgment later.

- The spec lives in one file in a session directory (e.g. `.plans/session-<id>/`), next to progress notes every agent writes to.
- Generic intent stays generic: the owner picks directions, names, counts, and palettes. Do not bake your own choices into the spec and present them as the owner's.
- **Gate:** the spec answers every question you were about to ask an agent. If you would phrase any dispatch instruction as "make it look good", the contract is not done.

## 2. Core before themes

Build or extract the shared core **before** dispatching theme work, so themes compose instead of duplicating. The core is two layers, and confusing them is the cardinal error:

- **Primitives** — the parts every design genuinely shares: data access, chart engines, table shells, format helpers, state providers. One implementation each. DRY rules here.
- **Identity widgets** — each design's own compositions carrying its look: structure, spacing, surfaces, chrome. These are **per-theme by design**. DRY rules do **not** reach here; a shared primitive is a floor to build on, never a ceiling that forces two designs to look alike.

Extract primitives from the first design that needs them rather than predicting them upfront; re-verify the split (what stays shared, what is identity) whenever a new design joins.

**Gate:** every theme agent can name which primitives it consumes and which presentation it owns. If a theme cannot differ visually from another theme without breaking the import rules, the layers are wrong.

## 3. Quarantined parallel themes

Dispatch one agent per design, each confined to its own directory (e.g. `themes/<slug>/`), each with an identical-shape brief — the brief skeleton lives in [agent-brief-template.md](agent-brief-template.md): the reference contract, the core's API, the file namespace, the verification loop, the escalation rule.

- **Namespace quarantine** is absolute: an agent writes only inside its own directory. Shared files (routes, registries, plan documents) are owned by the orchestrator alone — concurrent writers clobber each other and will wipe shared state.
- Agents **never commit**. The orchestrator verifies and commits per gate, one commit per design.
- Cap concurrency (e.g. 3 agents) and backfill as slots free.
- Every brief carries the **escalation rule**: if a needed primitive is missing, stop that widget, report the gap, and wait for the core to grow — a theme never ships a local copy of a shared part.
- Replies stay lean (bullets, ≤10 lines); all detail flows through files in the session directory.

**Gate:** each theme builds, passes the function harness, and reports which primitives it consumed.

## 4. Vision gates

Function probes (overflow, scroll, density, placement, persistence) prove the design *works*; they cannot prove it *looks like anything*. Design acceptance is a **vision gate**: screenshot comparison, judged by eyes.

- Agents must have vision enabled and be required to use it: screenshot their result **and** their reference, Read both images, list concrete deltas, fix, redeploy, re-shoot. Minimum three such iterations per surface; probes alone never clear a design.
- Compare at every target viewport (e.g. wide desktop, laptop, phone), not just one.
- The orchestrator re-runs the comparison independently — specific named regions and widgets ("the fleet table", "the hero tile"), never "overall impression" — before accepting a design.
- State the parity bar as a number (e.g. ≥95% match to the reference) and score each pass against it.
- Guardrail: re-check at every stage whether agents still have vision enabled and are briefed to use it. A stale "no vision" instruction carried into a later phase silently converts every vision gate into a blind one.

**Gate:** side-by-side pairs exist for every surface at every viewport, the orchestrator has personally compared them, and the score meets the bar.

## 5. Live alongside, then owner validation

New designs and the existing UI run **live alongside** each other on separate routes until the owner validates. This coexistence is the safety property the whole pipeline protects:

- Nothing is deleted, replaced, or cut over before the owner explicitly validates. Prototypes and prior work are **references and rollback**, not debris — deleting validated work before validation destroys the contract the designs were built against and the fallback the owner tests against.
- The owner validates by click-through, comparing each new design against its reference, and then decides: keep, rework, or cut over.
- Deletion/cutover is its own gated phase **after** validation, and it is revertible — the old work stays recoverable in history.

**Gate:** the owner has click-through every design and ruled on it. Until then: additions only, zero removals, zero route takeovers.

## 6. Switchable presets

Make designs switchable from the start so comparison is one click and adoption is a data change:

- Each theme is a **data preset** (layout placement + token/scheme stylesheets), discovered by convention (e.g. a glob over theme directories) — adding a theme is adding files, not editing a registry.
- A **scheme** is a separate stylesheet per variant (light/dark/accent variants) scoped under the theme; switching schemes swaps stylesheets or a scope attribute — CSS swaps cleanly, hidden DOM does not.
- Render **one active composition** from saved, persisted selection; switching is a state change that re-renders — never parallel mounted copies hidden with `display:none`.
- A picker in the chrome writes the saved selection; the single entrypoint renders whatever is saved.
- Validate the switching mechanism with the owner **early** — it is user-facing architecture, and a rejected implementation costs a rework pass.

**Gate:** switching theme and scheme persists across reload, renders one active composition, and the owner has seen and accepted the mechanism.

## 7. Single writer, phase commits

- The orchestrator is the **single writer** of the plan/ledger and the only committer. Agents write code and session notes; concurrent writers destroy shared documents.
- One commit per phase gate, message naming the phase. Everything revertible in units.
- Agents communicate through files in the session directory (handoff notes, reports), so follow-up agents continue without the orchestrator passing context.

## Failure modes this prevents

- **Blind porting** — design work shipped without anyone looking at it, because function probes passed. Prevented by vision gates (§4) and the orchestrator's independent comparison.
- **Flattening** — a shared layer erasing per-design identity, because DRY was applied to the widget layer. Prevented by the two-layer core split (§2) and parity gates (§4).
- **Premature destruction** — validated references deleted or a legacy UI cut over before owner validation. Prevented by live-alongside coexistence and the deletion gate (§5).
- **Clobbered shared state** — concurrent writers destroying the plan or each other's work. Prevented by namespace quarantine (§3) and the single-writer rule (§7).
- **Stale constraints** — a restriction from an earlier phase (no vision, rate limits) carried into later phases where it no longer applies and quietly degrades quality. Prevented by re-checking agent capabilities at every dispatch (§4).
