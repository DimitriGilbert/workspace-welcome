import {
  appendFile,
  mkdir,
  readFile,
  readdir,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import { z } from "zod";

import { resolveInside } from "../file-ops";
import { newId } from "../id";
import { requireKnownProject } from "../known-project";
import { scaffoldInputSchema } from "../scaffold-options";
import { gatherProjectContext } from "./context";
import {
  gradesSchema,
  ideationMessageSchema,
  ideationModelSetSchema,
  ideationPhaseSchema,
  ideationStepSchema,
} from "./shared";
import type { ScaffoldInput } from "../scaffold-options";
import type { IdeationProjectContext } from "./context";
import type {
  CandidateMatter,
  GrillDecision,
  IdeationArtifactKind,
  IdeationArtifactStatus,
  IdeationGrade,
  IdeationMessage,
  IdeationModelSet,
  IdeationPhase,
  IdeationSession,
  IdeationStep,
} from "./shared";

/**
 * Disk-backed ideation sessions (PRD §4.1 session.ts, §5): the phase state
 * machine over the shared session shape, every read/write of the
 * `.ideadump/ideation/<sessionId>/` tree — session.json and the frozen
 * context.json, append-only transcript.jsonl and grades.jsonl, per-model
 * candidate files with their matter front matter — and the write-once save
 * of the final docs/PRD.md / docs/PLAN.md artifacts.
 *
 * Containment (PRD §4.6): every path this module touches, read or write, is
 * a relative target resolved through requireKnownProject + resolveInside;
 * violations throw before anything is written. Sessions never depend on
 * process lifetime — state lives in session.json, so a dev-server restart
 * resumes from disk (PRD §7).
 *
 * Turn discipline for callers (SSE route / fanout engine): generate the
 * step → writeCandidate per model (in fan-out also the reconciler's merged
 * markdown, under the reconciler's own catalog id) → appendTranscript for
 * the completed turn → apply the phase transition → saveSession. State
 * transitions only happen on success, so a step interrupted mid-generation
 * leaves the session at its previous phase and a re-run is safe.
 *
 * Server-only on purpose (Node throughout); the client-safe shapes live in
 * ideation/shared.ts.
 */

// --- layout constants (PRD §5) --------------------------------------------------

/**
 * The on-disk layout, exported so routers and future readers share one
 * truth. IDEADUMP_DIR_NAME is the ".ideadump" literal context.ts adds to
 * the scanner denylist — keep the two in sync.
 */
export const IDEADUMP_DIR_NAME = ".ideadump";
export const IDEATION_DIR_NAME = "ideation";
export const SESSION_FILE_NAME = "session.json";
export const CONTEXT_FILE_NAME = "context.json";
export const TRANSCRIPT_FILE_NAME = "transcript.jsonl";
export const GRADES_FILE_NAME = "grades.jsonl";
export const CANDIDATES_DIR_NAME = "candidates";

/** Write-once final artifact targets, relative to the project root. */
export const ARTIFACT_TARGETS: Readonly<Record<IdeationArtifactKind, string>> =
  Object.freeze({
    prd: "docs/PRD.md",
    plan: "docs/PLAN.md",
  });

/** The .gitignore line the save flow appends once when missing (PRD §8). */
const GITIGNORE_ENTRY = ".ideadump/";

/**
 * Session ids are newId() UUIDs, but ids also arrive from the wire, so every
 * use as a path segment revalidates against this pattern first — defense in
 * depth on top of resolveInside (no separators, no dot aliases, no leading
 * dash).
 */
const SESSION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

function sessionDirRel(sessionId: string): string {
  if (!SESSION_ID_PATTERN.test(sessionId)) {
    throw new Error(`Invalid ideation session id: ${sessionId}`);
  }
  return `${IDEADUMP_DIR_NAME}/${IDEATION_DIR_NAME}/${sessionId}`;
}

// --- write plumbing -------------------------------------------------------------

/**
 * Serializes this module's writes in-process (store.ts's queueWrite
 * discipline, reimplemented locally — it is private there) so concurrent
 * callers can neither interleave a session.json rewrite with appends nor
 * collide on temp-file names.
 */
let inFlight: Promise<unknown> = Promise.resolve();

function queueWrite<T>(next: () => Promise<T>): Promise<T> {
  const run = inFlight.then(next, next);
  // Keep the chain alive without surfacing rejections to subsequent writes.
  inFlight = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/**
 * Atomic file write: temp file inside the target's own directory + rename,
 * with the cross-device fallback from store.ts's persistRaw. The caller
 * must already have resolved the target through resolveInside.
 */
async function atomicWrite(target: string, data: string): Promise<void> {
  const dir = dirname(target);
  await mkdir(dir, { recursive: true });
  const tmp = join(dir, `.${basename(target)}.${process.pid}.${Date.now()}.tmp`);
  await writeFile(tmp, data, "utf8");
  try {
    await rename(tmp, target);
  } catch (err) {
    // rename can fail across devices in some setups; fall back to copy+unlink.
    if ((err as NodeJS.ErrnoException).code !== "EXDEV") {
      await unlink(tmp).catch(() => undefined);
      throw err;
    }
    const contents = await readFile(tmp, "utf8");
    await writeFile(target, contents, "utf8");
    await unlink(tmp).catch(() => undefined);
  }
}

/** Append one JSON value as a line to an append-only .jsonl file. */
async function appendJsonlLine(file: string, value: unknown): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  await appendFile(file, `${JSON.stringify(value)}\n`, "utf8");
}

function ensureTrailingNewline(text: string): string {
  return text.endsWith("\n") ? text : `${text}\n`;
}

/** stat-based existence probe; rethrows anything that is not ENOENT. */
async function fileExists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    (err: NodeJS.ErrnoException) => {
      if (err.code === "ENOENT") return false;
      throw err;
    },
  );
}

// --- phase machine (PRD §4.2) ---------------------------------------------------
//
// Pure transitions over a loaded IdeationSession — no disk IO here. Ported
// from ideadump's state.ts/runners.ts minus side-chat and the `refining`
// phase; recordGrillAnswer keeps the ported append semantics verbatim.

function requirePhase(
  session: IdeationSession,
  phase: IdeationPhase,
  action: string,
): void {
  if (session.phase !== phase) {
    throw new Error(
      `Cannot ${action} while the session is in the "${session.phase}" phase (expected "${phase}").`,
    );
  }
}

/** createMessage port (ideadump state.ts): stamps the ISO timestamp. */
export function createIdeationMessage(
  role: IdeationMessage["role"],
  content: string,
  suggestedAnswers?: readonly string[],
): IdeationMessage {
  return {
    role,
    content,
    createdAt: new Date().toISOString(),
    ...(suggestedAnswers !== undefined && suggestedAnswers.length > 0
      ? { suggestedAnswers: [...suggestedAnswers] }
      : {}),
  };
}

/** recordGrillAnswer port (ideadump runners.ts): append the user's answer. */
export function recordGrillAnswer(
  session: IdeationSession,
  answer: string,
): IdeationSession {
  requirePhase(session, "grilling", "record a grill answer");
  return {
    ...session,
    questionHistory: [
      ...session.questionHistory,
      createIdeationMessage("user", answer),
    ],
  };
}

/**
 * applyGrillDecision port (grillResultFromDecision): a "question" decision
 * appends the assistant question — suggested answers hoisted onto the
 * message from ideadump's metadata field — and stays in grilling;
 * "complete" moves the session to the prd phase.
 */
export function applyGrillDecision(
  session: IdeationSession,
  decision: GrillDecision,
): IdeationSession {
  requirePhase(session, "grilling", "apply a grill decision");
  if (decision.status === "complete") {
    return { ...session, phase: "prd" };
  }
  return {
    ...session,
    questionHistory: [
      ...session.questionHistory,
      createIdeationMessage("assistant", decision.question, decision.suggestedAnswers),
    ],
  };
}

/** A finished PRD moves the session to planning (prdResultFromContent port). */
export function completePrd(session: IdeationSession): IdeationSession {
  requirePhase(session, "prd", "complete the PRD");
  return { ...session, phase: "planning" };
}

/** A finished plan completes the session (planResultFromContent port). */
export function completePlan(session: IdeationSession): IdeationSession {
  requirePhase(session, "planning", "complete the plan");
  return { ...session, phase: "done" };
}

// --- session.json ---------------------------------------------------------------

const artifactStatusSchema = z.object({
  path: z.string().min(1),
  savedAt: z.string().min(1),
});

const sessionSchema = z.object({
  id: z.string().min(1),
  projectPath: z.string().min(1),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  phase: ideationPhaseSchema,
  idea: z.string(),
  scaffoldInput: scaffoldInputSchema.nullable(),
  questionHistory: z.array(ideationMessageSchema),
  models: ideationModelSetSchema,
  artifacts: z.object({
    prd: artifactStatusSchema.optional(),
    plan: artifactStatusSchema.optional(),
  }),
});

export interface CreateSessionInput {
  projectPath: string;
  /** The user-typed idea, verbatim. */
  idea: string;
  /** Scaffold-wizard seed frozen at start (deep-link flow); null when absent. */
  scaffoldInput?: ScaffoldInput | null;
  /**
   * The session's model set, copied verbatim into session.json's models
   * block so later settings changes never rewrite provenance. Structurally
   * the flat IdeationModelSet — flatten settings.ideation first:
   * `{ ...settings.ideation.models, reconciler: settings.ideation.reconciler }`.
   */
  models: IdeationModelSet;
}

export interface CreateSessionResult {
  sessionId: string;
  /** Short human-readable summary of the frozen context (panel display). */
  contextSummary: string;
}

/**
 * Start a session: gather and freeze the project context, then write
 * `.ideadump/ideation/<sessionId>/{session.json, context.json}`. The gather
 * runs before anything is written, so a failing gather leaves no trace.
 */
export async function createSession(
  input: CreateSessionInput,
): Promise<CreateSessionResult> {
  if (input.idea.trim().length === 0) {
    throw new Error("An idea is required to start an ideation session.");
  }
  const models = ideationModelSetSchema.parse(input.models);
  const projectPath = await requireKnownProject(input.projectPath);
  const { context, contextSummary } = await gatherProjectContext(
    projectPath,
    input.idea,
  );
  const sessionId = newId();
  const now = new Date().toISOString();
  const session: IdeationSession = {
    id: sessionId,
    projectPath,
    createdAt: now,
    updatedAt: now,
    phase: "grilling",
    idea: input.idea,
    scaffoldInput: input.scaffoldInput ?? null,
    questionHistory: [],
    models: {
      questions: [...models.questions],
      prd: [...models.prd],
      plan: [...models.plan],
      reconciler: models.reconciler,
    },
    artifacts: {},
  };
  const dirRel = sessionDirRel(sessionId);
  const sessionFile = await resolveInside(
    projectPath,
    `${dirRel}/${SESSION_FILE_NAME}`,
  );
  const contextFile = await resolveInside(
    projectPath,
    `${dirRel}/${CONTEXT_FILE_NAME}`,
  );
  await queueWrite(async () => {
    // context.json freezes the gatherer output verbatim — plain JSON,
    // trusted on resume without re-validation (Phase 2 handoff contract).
    await atomicWrite(contextFile, JSON.stringify(context, null, 2));
    await atomicWrite(sessionFile, JSON.stringify(session, null, 2));
  });
  return { sessionId, contextSummary };
}

/**
 * Load session.json. Returns null when it does not exist; throws when it is
 * corrupt or belongs to a different project — both surfaced to the caller.
 */
export async function loadSession(
  projectPath: string,
  sessionId: string,
): Promise<IdeationSession | null> {
  const abs = await requireKnownProject(projectPath);
  const file = await resolveInside(
    abs,
    `${sessionDirRel(sessionId)}/${SESSION_FILE_NAME}`,
  );
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      `Ideation session ${sessionId} has a corrupt ${SESSION_FILE_NAME}.`,
    );
  }
  const result = sessionSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `Ideation session ${sessionId} has an unreadable ${SESSION_FILE_NAME}: ${result.error.message}`,
    );
  }
  const session: IdeationSession = result.data;
  if (session.projectPath !== abs) {
    throw new Error(
      `Ideation session ${sessionId} belongs to a different project (${session.projectPath}).`,
    );
  }
  return session;
}

/**
 * Persist a session atomically, stamping updatedAt. The write is merge-based:
 * the session.json on disk is reloaded inside the write section and only the
 * turn-owned fields (phase, questionHistory) come from the caller's snapshot,
 * so a concurrent artifacts.save's merged artifacts block survives. Returns
 * the persisted snapshot (the authoritative one — its updatedAt is fresh);
 * the input is never mutated.
 */
export async function saveSession(
  session: IdeationSession,
): Promise<IdeationSession> {
  const projectPath = await requireKnownProject(session.projectPath);
  const file = await resolveInside(
    projectPath,
    `${sessionDirRel(session.id)}/${SESSION_FILE_NAME}`,
  );
  return queueWrite(async () => {
    // Lost-update guard, the turn-side twin of saveArtifacts' below: the
    // current session.json is reloaded inside this one write section and
    // ONLY the fields a chat turn owns (phase, questionHistory) are merged
    // onto the fresh record — so an artifacts block a concurrent
    // artifacts.save just merged in is never reverted by the turn's stale
    // entry-time snapshot. The write is inlined (not saveSession) because
    // queueWrite is not reentrant.
    const fresh = await loadSession(projectPath, session.id);
    if (fresh === null) {
      // No session.json yet (first save of a fresh session): write the
      // caller's snapshot as-is.
      const stamped: IdeationSession = {
        ...session,
        updatedAt: new Date().toISOString(),
      };
      await atomicWrite(file, JSON.stringify(stamped, null, 2));
      return stamped;
    }
    const merged: IdeationSession = {
      ...fresh,
      phase: session.phase,
      questionHistory: session.questionHistory,
      updatedAt: new Date().toISOString(),
    };
    await atomicWrite(file, JSON.stringify(merged, null, 2));
    return merged;
  });
}

/**
 * Append one completed chat turn to transcript.jsonl — the append-only
 * audit log; session.json's questionHistory remains the replay source.
 */
export async function appendTranscript(
  projectPath: string,
  sessionId: string,
  message: IdeationMessage,
): Promise<void> {
  const abs = await requireKnownProject(projectPath);
  const parsed = ideationMessageSchema.parse(message);
  const file = await resolveInside(
    abs,
    `${sessionDirRel(sessionId)}/${TRANSCRIPT_FILE_NAME}`,
  );
  await queueWrite(() => appendJsonlLine(file, parsed));
}

/**
 * Append one reconcile decision to grades.jsonl: a single line carrying the
 * step plus all N grades (PRD §5, criterion 6), stamped with the decision
 * time.
 */
export async function appendGrade(
  projectPath: string,
  sessionId: string,
  step: IdeationStep,
  grades: IdeationGrade[],
): Promise<void> {
  const abs = await requireKnownProject(projectPath);
  const parsedStep = ideationStepSchema.parse(step);
  const parsedGrades = gradesSchema.parse(grades);
  const file = await resolveInside(
    abs,
    `${sessionDirRel(sessionId)}/${GRADES_FILE_NAME}`,
  );
  const record = {
    step: parsedStep,
    grades: parsedGrades,
    timestamp: new Date().toISOString(),
  };
  await queueWrite(() => appendJsonlLine(file, record));
}

/** One row of sessions.list — the panel's resume picker shape. */
export interface IdeationSessionSummary {
  id: string;
  phase: IdeationPhase;
  /** The original idea text; the picker truncates for display. */
  idea: string;
  createdAt: string;
  updatedAt: string;
  /** Artifact kinds already saved to docs/ from this session. */
  savedArtifacts: IdeationArtifactKind[];
}

/**
 * Session summaries for a project, newest-updated first. Sessions whose
 * session.json cannot be read are skipped — one corrupt directory must not
 * hide the rest.
 */
export async function listSessions(
  projectPath: string,
): Promise<IdeationSessionSummary[]> {
  const abs = await requireKnownProject(projectPath);
  const root = await resolveInside(
    abs,
    `${IDEADUMP_DIR_NAME}/${IDEATION_DIR_NAME}`,
  );
  const dirents = await readdir(root, { withFileTypes: true }).catch(
    (err: NodeJS.ErrnoException) => {
      if (err.code === "ENOENT") return null;
      throw err;
    },
  );
  if (dirents === null) return [];
  const loaded = await Promise.all(
    dirents
      .filter((d) => d.isDirectory() && SESSION_ID_PATTERN.test(d.name))
      .map((d) => loadSession(abs, d.name).catch(() => null)),
  );
  return loaded
    .filter((s): s is IdeationSession => s !== null)
    .map((s) => ({
      id: s.id,
      phase: s.phase,
      idea: s.idea,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      savedArtifacts: (
        Object.keys(ARTIFACT_TARGETS) as IdeationArtifactKind[]
      ).filter((kind) => s.artifacts[kind] !== undefined),
    })).sort(
      (a, b) =>
        b.updatedAt.localeCompare(a.updatedAt) ||
        b.createdAt.localeCompare(a.createdAt),
    );
}

/**
 * Read the frozen context.json. Deliberately trusted as-is on resume — the
 * value was gathered and frozen verbatim at session start, and no zod
 * re-validation exists or is wanted (Phase 2 handoff contract).
 */
export async function readContext(
  projectPath: string,
  sessionId: string,
): Promise<IdeationProjectContext> {
  const abs = await requireKnownProject(projectPath);
  const file = await resolveInside(
    abs,
    `${sessionDirRel(sessionId)}/${CONTEXT_FILE_NAME}`,
  );
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(
        `Ideation session ${sessionId} has no ${CONTEXT_FILE_NAME}.`,
      );
    }
    throw err;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      `Ideation session ${sessionId} has a corrupt ${CONTEXT_FILE_NAME}.`,
    );
  }
  return parsed as IdeationProjectContext;
}

// --- matter (PRD §5) -------------------------------------------------------------

type MatterValue = string | number | string[];

/**
 * True for strings YAML's implicit typing would read back as a non-string —
 * integers/decimals and the true/false/null literals, case-insensitive as
 * YAML resolves them — so string matter fields force double quoting and stay
 * strings on round-trip.
 */
function looksImplicitlyTypedYamlScalar(value: string): boolean {
  return (
    /^-?\d+(\.\d+)?$/.test(value) || /^(?:true|false|null)$/i.test(value)
  );
}

/**
 * True when the string round-trips as an unquoted YAML scalar. Conservative:
 * control characters, leading/trailing space, a leading YAML indicator, an
 * embedded ": ", a trailing ":", an embedded " #", or an implicitly typed
 * scalar (number / boolean / null literal) force double quoting.
 */
function isPlainYamlScalar(value: string): boolean {
  return (
    value.length > 0 &&
    !/[\u0000-\u001f\u007f]/.test(value) &&
    value === value.trim() &&
    !/^[-?:,[\]{}#&*!|>'"%@`]/.test(value) &&
    !value.includes(": ") &&
    !value.endsWith(":") &&
    !value.includes(" #") &&
    !looksImplicitlyTypedYamlScalar(value)
  );
}

function yamlDoubleQuoted(value: string): string {
  const escaped = value
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replaceAll("\r", "\\r")
    .replaceAll("\n", "\\n")
    .replaceAll("\t", "\\t");
  return `"${escaped}"`;
}

function yamlScalar(value: string): string {
  return isPlainYamlScalar(value) ? value : yamlDoubleQuoted(value);
}

/** Render a matter block; field order is the caller's (the PRD §5 order). */
function renderMatterBlock(fields: [string, MatterValue][]): string {
  const lines = fields.map(([key, value]) => {
    const rendered = Array.isArray(value)
      ? `[${value.map(yamlDoubleQuoted).join(", ")}]`
      : typeof value === "number"
        ? String(value)
        : yamlScalar(value);
    return `${key}: ${rendered}`;
  });
  return `---\n${lines.join("\n")}\n---\n\n`;
}

const MATTER_BLOCK_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;
const MATTER_LINE_PATTERN = /^([A-Za-z0-9_-]+):\s?(.*)$/;

/**
 * Unescape one double-quoted scalar in a single left-to-right pass: each
 * backslash pair is consumed atomically, so a literal "\\n"-style two-char
 * sequence (backslash escape + letter) can never corrupt an earlier escape's
 * output the way sequential replaceAll passes did.
 */
function parseYamlScalar(raw: string): string {
  if (raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"')) {
    return raw.slice(1, -1).replace(/\\(.)/g, (match, escaped: string) => {
      switch (escaped) {
        case "\\":
          return "\\";
        case '"':
          return '"';
        case "n":
          return "\n";
        case "r":
          return "\r";
        case "t":
          return "\t";
        default:
          return match;
      }
    });
  }
  return raw;
}

function parseYamlValue(raw: string): MatterValue {
  if (/^-?\d+$/.test(raw)) return Number.parseInt(raw, 10);
  if (raw.startsWith("[") && raw.endsWith("]")) {
    const inner = raw.slice(1, -1).trim();
    if (inner === "") return [];
    return inner.split(/,\s*/).map((item) => parseYamlScalar(item.trim()));
  }
  return parseYamlScalar(raw);
}

export type MatterFields = Record<string, MatterValue>;

export interface ParsedMatter {
  matter: MatterFields | null;
  /** Everything after the matter block (one separating newline stripped). */
  body: string;
}

/**
 * Parse the YAML front-matter subset this module emits — flat scalars and
 * one flow-style string array per line — enough to read candidate and
 * artifact matter back without a YAML dependency (PRD §9 criterion 7).
 * `matter` is null when the text carries no leading block.
 */
export function parseMatterBlock(text: string): ParsedMatter {
  const match = MATTER_BLOCK_PATTERN.exec(text);
  if (match === null) return { matter: null, body: text };
  const matter: MatterFields = {};
  for (const line of (match[1] ?? "").split(/\r?\n/)) {
    const lineMatch = MATTER_LINE_PATTERN.exec(line);
    const key = lineMatch?.[1];
    if (lineMatch === null || key === undefined) continue;
    matter[key] = parseYamlValue(lineMatch[2] ?? "");
  }
  return {
    matter,
    body: text.slice(match[0].length).replace(/^\r?\n/, ""),
  };
}

// --- candidates (PRD §5) ----------------------------------------------------------

const candidateMatterSchema = z.object({
  step: ideationStepSchema,
  model: z.string().min(1),
  timestamp: z.string().min(1),
  score: z.number().int().min(0).max(10).optional(),
  rationale: z.string().min(1).optional(),
  error: z.string().min(1).optional(),
});

/**
 * Sanitize one path segment (provider slug, model id): keep the
 * filesystem-safe alphabet, fold runs of anything else to "-", and refuse the
 * dot-dot fragment, the dot aliases, and leading dashes outright — checked on
 * the RAW value before any folding, so a crafted id can never fold down to a
 * contained-but-wrong name, traverse, or hide.
 */
function sanitizeSegment(raw: string, what: string): string {
  if (raw.includes("..")) {
    throw new Error(`Invalid ${what} in candidate path: ${raw}`);
  }
  const segment = raw.replaceAll(/[^A-Za-z0-9._-]+/g, "-");
  if (
    segment === "" ||
    segment === "." ||
    segment === ".." ||
    segment.startsWith("-")
  ) {
    throw new Error(`Invalid ${what} in candidate path: ${raw}`);
  }
  return segment;
}

/**
 * Split a composite catalog id ("<provider>/<model>") into sanitized path
 * segments; the provider segment disambiguates model ids that collide
 * across providers (PRD §5). The raw id is checked for ".." before the
 * split — every ".." in a well-formed id lands in one of the two segments,
 * but rejecting the whole id up front keeps the guarantee independent of
 * how the id divides.
 */
function candidateSegments(model: string): { provider: string; model: string } {
  if (model.includes("..")) {
    throw new Error(`Invalid model id in candidate path: ${model}`);
  }
  const slash = model.indexOf("/");
  if (slash <= 0 || slash === model.length - 1) {
    throw new Error(
      `Candidate model id must be "<provider>/<model>": ${model}`,
    );
  }
  return {
    provider: sanitizeSegment(model.slice(0, slash), "provider id"),
    model: sanitizeSegment(model.slice(slash + 1), "model id"),
  };
}

function candidateFileRel(
  sessionId: string,
  step: IdeationStep,
  model: string,
): string {
  const segments = candidateSegments(model);
  return `${sessionDirRel(sessionId)}/${CANDIDATES_DIR_NAME}/${step}/${segments.provider}/${segments.model}.md`;
}

export interface WriteCandidateInput {
  projectPath: string;
  sessionId: string;
  markdown: string;
  matter: CandidateMatter;
}

/**
 * Persist one candidate: `candidates/<step>/<provider>/<model>.md`, the
 * matter front-matter block from PRD §5 on top of the model's markdown.
 * Re-runs of the same step under the same model id overwrite their own file
 * (the backlog keeps the latest per model). Returns the project-relative
 * path — the `file` field of candidates.list.
 */
export async function writeCandidate(
  input: WriteCandidateInput,
): Promise<string> {
  const abs = await requireKnownProject(input.projectPath);
  const matter: CandidateMatter = candidateMatterSchema.parse(input.matter);
  const rel = candidateFileRel(input.sessionId, matter.step, matter.model);
  const file = await resolveInside(abs, rel);
  const content =
    renderMatterBlock([
      ["step", matter.step],
      ["model", matter.model],
      ["timestamp", matter.timestamp],
      ...(matter.score !== undefined
        ? [["score", matter.score] as [string, MatterValue]]
        : []),
      ...(matter.rationale !== undefined
        ? [["rationale", matter.rationale] as [string, MatterValue]]
        : []),
      ...(matter.error !== undefined
        ? [["error", matter.error] as [string, MatterValue]]
        : []),
    ]) + ensureTrailingNewline(input.markdown);
  await queueWrite(() => atomicWrite(file, content));
  return rel;
}

/**
 * Read one persisted candidate back: the Phase 4 engine's single entry
 * point for a finished step's output — e.g. the reconciler's merged PRD,
 * re-read to feed the plan step — so path layout, id sanitization, and
 * matter parsing stay defined only here. Returns the parsed matter (null
 * when the file carries no front-matter block), the body under it, and the
 * project-relative `file` path writeCandidate returned. A missing file is
 * a typed error naming step and model, never a raw ENOENT; containment is
 * the module's standard read discipline (requireKnownProject → resolveInside
 * through candidateFileRel's SESSION_ID_PATTERN + sanitizeSegment checks).
 */
export async function readCandidate(
  projectPath: string,
  sessionId: string,
  step: IdeationStep,
  model: string,
): Promise<{ matter: MatterFields | null; body: string; file: string }> {
  const abs = await requireKnownProject(projectPath);
  const parsedStep = ideationStepSchema.parse(step);
  const rel = candidateFileRel(sessionId, parsedStep, model);
  const file = await resolveInside(abs, rel);
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(
        `No persisted ${parsedStep} candidate for ${model} in ideation session ${sessionId}.`,
      );
    }
    throw err;
  }
  const { matter, body } = parseMatterBlock(raw);
  return { matter, body, file: rel };
}

// --- final artifacts (PRD §4.4 artifacts.save, §7) ---------------------------------

const artifactKindSchema = z.enum(["prd", "plan"]);

export interface SaveArtifactsInput {
  projectPath: string;
  sessionId: string;
  artifacts: IdeationArtifactKind[];
  /** The only path past a collision is the confirm dialog's explicit true. */
  overwrite?: boolean;
}

export interface SaveArtifactsResult {
  /** Project-relative paths actually written, e.g. "docs/PRD.md". */
  written: string[];
  /** Project-relative paths that already exist and were not overwritten. */
  collisions: string[];
  /** True when this call appended the .gitignore entry. */
  gitignoreAppended: boolean;
}

/**
 * Which persisted candidate holds an artifact's body: in fan-out (N>1) the
 * reconciler's merged output — persisted by the fanout engine under the
 * reconciler's own catalog id via writeCandidate — else the single solo
 * candidate (PRD §6). Exported for the Phase 4 engine: paired with
 * readCandidate it locates the merged PRD/plan body that feeds the next
 * step, so the solo-vs-reconciler choice is defined in exactly one place.
 */
export function mergedModelFor(
  session: IdeationSession,
  kind: IdeationArtifactKind,
): string {
  const models = session.models[kind];
  if (models.length > 1) return session.models.reconciler;
  const solo = models[0];
  if (solo === undefined) {
    throw new Error(
      `Ideation session ${session.id} has no ${kind} model configured.`,
    );
  }
  return solo;
}

/**
 * Save the merged PRD/plan into docs/ with write-once semantics
 * (AGENTS.md-step discipline, scaffold.ts): an existing target becomes a
 * collision unless the caller passed `overwrite` after an explicit confirm —
 * never silently overwritten. Provenance matter (step/session/generated-at/
 * models/reconciler) rides on top of the merged markdown, and the session's
 * artifacts block records what was saved — merged onto a freshly reloaded
 * session.json inside one write section, so concurrent session updates
 * survive the save.
 */
export async function saveArtifacts(
  input: SaveArtifactsInput,
): Promise<SaveArtifactsResult> {
  const abs = await requireKnownProject(input.projectPath);
  const kinds = [...new Set(artifactKindSchema.array().parse(input.artifacts))];
  const session = await loadSession(abs, input.sessionId);
  if (session === null) {
    throw new Error(
      `No ideation session ${input.sessionId} under ${abs}.`,
    );
  }

  const written: string[] = [];
  const collisions: string[] = [];
  /** Artifact statuses to merge into session.json — and nothing else. */
  const recorded: Partial<
    Record<IdeationArtifactKind, IdeationArtifactStatus>
  > = {};
  const now = new Date().toISOString();

  for (const kind of kinds) {
    const target = ARTIFACT_TARGETS[kind];
    const targetAbs = await resolveInside(abs, target);
    if (!input.overwrite && (await fileExists(targetAbs))) {
      collisions.push(target);
      continue;
    }
    const sourceRel = candidateFileRel(
      session.id,
      kind,
      mergedModelFor(session, kind),
    );
    const sourceAbs = await resolveInside(abs, sourceRel);
    let raw: string;
    try {
      raw = await readFile(sourceAbs, "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        throw new Error(
          `No persisted ${kind} candidate for session ${session.id} — generate the ${kind} before saving it.`,
        );
      }
      throw err;
    }
    const { body } = parseMatterBlock(raw);
    const models = [...session.models[kind]];
    const fannedOut = models.length > 1;
    const matter = renderMatterBlock([
      ["step", kind],
      ["session", session.id],
      ["generated-at", now],
      ["models", models],
      ...(fannedOut
        ? [
            ["reconciler", session.models.reconciler] as [
              string,
              MatterValue,
            ],
          ]
        : []),
    ]);
    const saved = await queueWrite(async () => {
      // Authoritative write-once re-check inside the serialized section: the
      // early check above ran outside the queue, and atomicWrite's rename
      // silently replaces — so a target created in the window (a concurrent
      // save, an externally created file) lands here as a collision instead
      // of being clobbered (PRD §7: only an explicit confirm overwrites).
      if (!input.overwrite && (await fileExists(targetAbs))) {
        collisions.push(target);
        return false;
      }
      await atomicWrite(targetAbs, matter + ensureTrailingNewline(body));
      return true;
    });
    if (saved) {
      written.push(target);
      recorded[kind] = { path: target, savedAt: now };
    }
  }

  if (written.length > 0) {
    // Lost-update guard: session.json is reloaded inside one write section
    // and ONLY the artifacts fields are merged onto the fresh snapshot, so a
    // grill turn appended while this save ran (questionHistory/phase) is
    // never clobbered by a stale entry-time snapshot. The write is inlined
    // (not saveSession) because queueWrite is not reentrant.
    const sessionFile = await resolveInside(
      abs,
      `${sessionDirRel(session.id)}/${SESSION_FILE_NAME}`,
    );
    await queueWrite(async () => {
      const fresh = await loadSession(abs, session.id);
      if (fresh === null) {
        throw new Error(`No ideation session ${session.id} under ${abs}.`);
      }
      await atomicWrite(
        sessionFile,
        JSON.stringify(
          {
            ...fresh,
            artifacts: { ...fresh.artifacts, ...recorded },
            updatedAt: new Date().toISOString(),
          },
          null,
          2,
        ),
      );
    });
  }
  const gitignoreAppended = await appendGitignoreOnce(abs);
  return { written, collisions, gitignoreAppended };
}

/**
 * Append ".ideadump/" to the project's .gitignore when the project is a git
 * repo whose ignore file lacks it (PRD §8) — once per project, best-effort,
 * and never fatal to the save that triggered it.
 */
async function appendGitignoreOnce(absProject: string): Promise<boolean> {
  try {
    if (!(await fileExists(await resolveInside(absProject, ".git")))) {
      return false;
    }
    const gitignoreAbs = await resolveInside(absProject, ".gitignore");
    let current: string | null = null;
    try {
      current = await readFile(gitignoreAbs, "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") return false;
    }
    if (current !== null) {
      const ignored = current.split(/\r?\n/).some((line) => {
        const trimmed = line.trim();
        return trimmed === ".ideadump" || trimmed === GITIGNORE_ENTRY;
      });
      if (ignored) return false;
    }
    const prefix =
      current === null || current === "" || current.endsWith("\n")
        ? ""
        : "\n";
    await appendFile(gitignoreAbs, `${prefix}${GITIGNORE_ENTRY}\n`, "utf8");
    return true;
  } catch {
    // Best-effort by design (PRD §8): a failed append never fails the save.
    return false;
  }
}
