import { createFileRoute } from "@tanstack/react-router";

import {
  IdeationAllCandidatesFailedError,
  runArtifactStep,
  runQuestionsStep,
} from "@workspace-welcome/api/lib/ideation/fanout";
import { IdeationAbortedError, createModelRunner } from "@workspace-welcome/api/lib/ideation/runner";
import {
  appendGrade,
  appendTranscript,
  applyGrillDecision,
  completePlan,
  completePrd,
  createIdeationMessage,
  loadSession,
  mergedModelFor,
  readCandidate,
  readContext,
  recordGrillAnswer,
  saveSession,
  writeCandidate,
} from "@workspace-welcome/api/lib/ideation/session";
import {
  chatParamsFromRequest,
  EventType,
  toServerSentEventsResponse,
} from "@workspace-welcome/api/lib/ideation/sse";
import {
  IDEATION_CANDIDATE_EVENT,
  IDEATION_GENERATE_PLAN_SENTINEL,
  IDEATION_GENERATE_PRD_SENTINEL,
  IDEATION_KICKOFF_SENTINEL,
  IDEATION_RECONCILER_EVENT,
  IDEATION_STEP_NOTE_EVENT,
  IDEATION_SUGGESTED_ANSWERS_EVENT,
} from "@/lib/ideation-wire";
import type {
  ArtifactCandidate,
  ArtifactStepResult,
  FanoutCandidateError,
  FanoutEvent,
  QuestionsStepResult,
} from "@workspace-welcome/api/lib/ideation/fanout";
import type { ModelRunner } from "@workspace-welcome/api/lib/ideation/runner";
import type {
  ModelMessage,
  StreamChunk,
  UIMessage,
} from "@workspace-welcome/api/lib/ideation/sse";
import type { IdeationProjectContext } from "@workspace-welcome/api/lib/ideation/context";
import type {
  GrillDecision,
  IdeationGrade,
  IdeationSession,
  IdeationStep,
} from "@workspace-welcome/api/lib/ideation/shared";
import type {
  IdeationCandidateEventValue,
  IdeationReconcilerEventValue,
  IdeationStepNoteEventValue,
  IdeationSuggestedAnswersEventValue,
} from "@/lib/ideation-wire";

/**
 * The ideation chat route — the app's first SSE endpoint (PRD §4.3). A POST
 * server handler in the documented TanStack AI Start shape:
 * `chatParamsFromRequest(request)` in (the AG-UI `RunAgentInput` the panel's
 * `useChat` posts), `toServerSentEventsResponse(stream)` out. Session
 * identity rides as query params (`?session=<id>&project=<encoded abs
 * path>`); the incoming final user message is either a grilling answer or a
 * sentinel command (`‹start-interview›` / `‹generate-prd›` /
 * `‹generate-plan›`) — sentinels are never recorded as answers or transcript.
 *
 * One AbortController per request, wired both ways: `request.signal` (client
 * disconnect, where the platform provides it) aborts it, and
 * `toServerSentEventsResponse` aborts it when the response body is cancelled
 * — the dev-middleware path proven by the Phase 5 spike. Aborting fails the
 * step's `final` with IdeationAbortedError and nothing is persisted; the
 * previous session.json snapshot stands, so the step is re-runnable
 * (PRD §7 — disk is the source of truth; the client never reconstructs
 * state from the stream).
 *
 * Turn shape: RUN_STARTED → the FanoutEvent pump translated onto AG-UI
 * events (per-model chips as CUSTOM events; solo artifact text as live
 * TEXT_MESSAGE_CONTENT deltas) → persistence in the Phase 4 handoff order
 * (candidates in model-set order, merged candidate last, grades when
 * non-empty, transcript, phase transition, saveSession) → the user-visible
 * message → RUN_FINISHED only after persistence completes. Any failure,
 * including abort, rejects `final` and becomes exactly one RUN_ERROR.
 */

// --- setup failures ----------------------------------------------------------------

/**
 * A failure that ends the turn before any model call — surfaced as a
 * RUN_ERROR event carrying a stable `code` the client can branch on.
 */
class IdeationSetupError extends Error {
  constructor(
    readonly code: "not-found" | "session-unreadable" | "context-missing" | "phase",
    message: string,
  ) {
    super(message);
    this.name = "IdeationSetupError";
  }
}

// --- incoming message --------------------------------------------------------------

/**
 * An AG-UI `TextInputContent` item — the runtime shape of a text item inside
 * array-shaped user content. useChat's serializer posts these with the
 * string on `text`, NOT on the `content` field the SDK-side `TextPart` type
 * (which the declared `ModelMessage.content` array is labeled with) uses;
 * reading the wrong field is how real answers were recorded as the literal
 * "undefined".
 */
function isTextInputItem(
  item: unknown,
): item is { readonly type: "text"; readonly text: string } {
  return (
    typeof item === "object" &&
    item !== null &&
    "type" in item &&
    item.type === "text" &&
    "text" in item &&
    typeof item.text === "string"
  );
}

/**
 * The text of one user message, validated against the wire shape it actually
 * arrives in: `chatParamsFromRequest` strips `parts` from every inbound
 * message, so despite the SDK's `UIMessage | ModelMessage` union a parsed
 * user message is always content-carrying — `content` is a plain string or
 * an array of AG-UI input parts whose text items carry the string on `text`.
 * Non-text and unexpected item shapes are skipped, never stringified; a
 * message nothing was extracted from yields "" (classifyTurn reads that as
 * no usable answer text — bare kickoff, or a phase error mid-interview —
 * never as a recorded answer).
 */
function userMessageText(message: unknown): string {
  if (
    typeof message !== "object" ||
    message === null ||
    !("content" in message)
  ) {
    return "";
  }
  const { content } = message;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  let text = "";
  for (const item of content) {
    if (isTextInputItem(item)) text += item.text;
  }
  return text;
}

/**
 * The incoming final user message: the last `user` message of the posted
 * transcript (useChat sends the whole history; its final entry is this
 * turn's input). Null when the request carries none — only legal as the
 * bare kickoff of a fresh session.
 */
function finalUserText(
  messages: ReadonlyArray<UIMessage | ModelMessage>,
): string | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message !== undefined && message.role === "user") {
      return userMessageText(message);
    }
  }
  return null;
}

// --- turn classification -----------------------------------------------------------

/** What the request's final user message means for the session's phase. */
type ChatTurn =
  | { readonly kind: "questions"; readonly answer: string | null }
  | { readonly kind: "prd" }
  | { readonly kind: "plan" };

function classifyTurn(session: IdeationSession, incoming: string | null): ChatTurn {
  const text = incoming?.trim() ?? "";
  switch (session.phase) {
    case "grilling": {
      const bareKickoff = text === "" || text === IDEATION_KICKOFF_SENTINEL;
      if (bareKickoff) {
        if (session.questionHistory.length > 0) {
          throw new IdeationSetupError(
            "phase",
            "The interview has already started — this turn needs a grilling answer.",
          );
        }
        return { kind: "questions", answer: null };
      }
      if (
        text === IDEATION_GENERATE_PRD_SENTINEL ||
        text === IDEATION_GENERATE_PLAN_SENTINEL
      ) {
        throw new IdeationSetupError(
          "phase",
          "The session is still grilling — finish the interview before generating artifacts.",
        );
      }
      return { kind: "questions", answer: incoming };
    }
    case "prd": {
      if (text !== IDEATION_GENERATE_PRD_SENTINEL) {
        throw new IdeationSetupError(
          "phase",
          `The session is in the "prd" phase — expected ${IDEATION_GENERATE_PRD_SENTINEL}.`,
        );
      }
      return { kind: "prd" };
    }
    case "planning": {
      if (text !== IDEATION_GENERATE_PLAN_SENTINEL) {
        throw new IdeationSetupError(
          "phase",
          `The session is in the "planning" phase — expected ${IDEATION_GENERATE_PLAN_SENTINEL}.`,
        );
      }
      return { kind: "plan" };
    }
    case "done":
      throw new IdeationSetupError(
        "phase",
        "The session is complete — PRD and plan are already generated.",
      );
  }
}

// --- FanoutEvent → AG-UI translation ------------------------------------------------

function candidateEvent(
  step: IdeationStep,
  phase: "start" | "complete",
  model: string,
): StreamChunk {
  const value: IdeationCandidateEventValue = { step, phase, model };
  return {
    type: EventType.CUSTOM,
    name: IDEATION_CANDIDATE_EVENT,
    value,
  };
}

function candidateErrorEvent(
  step: IdeationStep,
  model: string,
  error: FanoutCandidateError,
): StreamChunk {
  const value: IdeationCandidateEventValue = {
    step,
    phase: "error",
    model,
    error: { kind: error.kind, message: error.message },
  };
  return {
    type: EventType.CUSTOM,
    name: IDEATION_CANDIDATE_EVENT,
    value,
  };
}

function reconcilerEvent(
  step: IdeationStep,
  phase: "start" | "complete",
  model: string,
): StreamChunk {
  const value: IdeationReconcilerEventValue = { step, phase, model };
  return {
    type: EventType.CUSTOM,
    name: IDEATION_RECONCILER_EVENT,
    value,
  };
}

function stepNoteEvent(step: IdeationStep, note: string): StreamChunk {
  const value: IdeationStepNoteEventValue = { step, note };
  return {
    type: EventType.CUSTOM,
    name: IDEATION_STEP_NOTE_EVENT,
    value,
  };
}

/** What the pump learned while draining `events` — drives the final render. */
interface PumpSummary {
  /** True once the first text delta opened the assistant message envelope. */
  readonly messageOpen: boolean;
}

/**
 * The single consumer of the run twin's `events` iterable (the Phase 4
 * contract: one consumer; `events` never rejects and ends after settle).
 * Candidate/reconciler progress becomes CUSTOM chips; a solo artifact's
 * TEXT_MESSAGE_CONTENT deltas become live SSE text deltas under this turn's
 * own message envelope. Everything else the runner stream emits — its inner
 * run lifecycle, RAW provider chunks, a terminal RUN_ERROR — is never
 * forwarded as text: failures reject `final` and surface as exactly one
 * RUN_ERROR after this loop ends.
 */
async function* pumpFanoutEvents(
  events: AsyncIterable<FanoutEvent>,
  step: IdeationStep,
  messageId: string,
): AsyncGenerator<StreamChunk, PumpSummary> {
  let messageOpen = false;
  for await (const event of events) {
    switch (event.type) {
      case "candidate-start":
        yield candidateEvent(step, "start", event.model);
        break;
      case "candidate-complete":
        yield candidateEvent(step, "complete", event.model);
        break;
      case "candidate-error":
        yield candidateErrorEvent(step, event.model, event.error);
        break;
      case "reconcile-start":
        yield reconcilerEvent(step, "start", event.model);
        break;
      case "reconcile-complete":
        yield reconcilerEvent(step, "complete", event.model);
        break;
      case "reconcile-error": {
        const value: IdeationReconcilerEventValue = {
          step,
          phase: "error",
          model: event.model,
          error: { kind: event.error.kind, message: event.error.message },
        };
        yield {
          type: EventType.CUSTOM,
          name: IDEATION_RECONCILER_EVENT,
          value,
        };
        break;
      }
      case "delta": {
        const chunk = event.chunk;
        if (chunk.type !== "TEXT_MESSAGE_CONTENT") break;
        if (!messageOpen) {
          messageOpen = true;
          yield {
            type: EventType.TEXT_MESSAGE_START,
            messageId,
            role: "assistant",
          };
        }
        yield {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId,
          delta: chunk.delta,
        };
        break;
      }
    }
  }
  return { messageOpen };
}

// --- persistence helpers ------------------------------------------------------------

function nowIso(): string {
  return new Date().toISOString();
}

/** `${kind}: ${message}` — the error rendering of a failed candidate, used for both the body and the matter's error field. */
function renderCandidateError(error: FanoutCandidateError): string {
  return `${error.kind}: ${error.message}`;
}

/** A grill decision rendered as the human-readable body of its candidate file. */
function renderGrillDecision(decision: GrillDecision): string {
  if (decision.status === "complete") {
    return decision.reason === undefined || decision.reason.trim() === ""
      ? "Interview complete."
      : `Interview complete. ${decision.reason}`;
  }
  if (decision.suggestedAnswers.length === 0) return decision.question;
  const suggestions = decision.suggestedAnswers
    .map((answer) => `- ${answer}`)
    .join("\n");
  return `${decision.question}\n\nSuggested answers:\n${suggestions}`;
}

/** Matter fields for one graded candidate; score/rationale only when graded. */
function gradedMatter(
  step: IdeationStep,
  model: string,
  gradesByModel: ReadonlyMap<string, IdeationGrade>,
): {
  step: IdeationStep;
  model: string;
  timestamp: string;
  score?: number;
  rationale?: string;
} {
  const grade = gradesByModel.get(model);
  return {
    step,
    model,
    timestamp: nowIso(),
    ...(grade === undefined ? {} : { score: grade.score, rationale: grade.rationale }),
  };
}

/**
 * Persist every candidate of a questions step in model-set order (the result
 * array already is), then the merged decision LAST under `mergedModel` —
 * `writeCandidate` re-writes the same file when solo, which is exactly the
 * "merged candidate last" ordering with nothing left behind.
 */
async function persistQuestionsResult(input: {
  projectPath: string;
  sessionId: string;
  result: QuestionsStepResult;
}): Promise<void> {
  const { result } = input;
  const gradesByModel = new Map(result.grades.map((grade) => [grade.model, grade]));
  for (const candidate of result.candidates) {
    if (candidate.ok) {
      await writeCandidate({
        projectPath: input.projectPath,
        sessionId: input.sessionId,
        markdown: renderGrillDecision(candidate.decision),
        matter: gradedMatter("questions", candidate.model, gradesByModel),
      });
    } else {
      const error = renderCandidateError(candidate.error);
      await writeCandidate({
        projectPath: input.projectPath,
        sessionId: input.sessionId,
        markdown: error,
        matter: {
          step: "questions",
          model: candidate.model,
          timestamp: nowIso(),
          error,
        },
      });
    }
  }
  await writeCandidate({
    projectPath: input.projectPath,
    sessionId: input.sessionId,
    markdown: renderGrillDecision(result.decision),
    matter: { step: "questions", model: result.mergedModel, timestamp: nowIso() },
  });
}

/** Same ordering for an artifact step; the merged file's body is what `saveArtifacts` later reads. */
async function persistArtifactResult(input: {
  projectPath: string;
  sessionId: string;
  result: ArtifactStepResult;
}): Promise<void> {
  const { result } = input;
  const gradesByModel = new Map(result.grades.map((grade) => [grade.model, grade]));
  for (const candidate of result.candidates) {
    await writeCandidate({
      projectPath: input.projectPath,
      sessionId: input.sessionId,
      markdown: candidateMarkdown(candidate),
      matter: candidate.ok
        ? gradedMatter(result.step, candidate.model, gradesByModel)
        : {
            step: result.step,
            model: candidate.model,
            timestamp: nowIso(),
            error: renderCandidateError(candidate.error),
          },
    });
  }
  await writeCandidate({
    projectPath: input.projectPath,
    sessionId: input.sessionId,
    markdown: result.markdown,
    matter: { step: result.step, model: result.mergedModel, timestamp: nowIso() },
  });
}

function candidateMarkdown(candidate: ArtifactCandidate): string {
  return candidate.ok ? candidate.markdown : renderCandidateError(candidate.error);
}

// --- RUN_ERROR mapping --------------------------------------------------------------

/** Exactly one RUN_ERROR per failed turn, with a stable code where there is one. */
function runErrorChunk(error: unknown): StreamChunk {
  if (error instanceof IdeationSetupError) {
    return {
      type: EventType.RUN_ERROR,
      message: error.message,
      code: error.code,
    };
  }
  if (error instanceof IdeationAbortedError) {
    return {
      type: EventType.RUN_ERROR,
      message: "The turn was aborted — nothing was persisted; the step can be re-run.",
      code: "aborted",
    };
  }
  if (error instanceof IdeationAllCandidatesFailedError) {
    return {
      type: EventType.RUN_ERROR,
      message: error.message,
      code: "all-candidates-failed",
    };
  }
  const message = error instanceof Error ? error.message : String(error);
  return {
    type: EventType.RUN_ERROR,
    message,
  };
}

// --- the turn -------------------------------------------------------------------------

/** Everything a turn runs with; `session`/`context` are loaded per request. */
interface TurnContext {
  readonly projectPath: string;
  readonly sessionId: string;
  readonly runner: ModelRunner;
  readonly session: IdeationSession;
  readonly context: IdeationProjectContext;
  /** THE one controller of the request — wired to request abort and response cancellation. */
  readonly abortController: AbortController;
  readonly runId: string;
}

/** One assistant text message emitted whole (questions turns, render-on-final artifacts). */
function* wholeMessage(messageId: string, text: string): Generator<StreamChunk> {
  yield { type: EventType.TEXT_MESSAGE_START, messageId, role: "assistant" };
  yield { type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta: text };
  yield { type: EventType.TEXT_MESSAGE_END, messageId };
}

/**
 * Mid-fan-out failure is best-effort (PRD §7): when the settled candidate
 * mix is partial — some models failed, at least one responded — say exactly
 * once how many of the configured set made it. Derived from `final`'s
 * result after it resolves, so a failure settling before the first success
 * is counted too; all-ok steps stay silent, and the all-failed path never
 * reaches here (its step rejects and becomes the turn's single RUN_ERROR).
 */
function* partialResponseNote(
  step: IdeationStep,
  candidates: ReadonlyArray<{ readonly ok: boolean }>,
  totalModels: number,
): Generator<StreamChunk> {
  const responded = candidates.filter((candidate) => candidate.ok).length;
  if (responded > 0 && responded < totalModels) {
    yield stepNoteEvent(step, `${responded} of ${totalModels} models responded`);
  }
}

/** The questions turn (PRD §4.3): record the answer, grill, persist, one question. */
async function* questionsTurn(
  turn: TurnContext,
  answer: string | null,
): AsyncGenerator<StreamChunk> {
  const messageId = `${turn.runId}-question`;
  // The answer joins the in-memory history BEFORE the step (the Phase 4
  // handoff contract); a bare kickoff turn records no USER message anywhere,
  // but the model's first question is appended/persisted below like any
  // grilling turn — resume depends on it.
  const working =
    answer === null ? turn.session : recordGrillAnswer(turn.session, answer);
  const run = runQuestionsStep({
    runner: turn.runner,
    models: working.models.questions,
    reconciler: working.models.reconciler,
    context: turn.context,
    history: working.questionHistory,
    abortController: turn.abortController,
  });
  yield* pumpFanoutEvents(run.events, "questions", messageId);
  const result = await run.final;
  yield* partialResponseNote(
    "questions",
    result.candidates,
    working.models.questions.length,
  );
  await persistQuestionsResult({
    projectPath: turn.projectPath,
    sessionId: turn.sessionId,
    result,
  });
  if (result.grades.length > 0) {
    await appendGrade(turn.projectPath, turn.sessionId, "questions", result.grades);
  }
  if (answer !== null) {
    await appendTranscript(
      turn.projectPath,
      turn.sessionId,
      createIdeationMessage("user", answer),
    );
  }
  if (result.decision.status === "question") {
    await appendTranscript(
      turn.projectPath,
      turn.sessionId,
      createIdeationMessage(
        "assistant",
        result.decision.question,
        result.decision.suggestedAnswers,
      ),
    );
  }
  await saveSession(applyGrillDecision(working, result.decision));
  if (result.decision.status === "question") {
    yield { type: EventType.TEXT_MESSAGE_START, messageId, role: "assistant" };
    const value: IdeationSuggestedAnswersEventValue = {
      messageId,
      suggestedAnswers: [...result.decision.suggestedAnswers],
    };
    yield {
      type: EventType.CUSTOM,
      name: IDEATION_SUGGESTED_ANSWERS_EVENT,
      value,
    };
    yield {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId,
      delta: result.decision.question,
    };
    yield { type: EventType.TEXT_MESSAGE_END, messageId };
  }
}

/** The PRD/plan turns: solo streams live; fan-out renders the merged markdown on final (PRD §10). */
async function* artifactTurn(
  turn: TurnContext,
  step: "prd" | "plan",
): AsyncGenerator<StreamChunk> {
  const messageId = `${turn.runId}-${step}`;
  const input =
    step === "prd"
      ? { step: "prd" as const }
      : {
          step: "plan" as const,
          prd: (
            await readCandidate(
              turn.projectPath,
              turn.sessionId,
              "prd",
              mergedModelFor(turn.session, "prd"),
            )
          ).body,
        };
  const run = runArtifactStep({
    runner: turn.runner,
    models: turn.session.models[step],
    reconciler: turn.session.models.reconciler,
    context: turn.context,
    history: turn.session.questionHistory,
    abortController: turn.abortController,
    ...input,
  });
  const summary = yield* pumpFanoutEvents(
    run.events,
    step,
    messageId,
  );
  const result = await run.final;
  yield* partialResponseNote(
    step,
    result.candidates,
    turn.session.models[step].length,
  );
  await persistArtifactResult({
    projectPath: turn.projectPath,
    sessionId: turn.sessionId,
    result,
  });
  if (result.grades.length > 0) {
    await appendGrade(turn.projectPath, turn.sessionId, step, result.grades);
  }
  await saveSession(step === "prd" ? completePrd(turn.session) : completePlan(turn.session));
  if (summary.messageOpen) {
    // Solo: the deltas already streamed the artifact; just close the envelope.
    yield { type: EventType.TEXT_MESSAGE_END, messageId };
  } else if (result.markdown.length > 0) {
    // Fan-out (or a delta-less solo stream): render on final.
    yield* wholeMessage(messageId, result.markdown);
  }
}

/** RUN_STARTED, the classified turn, RUN_FINISHED after persistence — or exactly one RUN_ERROR. */
async function* runTurn(input: {
  readonly params: { readonly threadId: string; readonly runId: string };
  readonly messages: ReadonlyArray<UIMessage | ModelMessage>;
  readonly projectPath: string;
  readonly sessionId: string;
  readonly runner: ModelRunner;
  readonly abortController: AbortController;
}): AsyncGenerator<StreamChunk> {
  yield {
    type: EventType.RUN_STARTED,
    threadId: input.params.threadId,
    runId: input.params.runId,
  };
  try {
    let session: IdeationSession;
    try {
      const loaded = await loadSession(input.projectPath, input.sessionId);
      if (loaded === null) {
        throw new IdeationSetupError(
          "not-found",
          `No ideation session ${input.sessionId} under ${input.projectPath}.`,
        );
      }
      session = loaded;
    } catch (error) {
      if (error instanceof IdeationSetupError) throw error;
      throw new IdeationSetupError(
        "session-unreadable",
        error instanceof Error ? error.message : String(error),
      );
    }
    const context = await readContext(input.projectPath, input.sessionId).catch(
      (error: unknown) => {
        throw new IdeationSetupError(
          "context-missing",
          error instanceof Error ? error.message : String(error),
        );
      },
    );
    const chatTurn = classifyTurn(session, finalUserText(input.messages));
    const turn: TurnContext = {
      projectPath: input.projectPath,
      sessionId: input.sessionId,
      runner: input.runner,
      session,
      context,
      abortController: input.abortController,
      runId: input.params.runId,
    };
    if (chatTurn.kind === "questions") {
      yield* questionsTurn(turn, chatTurn.answer);
    } else {
      yield* artifactTurn(turn, chatTurn.kind);
    }
    yield {
      type: EventType.RUN_FINISHED,
      threadId: input.params.threadId,
      runId: input.params.runId,
    };
  } catch (error) {
    if (error instanceof IdeationAllCandidatesFailedError) {
      // Sanctioned best-effort (PRD §7): keep the failed candidates on the
      // backlog with their error matter; the original failure still wins.
      for (const failure of error.failures) {
        await writeCandidate({
          projectPath: input.projectPath,
          sessionId: input.sessionId,
          markdown: renderCandidateError(failure.error),
          matter: {
            step: error.step,
            model: failure.model,
            timestamp: nowIso(),
            error: renderCandidateError(failure.error),
          },
        }).catch(() => undefined);
      }
    }
    yield runErrorChunk(error);
  }
}

// --- the route ------------------------------------------------------------------------

/** Test seam: the model runner boundary, overridable to drive the route without provider calls. */
export interface IdeationChatHandlerOptions {
  readonly runner?: ModelRunner;
}

/**
 * Build the POST handler. The default runner is the real model boundary;
 * the probe injects a stub through the same seam.
 */
export function createIdeationChatHandler(
  options: IdeationChatHandlerOptions = {},
): (ctx: { request: Request }) => Promise<Response> {
  const runner = options.runner ?? createModelRunner();
  return async ({ request }) => {
    const params = new URL(request.url).searchParams;
    const sessionId = params.get("session");
    const projectPath = params.get("project");
    if (sessionId === null || projectPath === null) {
      return new Response("Missing session or project parameter", { status: 400 });
    }
    // Throws a 400 Response on a malformed AG-UI body — TanStack Start
    // returns thrown Responses to the client as-is.
    const chatParams = await chatParamsFromRequest(request);
    // One controller per request: the client disconnect aborts the step,
    // and toServerSentEventsResponse aborts it when the body is cancelled.
    const abortController = new AbortController();
    request.signal.addEventListener(
      "abort",
      () => abortController.abort(),
      { once: true },
    );
    return toServerSentEventsResponse(
      runTurn({
        params: { threadId: chatParams.threadId, runId: chatParams.runId },
        messages: chatParams.messages,
        projectPath,
        sessionId,
        runner,
        abortController,
      }),
      { abortController },
    );
  };
}

export const Route = createFileRoute("/api/ideation/chat")({
  server: {
    handlers: {
      POST: createIdeationChatHandler(),
    },
  },
});
