import type {
  IdeationFileTree,
  IdeationFileTreeEntry,
  IdeationGitSummary,
  IdeationProjectContext,
  IdeationReadmeSummary,
  IdeationStackSummary,
} from "./context";
import type { IdeationMessage } from "./shared";

/**
 * The ported prompts (PRD §4.1 prompts.ts row), rebuilt as pure builder
 * functions over the gathered project context: the grill persona for the
 * questioning phase and the PRD / vertical-slices plan templates for artifact
 * generation.
 *
 * Personas, rules, and template sections are preserved from the port source
 * (`ideadump/packages/ideadump-lib/src/prompts.ts`); the adaptations are
 * de-branding (no ideadump mentions in the prompt text), rendering the frozen
 * IdeationProjectContext (stack description, trimmed file tree, README
 * excerpt, git state) into every prompt, a pure-markdown output rule on the
 * PRD prompt, and a plan-against-the-real-stack principle on the plan prompt.
 * ideadump's side-chat prompt is deliberately not ported (PRD §2 non-goal).
 *
 * Pure string building only — no Node imports, no fs/env/global access;
 * everything derives from the arguments. The grill decision's JSON shapes
 * named in the grill prompt are owned by grillDecisionSchema in shared.ts
 * (PRD §4.2) and are deliberately not redefined here.
 */

/** Prompt-side README trim, kept well below the gatherer's own cap. */
const README_EXCERPT_MAX_CHARS = 2_000;

/** Rendered file-tree line budget before the listing is cut with a note. */
const FILE_TREE_MAX_LINES = 120;

/** Recent commits included in the git section (the gatherer also caps at 5). */
const RECENT_COMMITS_MAX = 5;

// --- prompt builders ----------------------------------------------------------

/**
 * System prompt for the grilling phase — the ported persona, de-branded: one
 * question at a time, direct, skeptical, and relentless, 0-4 suggestedAnswers,
 * and the two grillDecisionSchema output shapes. The idea and the frozen
 * project context ride inline; the live question/answer turns flow as the
 * conversation itself and are never baked into the system prompt.
 */
export function grillSystemPrompt(context: IdeationProjectContext): string {
  return `You are the ideation panel's grilling interviewer.

Goal: turn a rough idea into a resolved, implementation-ready understanding by closing loopholes and walking the user's decision tree one dependency at a time.

Rules:
- Ask exactly one question at a time.
- Each question must be directly related to the current idea, prior answers, or an unresolved dependency.
- Prefer branching and dependency questions over generic brainstorming.
- Be direct, skeptical, and relentless, but helpful.
- Do not summarize at length.
- Do not ask multiple-choice questions unless the options clarify a real decision.
- Do not advance past an ambiguity, contradiction, missing owner, missing constraint, or hand-wavy claim.
- If the idea is sufficiently resolved for planning, stop asking questions.
- You MAY include 0-4 'suggestedAnswers' with a question: short, concrete candidate answers the user could pick or adapt. An empty array is valid; omit entirely if no useful options exist.
- The project context below is real: ground your questions in the actual stack, files, and git state, and probe how the idea fits what already exists.

Return only valid structured output in one of these shapes:
{"status":"question","question":"...","suggestedAnswers":["...","..."]}
{"status":"complete","reason":"..."}

Decide the single most important unresolved thing. Ask about that, or complete if nothing material remains.

${renderIdea(context.idea)}

${renderProjectContext(context)}`;
}

/**
 * Complete prompt for PRD generation — the ported PRD writer persona and
 * template with section headings kept verbatim, extended with the pure-markdown
 * output rule, followed by the idea, the grilling question history, and the
 * frozen project context.
 */
export function prdPrompt(
  context: IdeationProjectContext,
  questionHistory: readonly IdeationMessage[],
): string {
  return `You are the ideation panel's PRD writer.

Create a concise markdown PRD from the original idea, grilling question history, answers, and the gathered project context.

Rules:
- Use only information supported by the provided context/history.
- If an important point is unknown, write "TBD" rather than inventing.
- Be concise, specific, and implementation-oriented.
- Resolve terminology consistently.
- Avoid marketing fluff.
- Include risks, non-goals, and open questions when relevant.
- Output the PRD as pure markdown matching the structure below — same headings, same order — with no text before or after the document and no surrounding code fence.

Return markdown with this structure:

# PRD: <short product/feature name>

## Summary
<one short paragraph>

## Problem
<what pain or opportunity this addresses>

## Goals
- <goal>

## Non-Goals
- <non-goal or TBD>

## Users
- <user/persona>

## Requirements
### Functional
- <requirement>

### Non-Functional
- <requirement>

## User Flow
1. <step>

## Scope
### In Scope
- <item>

### Out of Scope
- <item>

## Success Metrics
- <metric or TBD>

## Risks and Tradeoffs
- <risk/tradeoff>

## Open Questions
- <question or "None">

${renderIdea(context.idea)}

${renderQuestionHistory(questionHistory)}

${renderProjectContext(context)}`;
}

/**
 * Complete prompt for implementation-plan generation — the ported
 * vertical-slices planner persona and template with section headings kept
 * verbatim, extended with the plan-against-the-real-stack principle, followed
 * by the PRD it plans from, the idea, the grilling question history, and the
 * frozen project context.
 */
export function planPrompt(
  context: IdeationProjectContext,
  prd: string,
  questionHistory: readonly IdeationMessage[],
): string {
  return `You are the ideation panel's implementation planner.

Create a markdown implementation plan from the PRD, grilling history, original idea, and the gathered project context.

Planning principles:
- Plan against the real stack in the project context below — its frameworks, package manager, and conventions; never assume a different stack, and use that package manager in every command you write.
- Prefer vertical slices that deliver observable value end-to-end.
- Make tasks independently grabbable where possible.
- Include validation for every slice.
- Identify dependencies explicitly.
- Keep the plan practical for an engineering agent or developer.
- Do not invent requirements beyond the provided context. Use TBD for unknowns.
- Favor small, testable increments over big-bang phases.
- Include build/test/lint/manual validation where appropriate.

Return markdown with this structure:

# Implementation Plan: <short name>

## Overview
<brief summary of the approach>

## Assumptions
- <assumption or TBD>

## Dependencies
- <dependency or None>

## Vertical Slices

### Slice 1: <name>
**Outcome:** <user-visible or system-visible result>
**Tasks:**
- [ ] <task>
- [ ] <task>
**Validation:**
- <test/check/manual verification>
**Risks:**
- <risk or None>

### Slice 2: <name>
**Outcome:** <result>
**Tasks:**
- [ ] <task>
**Validation:**
- <test/check>
**Risks:**
- <risk or None>

## Cross-Cutting Work
- [ ] <task such as docs, telemetry, migration, cleanup, security review, or None>

## Final Validation
- [ ] <end-to-end check>
- [ ] <regression check>
- [ ] <documentation or handoff check>

## Open Questions
- <question or None>

# Current PRD
${prd}

${renderIdea(context.idea)}

${renderQuestionHistory(questionHistory)}

${renderProjectContext(context)}`;
}

// --- input blocks -------------------------------------------------------------

/** The user-typed idea, verbatim, under its own heading. */
function renderIdea(idea: string): string {
  return `# Idea\n${idea}`;
}

/**
 * The question history block — the ported renderHistory shape: `role: content`
 * lines under the heading, or the explicit empty marker when nothing was asked
 * yet.
 */
function renderQuestionHistory(history: readonly IdeationMessage[]): string {
  if (history.length === 0) {
    return "# Question History\nNo messages yet.";
  }
  const turns = history.map((message) => `${message.role}: ${message.content}`);
  return `# Question History\n${turns.join("\n")}`;
}

/**
 * The frozen gatherer output as one compact context block (PRD §4.1): the
 * stack description plus its key fields, a line-budgeted file-tree listing, a
 * trimmed README excerpt, and the git state. Optional components are omitted
 * rather than rendered as placeholders; only the stack section always renders,
 * so the plan prompt's real-stack principle has a defined target.
 */
function renderProjectContext(context: IdeationProjectContext): string {
  const sections: string[] = [
    renderStackSection(context.stack),
    renderFileTreeSection(context.fileTree),
  ];
  const readme = renderReadmeSection(context.readme);
  if (readme !== null) sections.push(readme);
  if (context.git !== null) sections.push(renderGitSection(context.git));
  return ["# Project Context", ...sections].join("\n\n");
}

/** Stack headline sentence plus the raw selection behind it; guides the null case to tree/README. */
function renderStackSection(stack: IdeationStackSummary | null): string {
  if (stack === null) {
    return [
      "## Stack",
      "No bts.jsonc — this project was not scaffolded by better-t-stack;",
      "infer the stack from the file tree and README below.",
    ].join("\n");
  }

  const lines = [
    stack.description,
    `- package manager: ${stack.packageManager}`,
  ];
  const optional: Array<[string, string | null]> = [
    ["frontends", stack.frontends.length > 0 ? stack.frontends.join(", ") : null],
    ["native", stack.native],
    [
      "backend",
      stack.backend === null
        ? null
        : stack.backend === "self"
          ? "self (server routes inside the app)"
          : stack.backend,
    ],
    ["runtime", stack.runtime],
    ["api", stack.api],
    ["database", stack.database],
    ["orm", stack.orm],
    ["auth", stack.auth],
    ["payments", stack.payments],
    ["web deploy", stack.webDeploy],
    ["server deploy", stack.serverDeploy],
    ["addons", stack.addons.length > 0 ? stack.addons.join(", ") : null],
  ];
  for (const [label, value] of optional) {
    if (value !== null) lines.push(`- ${label}: ${value}`);
  }
  return `## Stack\n${lines.join("\n")}`;
}

/** Line budget shared across the recursive tree walk. */
interface TreeLineBudget {
  /** Lines still allowed before the listing is cut. */
  remaining: number;
  /** Set when the line budget cut the listing short. */
  trimmed: boolean;
}

function renderFileTreeSection(tree: IdeationFileTree): string {
  const budget: TreeLineBudget = {
    remaining: FILE_TREE_MAX_LINES,
    trimmed: false,
  };
  const lines: string[] = [];
  renderTreeLines(tree.entries, 0, budget, lines);

  const notes: string[] = [];
  if (tree.truncated) notes.push("gathering caps omitted entries");
  if (budget.trimmed) notes.push(`listing trimmed to ${FILE_TREE_MAX_LINES} lines`);
  const suffix = notes.length > 0 ? `; ${notes.join("; ")}` : "";

  return [
    `## File Tree (depth ≤ ${tree.maxDepth}, ${tree.entryCount} entries${suffix})`,
    ...(lines.length > 0 ? lines : ["(no readable files)"]),
  ].join("\n");
}

function renderTreeLines(
  entries: readonly IdeationFileTreeEntry[],
  depth: number,
  budget: TreeLineBudget,
  lines: string[],
): void {
  for (const entry of entries) {
    if (budget.remaining <= 0) {
      budget.trimmed = true;
      return;
    }
    budget.remaining--;
    lines.push(`${"  ".repeat(depth)}${entry.name}${entry.kind === "dir" ? "/" : ""}`);
    if (entry.kind === "dir") {
      renderTreeLines(entry.children, depth + 1, budget, lines);
    }
  }
}

/** README excerpt under the matched file name; null when absent or empty. */
function renderReadmeSection(readme: IdeationReadmeSummary | null): string | null {
  if (readme === null) return null;
  const excerpt =
    readme.content.length > README_EXCERPT_MAX_CHARS
      ? readme.content.slice(0, README_EXCERPT_MAX_CHARS)
      : readme.content;
  if (excerpt.trim().length === 0) return null;
  const note =
    excerpt.length < readme.totalLength
      ? `\n(first ${excerpt.length} of ${readme.totalLength} characters)`
      : "";
  return `## README (${readme.file})\n${excerpt.trimEnd()}${note}`;
}

function renderGitSection(git: IdeationGitSummary): string {
  const lines: string[] = [];
  if (git.branch !== null) lines.push(`- branch: ${git.branch}`);
  if (git.clean === true) {
    lines.push("- working tree: clean");
  } else if (git.dirtyCount !== null) {
    lines.push(
      `- working tree: ${git.dirtyCount} uncommitted change${git.dirtyCount === 1 ? "" : "s"}`,
    );
  }
  if (git.ahead !== null || git.behind !== null) {
    lines.push(`- vs upstream: ${git.ahead ?? "?"} ahead, ${git.behind ?? "?"} behind`);
  }
  if (git.lastCommit !== null) {
    const when =
      git.lastCommit.date === null ? "" : `, ${dayOf(git.lastCommit.date)}`;
    lines.push(
      `- last commit: ${firstLine(git.lastCommit.message)} (${git.lastCommit.author}${when})`,
    );
  }
  const commits = git.recentCommits.slice(0, RECENT_COMMITS_MAX);
  if (commits.length > 0) {
    lines.push("- recent commits:");
    for (const commit of commits) {
      lines.push(
        `  - ${commit.hash} ${commit.subject} (${commit.author}, ${dayOf(commit.date)})`,
      );
    }
  }
  if (lines.length === 0) return "## Git\nNo git state available.";
  return `## Git\n${lines.join("\n")}`;
}

/** First line only — commit messages can be multi-line. */
function firstLine(text: string): string {
  return text.split("\n", 1)[0] ?? "";
}

/** ISO timestamp → its YYYY-MM-DD date part. */
function dayOf(iso: string): string {
  return iso.slice(0, 10);
}
