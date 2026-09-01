# Agent-browser demo plan — welcome-workspace (product)

**Status:** PLAN ONLY — **DO NOT RECORD YET**. Awaiting human validation of scenes, sample data, and timing before any capture or agent-browser script.

**Product:** welcome-workspace (`workspace-welcome` repo)  
**Surface under demo:** `apps/web` at `http://localhost:37420`  
**Out of scope:** docs/marketing site (`apps/docs`); any chat / interview / PRD-generation surfaces.

This document is a validation-ready shot list + high-level agent-browser choreography. It is not a runnable script.

---

## Goal / audience

**Goal.** Show that workspace-welcome is the Monday-morning control plane for a machine full of git projects: scan roots, triage alerts, pin and note, filter fast, pull/push/branch, open remotes and local tools, generate a git-snitch report, browse files, drop into a web IDE, scaffold a better-t-stack project, and leave with a clone script — without leaving the browser for the dashboard itself.

**Audience.** Developers who keep many local repos (and maybe a LAN-reachable dev box). People who already live in git + editors and want one place that answers “what’s dirty / behind / pinned / where I left off?”

**Tone for narration.** Direct, concrete, lightly dry. Prefer “here’s the Needs attention strip” over “empowering your workflow.” First person is fine (“I pin the one I’m shipping this week”).

---

## Prerequisites

### Runtime

- Dev app up: from repo root, `pnpm dev` or `pnpm dev:web` → `http://localhost:37420`.
- Do **not** demo against a marketing docs port; confirm the masthead says `workspace` and the home route is `/`.
- Prefer a clean browser profile or an agent-browser session that allows popups (Report and Open IDE open blank tabs then navigate them).

### Sample data (stage before recording)

Use a disposable **demo root** (e.g. `~/workspace/demo-welcome`) with a handful of real-ish subdirs so the scan looks lived-in:

| Fixture | Why |
|---------|-----|
| ≥1 git repo with remote + ahead/behind and/or dirty files | Needs attention + git toolbar |
| ≥1 clean, recently touched repo | Recent grid / recency accent |
| ≥1 older / cold repo | Older list |
| ≥1 non-git folder that still looks like a project | Stack / “not a git repository” contrast (optional) |
| At least one project with a known branch set | Branch switcher / fetch-one-branch |

**Empty → first root** needs a state with **zero tracked directories** (or wipe roots from Settings / `~/.config/workspace-welcome/store.json` for a throwaway profile). Prefer a dedicated store or a second machine user for the empty-state take so you don’t nuke a real dashboard.

**Pin / note:** pick one project you will pin and annotate mid-demo; leave it unpinned at start of the triage scene.

**Create project (BTS):** at least one registered root with write access; network OK for scaffolding; expect tens of seconds for a full scaffold — short path may skip or cut after “job started + command preview.”

**git-snitch:** optional local CLI path in Settings; blank auto-resolves local build or `npx @git-snitch/cli`. First run may be slow (npx). Prefer a warm cache before recording.

**Web IDE:** first **Open IDE** downloads ~100–200 MB code-server into `$XDG_DATA_HOME/workspace-welcome`. Pre-install once (click Open IDE, wait until Running in Settings) so the demo isn’t a progress bar.

**File browser / trash:** optional `gio` on PATH → delete copy says trash; without it, confirm dialog is permanent delete. Either is fine; call it out once if permanent.

### Optional tooling

- `gio` — nicer trash semantics in the file browser (ADR-0002).
- Local gitsnitch build at `~/workspace/gitsnitch/apps/cli/dist/index.js` — faster Report than npx.
- Desktop editor / terminal configured in Settings if you show **Open editor** / **Terminal** (those spawn host apps; agent-browser can click them but won’t “enter” the desktop app).

---

## Full scene table

| # | Scene | Location | Narration beats (spoken / VO) | On-screen proof | Agent-browser (high level) |
|---|-------|----------|-------------------------------|-----------------|----------------------------|
| 1 | Empty → first root | `/` then Add directory sheet | “Nothing tracked yet. Point it at a folder of projects — it scans immediate children, not the whole disk.” | EmptyState: “Add a directory to start” → sheet title “Add a directory” → toast “Directory added” → cards / sections appear | `goto /` → assert empty copy → click **Add a directory** (empty CTA or header **Add directory**) → fill Path (absolute) + optional Label → submit → wait for toast + project grid/list |
| 2 | Monday morning triage | `/` → project page | “Needs attention is the amber strip — warn/error only. I open the noisy one, pin it so it doesn’t fall into Older, and leave a note where I left off.” | Needs attention section → project alerts → pin glyph → note field “where i left off” saves on blur | Assert **Needs attention** visible → click a flagged row → on `/projects/$` assert alert badges → go back `/` → click Pin on that card → reopen project → type note → blur → wait scan settle (optional re-open to show note persisted) |
| 3 | Find anything fast | `/` | “Slash focuses filter. Name, path, stack, branch, remote, note — one box. Refresh rescans when you know the disk moved.” | `/` focuses search; filter narrows Pinned/Recent/Older + Needs attention together; empty filter state or Clear filter; Refresh spinner | Press `/` → assert search focused → type a distinctive token → assert matching cards only → Escape clear → click **Refresh** → assert fetch settles (spinner stops) |
| 4 | Project git ops | `/projects/<path>` vitals | “Fetch / Pull / Push live on the project. Branch switcher is right there; history cell updates after ops.” | Git cell: Fetch, Pull, Push, BranchSwitcher; toast on success; History / ahead-behind update | Open a git project with remote → click **Fetch** → wait toast → optional **Pull** if behind → open branch control → switch to a safe branch (or cancel if dirty warning) → glance History cell |
| 5 | Remote & quick-open | Same project header + git cell | “Remote opens the host. Issues and PRs are one click. Open editor / Terminal / Folder are the local escapes — dashboard doesn’t pretend to be your whole toolchain.” | Remote link (`host · slug`); Issues / Pull requests; **Open editor**, **Terminal**, **Folder** | Click remote web link (assert new tab or href) → click Issues or PRs → click **Open editor** (or Folder) → assert toast success — do **not** chase the desktop window |
| 6 | git-snitch report | Project header **Report** → `/reports/$key` | “One Report button — git-snitch HTML, cached, opens in a tab. Regenerating overwrites the previous run for that key.” | Button → Generating… → new tab on `/reports/<key>` with HTML report body | Click **Report** → wait for report tab/URL → assert report content (or loading → ready) → close tab, return to project |
| 7 | File browser | Project page Files band | “Tree is confined to the project. Lazy dirs, click a file to preview, context menu for rename / new folder / download / delete.” | FileBrowser card; tree + viewer; optional new folder + delete confirm (trash vs permanent) | Expand a dir → open a small text file in viewer → context-menu **New folder…** under a safe parent → create `demo-tmp` → optional rename → delete with confirm (prefer trash if `gio`) |
| 8 | Web IDE | Project **Open IDE** (+ Settings Web IDE card) | “Shared code-server, on demand. Same instance, deep-linked with the project folder. Stop it from Settings when you’re done.” | Open IDE (or Starting…); IDE tab with `?folder=`; Settings shows Running + Stop | Click **Open IDE** → wait IDE tab or “IDE ready” toast → assert URL has folder query → navigate `/settings` → assert Web IDE **Running** → click **Stop** → assert Stopped copy |
| 9 | Create project (BTS) | `/` **Create project** sheet | “Scaffold better-t-stack under a registered root. The equivalent CLI updates as you pick options — then the job runs on the server.” | Sheet “Create a new project”; live command preview; progress; success toast with Open project | Open sheet → choose root + project name (unique) → keep defaults or one visible change → submit **Create project** → wait success toast (or show progress then cut) → optional Open project |
| 10 | Clone script & settings close | `/` Clone script sheet → `/settings` | “Clone script is the leave-behind: SSH clones into the same working paths. Settings is roots, editor/terminal/snitch, hidden projects, IDE lifecycle.” | Clone script sheet; Copy / `.sh`; Settings tracked directories + Save | Click **Clone script** → select All or a couple remotes → **Copy** or download `.sh` → close sheet → open Settings → scroll roots / commands / Web IDE → back to `/` |

---

## Recommended short path (~5–7 min)

If timeboxed, keep the spine and cut depth:

1. **Cold open with roots already configured** (skip full empty-state, or a 10 s flash of empty → add if store allows).
2. **Needs attention → open project → pin on return → one-line note** (Scene 2, compressed).
3. **`/` filter + Refresh** (Scene 3, ~30 s).
4. **One project: Fetch + remote link + Report** (Scenes 4–6 trimmed; skip branch switch and push unless safe).
5. **File browser: open one file** (Scene 7; skip create/delete).
6. **Open IDE** only if pre-warmed (Scene 8); otherwise skip and mention Settings “Stopped / Not installed”.
7. **Create project:** open sheet, show command preview, **do not wait for full scaffold** unless already under ~60 s.
8. **Clone script Copy** + Settings glance (Scene 10).

**Drop first under pressure:** Create project full wait, branch switch, file mutations, IDE first-install, empty-store setup.

**Keep if at all possible:** Needs attention, `/` filter, Fetch, Report tab, Clone script — that’s the product thesis.

---

## Agent-browser validation checklist (plan-level)

Enough to walk the plan without writing a script file:

- **Navigate:** `/`, `/settings`, `/projects/<absolute-path-splat>`, `/reports/<key>` (key from Report flow).
- **Click:** labeled buttons and aria-labels above (`Add directory`, `Refresh`, `Clone script`, `Create project`, pin, `Fetch`/`Pull`/`Push`, `Report`, `Open IDE`, `Stop`, context-menu items).
- **Type:** root path, filter query, note textarea, scaffold project name, optional branch name.
- **Keys:** `/` focus filter; `Escape` clear filter when search focused.
- **Wait:** scan load (skeletons → content); mutation toasts; report/IDE tab navigation; scaffold job poll.
- **Assert:** empty vs populated home; Needs attention count; pin in Pinned section; filter “No projects match”; git toasts; report HTML; IDE Running/Stopped; clone selection count.

Popup tabs (Report, IDE) are first-class: prefer asserting the new tab URL/content, with toast “Open” as fallback if the blank tab was blocked.

---

## Risks / flakiness

| Risk | Mitigation |
|------|------------|
| Empty-state take wipes real roots | Separate store/profile or restore `store.json` after validation |
| Needs attention empty | Seed dirty / behind / alert-producing repos before the take |
| Popup blocker kills Report / IDE tabs | Allow popups; fall back to toast **Open** |
| First IDE install / first snitch npx | Pre-warm once; don’t record cold download |
| Scaffold duration / single-flight | Unique project name; don’t start a second job; cut after progress if long |
| Git push / branch switch on dirty or diverged | Prefer Fetch + Pull on a disposable repo; avoid push to shared main |
| File delete without `gio` | Expect permanent-delete copy; only delete `demo-tmp` |
| Open editor / Terminal | Host-only; click + toast is enough for browser automation |
| Scan cache staleness | Hit **Refresh** after external git changes |
| Absolute paths in `/projects/$` | URL splat must match scan paths exactly |
| Filter hijack | Don’t press `/` while focused in an input (app intentionally ignores that) |

---

## Explicit hold

**DO NOT RECORD YET — awaiting validation.**

Validate this plan against a live `http://localhost:37420` session (human or agent-browser dry run) before writing a capture script or pressing record. Adjust sample data and the short path first; keep this file as the spine.
)
