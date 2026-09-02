import { grillSystemPrompt, planPrompt, prdPrompt } from "./prompts";
import { IdeationAbortedError, IdeationRunnerError } from "./runner";
import {
  grillDecisionSchema,
  reconcileArtifactSchema,
  reconcileQuestionsSchema,
} from "./shared";

import type { IdeationProjectContext } from "./context";
import type {
  GenerateResult,
  ModelRunner,
  RunnerErrorKind,
  RunnerStreamChunk,
  StreamedRunResult,
} from "./runner";
import type {
  GrillDecision,
  IdeationArtifactKind,
  IdeationGrade,
  IdeationMessage,
  IdeationStep,
} from "./shared";

/**
 * The fan-out/reconcile engine (PRD §6): pure model-call orchestration over
 * the runner boundary. No disk, no session imports — Phase 5 (the SSE route)
 * owns persistence and can derive its ordering from every result: the
 * per-candidate records in model-set order, then the user-visible output
 * under `mergedModel` (the reconciler id in fan-out), so individual
 * candidates persist first and the merged candidate last.
 *
 * Two step entry points, both returning the run/stream twin:
 * - runQuestionsStep — grilling decisions via generateJson; fan-out merges
 *   through ONE reconciler generateJson call (reconcileQuestionsSchema).
 * - runArtifactStep — PRD/plan markdown. Solo forwards the runner stream's
 *   real chunks as `delta` events so Phase 5 streams live deltas; fan-out
 *   follows PRD §10's sanctioned render-on-final fallback: per-model
 *   progress events during the candidates and the reconciler, merged
 *   markdown delivered in `final`, never as live field deltas.
 *
 * Solo mode (N=1) runs exactly one model call — no reconciler call, no
 * grades (PRD §6). Fan-out (N>1) runs every model on identical inputs with
 * allSettled semantics: each call runs to settlement with its own failure
 * captured as a failed candidate record plus a candidate-error event — no
 * short-circuit — the step proceeds if any candidate succeeded (grades cover
 * only the successful ones), and fails loudly, typed and carrying
 * per-candidate causes, only when all candidates or the reconciler fail
 * (PRD §7).
 *
 * Cancellation: one AbortController threads to every call of the step;
 * aborting fails `final` fast with the runner's IdeationAbortedError
 * semantics, while in-flight results are discarded safely — every promise
 * this module creates carries a handler, so aborting can never surface an
 * unhandled rejection.
 *
 * Event contract: `events` never throws and is not a failure channel — every
 * failure, including abort, rejects `final` only. One documented partial
 * exception: a failing solo artifact stream forwards the runner's terminal
 * RUN_ERROR chunk as its last `delta` event before `final` rejects.
 */

// --- inputs -----------------------------------------------------------------------

/** Options shared by every step entry point. */
export interface FanoutStepOptions {
  /** The runner boundary (createModelRunner() or a test double). */
  readonly runner: ModelRunner;
  /**
   * The step's model set (the session's models.questions / .prd / .plan):
   * exactly 1 = solo, more than 1 = fan-out. Zero is a programmer error and
   * throws synchronously.
   */
  readonly models: readonly string[];
  /** Reconciler catalog id — consulted only when models.length > 1. */
  readonly reconciler: string;
  /** The frozen session context the step prompts render from. */
  readonly context: IdeationProjectContext;
  /** The session's questionHistory, mapped to plain runner messages. */
  readonly history: readonly IdeationMessage[];
  /** Threaded to every model call of the step; abort fails `final` fast. */
  readonly abortController?: AbortController;
}

/** runQuestionsStep input — the shared options, nothing further. */
export type QuestionsStepInput = FanoutStepOptions;

/** runArtifactStep input: plan steps must carry the PRD they plan from. */
export type ArtifactStepInput =
  | (FanoutStepOptions & { readonly step: "prd" })
  | (FanoutStepOptions & { readonly step: "plan"; readonly prd: string });

// --- events -----------------------------------------------------------------------

/**
 * Lifecycle and delta events of a running step, emitted in order. `events`
 * never throws and never terminates on failure — every failure, including
 * abort, rejects `final` only; the iterator ends once the step settles
 * (buffered events drain first).
 *
 * - `candidate-start` — one of the step's models just started its own call.
 * - `candidate-complete` — that call finished successfully; its output rides
 *   `final`, not the event.
 * - `candidate-error` — that call failed; the step may still proceed
 *   (mid-fan-out failure is best-effort, PRD §7).
 * - `reconcile-start` / `reconcile-complete` — the fan-out reconciler call
 *   began / finished successfully. Fan-out only; solo steps never emit them.
 * - `reconcile-error` — the reconciler call failed; `final` rejects right
 *   after this event.
 * - `delta` — live passthrough of a solo artifact stream's RunnerStreamChunks
 *   (TEXT_MESSAGE_CONTENT deltas are the artifact markdown arriving in real
 *   time, ready to forward as SSE text). Emitted only by solo artifact steps;
 *   fan-out artifacts render on final instead (PRD §10), and a failing solo
 *   stream forwards the runner's terminal RUN_ERROR chunk as its last delta.
 */
export type FanoutEvent =
  | { readonly type: "candidate-start"; readonly model: string }
  | { readonly type: "candidate-complete"; readonly model: string }
  | {
      readonly type: "candidate-error";
      readonly model: string;
      readonly error: FanoutCandidateError;
    }
  | { readonly type: "reconcile-start"; readonly model: string }
  | { readonly type: "reconcile-complete"; readonly model: string }
  | {
      readonly type: "reconcile-error";
      readonly model: string;
      readonly error: FanoutCandidateError;
    }
  | {
      readonly type: "delta";
      readonly model: string;
      readonly chunk: RunnerStreamChunk;
    };

// --- results ----------------------------------------------------------------------

/** Serializable per-candidate failure info, from the runner's error taxonomy. */
export interface FanoutCandidateError {
  readonly kind: RunnerErrorKind;
  readonly message: string;
}

/** One questions-step candidate: the model's grill decision, or its failure. */
export type QuestionsCandidate =
  | { model: string; ok: true; decision: GrillDecision }
  | { model: string; ok: false; error: FanoutCandidateError };

/** One artifact-step candidate: the model's markdown, or its failure. */
export type ArtifactCandidate =
  | { model: string; ok: true; markdown: string }
  | { model: string; ok: false; error: FanoutCandidateError };

export interface QuestionsStepResult {
  readonly step: "questions";
  /** The user-visible turn: the merged decision in fan-out, else the solo one. */
  readonly decision: GrillDecision;
  /**
   * Which model's persisted candidate holds the user-visible output — the
   * reconciler id in fan-out (models.length > 1), the solo model otherwise.
   * Mirrors session.ts's mergedModelFor exactly, so Phase 5's persistence
   * (individual candidates first, merged candidate last under this id) and
   * readCandidate lookups line up.
   */
  readonly mergedModel: string;
  /** One record per model that ran, in the model-set order. */
  readonly candidates: QuestionsCandidate[];
  /** Reconciler grades; always empty in solo mode (PRD §6). */
  readonly grades: IdeationGrade[];
}

export interface ArtifactStepResult {
  readonly step: IdeationArtifactKind;
  /**
   * The user-visible markdown: the reconciler's merged document in fan-out
   * (render-on-final, PRD §10), the solo stream's full content otherwise.
   */
  readonly markdown: string;
  /** See QuestionsStepResult.mergedModel — same mergedModelFor parity. */
  readonly mergedModel: string;
  /** One record per model that ran, in the model-set order. */
  readonly candidates: ArtifactCandidate[];
  /** Reconciler grades; always empty in solo mode (PRD §6). */
  readonly grades: IdeationGrade[];
}

/** The run/stream twin both step entry points return. */
export interface FanoutRun<R> {
  /** Progress/delta events; never throws — failures reject `final` only. */
  readonly events: AsyncIterable<FanoutEvent>;
  /**
   * The step result. Rejects with: the runner's own typed error when a solo
   * call fails; IdeationAllCandidatesFailedError / IdeationReconcilerFailedError
   * for the fan-out structural failures; or IdeationAbortedError on abort.
   */
  readonly final: Promise<R>;
}

// --- typed errors -----------------------------------------------------------------

/** One failed candidate, as carried by IdeationAllCandidatesFailedError. */
export interface FanoutFailure {
  readonly model: string;
  readonly error: FanoutCandidateError;
}

/** Base of the structural step failures; abort is not one of these. */
export class IdeationStepError extends Error {
  readonly step: IdeationStep;

  constructor(step: IdeationStep, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "IdeationStepError";
    this.step = step;
  }
}

/** Every candidate model failed — the step cannot proceed (PRD §7). */
export class IdeationAllCandidatesFailedError extends IdeationStepError {
  readonly failures: readonly FanoutFailure[];

  constructor(step: IdeationStep, failures: FanoutFailure[]) {
    super(
      step,
      `every ${step} candidate model failed: ${failures
        .map((failure) => `${failure.model} (${failure.error.kind}: ${failure.error.message})`)
        .join("; ")}`,
    );
    this.name = "IdeationAllCandidatesFailedError";
    this.failures = failures;
  }
}

/**
 * The reconciler call failed after at least one candidate succeeded — the
 * merged output does not exist, so the step fails loudly (one reconcile
 * pass, no re-pass — PRD §2). `cause` carries the runner's typed error.
 */
export class IdeationReconcilerFailedError extends IdeationStepError {
  readonly reconciler: string;
  /** Catalog ids of the candidates that had succeeded. */
  readonly succeeded: readonly string[];

  constructor(
    step: IdeationStep,
    reconciler: string,
    succeeded: readonly string[],
    cause: unknown,
  ) {
    super(
      step,
      `the ${step} reconciler call (${reconciler}) failed after ${succeeded.length} candidate${
        succeeded.length === 1 ? "" : "s"
      } succeeded: ${errorMessageOf(cause)}`,
      { cause },
    );
    this.name = "IdeationReconcilerFailedError";
    this.reconciler = reconciler;
    this.succeeded = succeeded;
  }
}

function errorMessageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Collapse any thrown value onto the runner taxonomy (runners never throw raw). */
function toCandidateError(error: unknown): FanoutCandidateError {
  if (error instanceof IdeationRunnerError) {
    return { kind: error.kind, message: error.message };
  }
  return { kind: "provider", message: errorMessageOf(error) };
}

/**
 * Classify a reconciler failure: abort semantics win over everything (the
 * step was cancelled, not broken); otherwise a loud
 * IdeationReconcilerFailedError carrying the cause and the successes so far.
 */
function reconcilerFailure(
  error: unknown,
  controller: AbortController,
  scope: string,
  step: IdeationStep,
  reconciler: string,
  succeeded: readonly string[],
): IdeationStepError | IdeationAbortedError {
  if (error instanceof IdeationAbortedError) {
    return error;
  }
  if (controller.signal.aborted) {
    return new IdeationAbortedError(scope, error);
  }
  return new IdeationReconcilerFailedError(step, reconciler, succeeded, error);
}

// --- event channel ----------------------------------------------------------------

/**
 * The `events` half of the run twin: an ordered async queue built for one
 * consuming loop (the same discipline as the runner twins). Pushes buffer
 * while nobody iterates, next() parks while the step runs, the iterator
 * completes cleanly once the step settles, and it never rejects.
 */
interface EventChannel {
  readonly events: AsyncIterable<FanoutEvent>;
  push(event: FanoutEvent): void;
  /** Complete the iterator; buffered events still drain first. */
  close(): void;
}

function createEventChannel(): EventChannel {
  const buffer: FanoutEvent[] = [];
  const waiters: Array<(result: IteratorResult<FanoutEvent>) => void> = [];
  let closed = false;
  return {
    events: {
      [Symbol.asyncIterator]() {
        return {
          next: (): Promise<IteratorResult<FanoutEvent>> => {
            const event = buffer.shift();
            if (event !== undefined) {
              return Promise.resolve({ value: event, done: false });
            }
            if (closed) {
              return Promise.resolve({ value: undefined, done: true });
            }
            return new Promise((resolve) => {
              waiters.push(resolve);
            });
          },
        };
      },
    },
    push(event) {
      const waiter = waiters.shift();
      if (waiter !== undefined) {
        waiter({ value: event, done: false });
        return;
      }
      buffer.push(event);
    },
    close() {
      closed = true;
      for (const waiter of waiters.splice(0)) {
        waiter({ value: undefined, done: true });
      }
    },
  };
}

// --- run assembly -----------------------------------------------------------------

/**
 * Assemble the run twin: the work starts eagerly (consuming `events` is
 * optional — awaiting `final` alone drives the whole step), races abort for
 * fast failure, and closes the channel when the step settles. Both handlers
 * of the close attachment resolve, so the derived promise can never reject.
 */
function startRun<R>(
  channel: EventChannel,
  controller: AbortController,
  scope: string,
  work: Promise<R>,
): FanoutRun<R> {
  const final = raceAbort(work, controller, scope);
  final.then(
    () => channel.close(),
    () => channel.close(),
  );
  return { events: channel.events, final };
}

/**
 * Reject the step as soon as the controller fires — without waiting for
 * in-flight provider calls to notice — using the runner's
 * IdeationAbortedError semantics (kind "aborted"; the model field carries
 * the step scope, e.g. "questions step", because no single model owns a
 * step-level abort). Promise.race attaches handlers to both competitors, so
 * whichever loses, its eventual rejection is always handled: aborting a
 * step can never surface an unhandled rejection. The abort listener comes
 * off once the step settles.
 */
function raceAbort<R>(
  work: Promise<R>,
  controller: AbortController,
  scope: string,
): Promise<R> {
  let onAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_, reject) => {
    if (controller.signal.aborted) {
      reject(new IdeationAbortedError(scope));
      return;
    }
    onAbort = () => reject(new IdeationAbortedError(scope));
    controller.signal.addEventListener("abort", onAbort, { once: true });
  });
  return Promise.race([work, aborted]).finally(() => {
    if (onAbort !== undefined) {
      controller.signal.removeEventListener("abort", onAbort);
    }
  });
}

/** Step-scope abort check at sequencing boundaries (candidates settled, reconciler next). */
function assertNotAborted(controller: AbortController, scope: string): void {
  if (controller.signal.aborted) {
    throw new IdeationAbortedError(scope);
  }
}

/** Abort-scope label for step-level IdeationAbortedError. */
function stepScope(step: IdeationStep): string {
  return `${step} step`;
}

/** The solo model, or a synchronous programmer error when none is configured. */
function firstModel(models: readonly string[], step: IdeationStep): string {
  const [model] = models;
  if (model === undefined) {
    throw new Error(`The ${step} step has no models configured.`);
  }
  return model;
}

// --- messages ---------------------------------------------------------------------

/**
 * Session history → runner messages (the Phase 3 handoff contract): plain
 * role/content literals only — IdeationMessage.createdAt is incompatible
 * with the SDK's Date-typed field, and ModelMessage is not re-exported.
 */
function historyMessages(
  history: readonly IdeationMessage[],
): Array<{ role: IdeationMessage["role"]; content: string }> {
  return history.map(({ role, content }) => ({ role, content }));
}

/**
 * Kick-off for the interview's first turn: the conversation starts with an
 * empty history, but a request whose only content is the system prompt is
 * rejected by OpenAI-compatible endpoints, so the first grill call rides
 * this deterministic user message (the idea itself already rides the
 * system prompt via grillSystemPrompt).
 */
const INTERVIEW_KICKOFF_MESSAGE = "Begin the interview: ask the first question.";

function grillMessages(
  history: readonly IdeationMessage[],
): Array<{ role: IdeationMessage["role"]; content: string }> {
  const messages = historyMessages(history);
  return messages.length > 0 ? messages : [{ role: "user", content: INTERVIEW_KICKOFF_MESSAGE }];
}

/** The complete artifact prompt (Phase 3): a single user message by design. */
function artifactPrompt(input: ArtifactStepInput): string {
  return input.step === "prd"
    ? prdPrompt(input.context, input.history)
    : planPrompt(input.context, input.prd, input.history);
}

// --- reconciler prompts (authored here per the Phase 3 handoff) -------------------
//
// Compact and deterministic on purpose: the heavy context already lives in
// the candidates (each was built from the full step prompt); the idea and
// the history ride along as the grading ground truth.

/** Compact `role: content` lines, mirroring prompts.ts's history rendering. */
function renderHistoryBlock(history: readonly IdeationMessage[]): string {
  if (history.length === 0) {
    return "# Question History\nNo messages yet.";
  }
  return `# Question History\n${history.map((m) => `${m.role}: ${m.content}`).join("\n")}`;
}

function reconcileQuestionsSystemPrompt(
  context: IdeationProjectContext,
  history: readonly IdeationMessage[],
): string {
  return `You are the ideation panel's question reconciler.

Several interviewer models each proposed the next interview turn from the same conversation. Produce the one turn the user actually sees, and grade every proposal.

Rules:
- Return the single best next question, or decide the interview is complete. Merge proposals that probe the same gap; otherwise pick the strongest and sharpen it.
- Honor the interviewer persona: exactly one question, direct, skeptical, relentless, grounded in the idea and history; 0-4 short suggestedAnswers only when they clarify a real decision.
- Never re-ask something the history already answered.
- Grade every proposal listed: score 0-10 (10 = exactly the right next turn), rationale one line, model set to the exact candidate id.

Return only valid structured output in this shape:
{"merged":{"status":"question","question":"...","suggestedAnswers":["..."]},"grades":[{"model":"...","score":7,"rationale":"..."}]}
{"merged":{"status":"complete","reason":"..."},"grades":[...]} is equally valid when the strong proposals say the interview is resolved.

# Idea
${context.idea}

${renderHistoryBlock(history)}`;
}

function reconcileArtifactSystemPrompt(input: ArtifactStepInput): string {
  const artifact = input.step === "prd" ? "PRD" : "implementation plan";
  return `You are the ideation panel's ${artifact} reconciler.

Several writer models each drafted the ${artifact} from identical inputs. Produce the ONE markdown the user sees, and grade every draft.

Rules:
- Combine the strongest sections of the drafts; drop weaker, redundant, or invented content.
- Keep the template structure the drafts follow: same headings, same order; add no new sections.
- Resolve conflicts toward what the idea and history actually support; write nothing unsupported.
- Pure markdown only — no commentary before or after, no surrounding code fence.
- Grade every draft listed: score 0-10 (10 = could ship as-is), rationale one line, model set to the exact candidate id.

Return only valid structured output in this shape:
{"merged":"<full merged markdown>","grades":[{"model":"...","score":7,"rationale":"..."}]}

# Idea
${input.context.idea}

${renderHistoryBlock(input.history)}`;
}

/** Deterministic payload carrying exactly the successful question candidates. */
function questionsCandidatesPayload(
  successes: ReadonlyArray<{ model: string; decision: GrillDecision }>,
): string {
  return JSON.stringify({
    candidates: successes.map((success) => ({
      model: success.model,
      decision: success.decision,
    })),
  });
}

/** Deterministic payload carrying exactly the successful artifact drafts. */
function artifactCandidatesPayload(
  successes: ReadonlyArray<{ model: string; markdown: string }>,
): string {
  return successes
    .map((success) => `Candidate: ${success.model}\n${success.markdown}`)
    .join("\n\n---\n\n");
}

// --- fan-out candidate plumbing ----------------------------------------------------

/** The failed branch of SettledCall, independent of the output type. */
interface FailedCall {
  model: string;
  ok: false;
  error: FanoutCandidateError;
}

/** One model call of a fan-out, settled either way. */
export type SettledCall<T> = { model: string; ok: true; output: T } | FailedCall;

/**
 * Run every model on identical inputs with allSettled semantics: all calls
 * start immediately (candidate-start fires in model-set order), each runs
 * to settlement, and each failure is captured as a failed candidate record
 * plus a candidate-error event — no short-circuit. The per-model wrapper
 * never rejects (its rejection branch resolves into a failed record), so
 * the Promise.all awaiting them cannot surface an unhandled rejection;
 * completion events fire as each model settles, not in a batch afterwards.
 */
function runCandidates<T>(
  models: readonly string[],
  channel: EventChannel,
  call: (model: string) => Promise<T>,
): Promise<SettledCall<T>[]> {
  return Promise.all(
    models.map((model) => {
      channel.push({ type: "candidate-start", model });
      return call(model).then(
        (output): SettledCall<T> => {
          channel.push({ type: "candidate-complete", model });
          return { model, ok: true, output };
        },
        (error: unknown): SettledCall<T> => {
          const candidateError = toCandidateError(error);
          channel.push({ type: "candidate-error", model, error: candidateError });
          return { model, ok: false, error: candidateError };
        },
      );
    }),
  );
}

// --- questions step ----------------------------------------------------------------

export function runQuestionsStep(input: QuestionsStepInput): FanoutRun<QuestionsStepResult> {
  const controller = input.abortController ?? new AbortController();
  const channel = createEventChannel();
  const work =
    input.models.length > 1
      ? fanOutQuestions(input, controller, channel)
      : soloQuestions(input, controller, channel, firstModel(input.models, "questions"));
  return startRun(channel, controller, stepScope("questions"), work);
}

/** Solo: one generateJson against the grill persona; no reconciler, no grades. */
async function soloQuestions(
  input: QuestionsStepInput,
  controller: AbortController,
  channel: EventChannel,
  model: string,
): Promise<QuestionsStepResult> {
  channel.push({ type: "candidate-start", model });
  try {
    const { data } = await input.runner.generateJson({
      model,
      messages: grillMessages(input.history),
      systemPrompts: [grillSystemPrompt(input.context)],
      schema: grillDecisionSchema,
      options: { abortController: controller },
    });
    channel.push({ type: "candidate-complete", model });
    return {
      step: "questions",
      decision: data,
      mergedModel: model,
      candidates: [{ model, ok: true, decision: data }],
      grades: [],
    };
  } catch (error) {
    channel.push({ type: "candidate-error", model, error: toCandidateError(error) });
    throw error;
  }
}

/** Fan-out: N grill calls on identical inputs, then one reconciler merge+grade. */
async function fanOutQuestions(
  input: QuestionsStepInput,
  controller: AbortController,
  channel: EventChannel,
): Promise<QuestionsStepResult> {
  const scope = stepScope("questions");
  const messages = grillMessages(input.history);
  const systemPrompts = [grillSystemPrompt(input.context)];
  const settled = await runCandidates(input.models, channel, (model) =>
    input.runner
      .generateJson({
        model,
        messages,
        systemPrompts,
        schema: grillDecisionSchema,
        options: { abortController: controller },
      })
      .then(({ data }) => data),
  );
  const candidates: QuestionsCandidate[] = settled.map((attempt) =>
    attempt.ok
      ? { model: attempt.model, ok: true, decision: attempt.output }
      : { model: attempt.model, ok: false, error: attempt.error },
  );
  // Abort outranks the failure taxonomy: a cancelled step was not "all failed".
  assertNotAborted(controller, scope);
  const failures: FailedCall[] = settled.filter(
    (attempt): attempt is FailedCall => !attempt.ok,
  );
  const successes = settled.flatMap((attempt) =>
    attempt.ok ? [{ model: attempt.model, decision: attempt.output }] : [],
  );
  if (successes.length === 0) {
    throw new IdeationAllCandidatesFailedError(
      "questions",
      failures.map((failure) => ({ model: failure.model, error: failure.error })),
    );
  }
  channel.push({ type: "reconcile-start", model: input.reconciler });
  try {
    const { data } = await input.runner.generateJson({
      model: input.reconciler,
      messages: [{ role: "user", content: questionsCandidatesPayload(successes) }],
      systemPrompts: [reconcileQuestionsSystemPrompt(input.context, input.history)],
      schema: reconcileQuestionsSchema,
      options: { abortController: controller },
    });
    channel.push({ type: "reconcile-complete", model: input.reconciler });
    return {
      step: "questions",
      decision: data.merged,
      mergedModel: input.reconciler,
      candidates,
      // Structural guarantee that grades cover only successful candidates:
      // the reconciler only ever sees those, and anything it says about a
      // model that did not respond is dropped here, not persisted.
      grades: gradesForSuccessful(data.grades, successes),
    };
  } catch (error) {
    channel.push({ type: "reconcile-error", model: input.reconciler, error: toCandidateError(error) });
    throw reconcilerFailure(
      error,
      controller,
      scope,
      "questions",
      input.reconciler,
      successes.map((success) => success.model),
    );
  }
}

// --- artifact step -----------------------------------------------------------------

export function runArtifactStep(input: ArtifactStepInput): FanoutRun<ArtifactStepResult> {
  const controller = input.abortController ?? new AbortController();
  const channel = createEventChannel();
  const work =
    input.models.length > 1
      ? fanOutArtifact(input, controller, channel)
      : soloArtifact(input, controller, channel, firstModel(input.models, input.step));
  return startRun(channel, controller, stepScope(input.step), work);
}

/**
 * Bridge the solo stream twin into the event channel: the ONLY consumer of
 * the twin's public iterator (its `final` is awaited separately, per the
 * runner contract — awaiting is mandatory even while iterating). Forwards
 * every chunk, including a terminal RUN_ERROR, as a `delta` event, and ends
 * quietly on failure: failures reject `final`, the channel closes when the
 * step settles, and the attached catch handler means the race-lost pump can
 * never surface an unhandled rejection.
 */
function bridgeDeltas(
  channel: EventChannel,
  twin: StreamedRunResult<GenerateResult>,
  model: string,
): void {
  const pump = (async () => {
    for await (const chunk of twin) {
      channel.push({ type: "delta", model, chunk });
    }
  })();
  pump.catch(() => undefined);
}

/**
 * Solo artifact: the runner's stream twin drives everything. Real deltas
 * flow as `delta` events for Phase 5 to forward live; `final` resolves with
 * the full markdown under the solo model's id (mergedModelFor parity).
 */
async function soloArtifact(
  input: ArtifactStepInput,
  controller: AbortController,
  channel: EventChannel,
  model: string,
): Promise<ArtifactStepResult> {
  channel.push({ type: "candidate-start", model });
  const twin = input.runner.stream({
    model,
    messages: [{ role: "user", content: artifactPrompt(input) }],
    options: { abortController: controller },
  });
  bridgeDeltas(channel, twin, model);
  try {
    const { content } = await twin.final;
    channel.push({ type: "candidate-complete", model });
    return {
      step: input.step,
      markdown: content,
      mergedModel: model,
      candidates: [{ model, ok: true, markdown: content }],
      grades: [],
    };
  } catch (error) {
    channel.push({ type: "candidate-error", model, error: toCandidateError(error) });
    throw error;
  }
}

/**
 * Fan-out artifact (render-on-final, PRD §10): nothing user-visible can
 * stream during the candidates — the user only ever sees the reconciler's
 * merged markdown — so each candidate is a plain generate call (abort
 * forwarded, failures captured per model) with completion riding progress
 * events, and the reconciler's streamJson is pumped to completion through
 * its `final` without forwarding its raw JSON deltas.
 */
async function fanOutArtifact(
  input: ArtifactStepInput,
  controller: AbortController,
  channel: EventChannel,
): Promise<ArtifactStepResult> {
  const scope = stepScope(input.step);
  const prompt = artifactPrompt(input);
  const settled = await runCandidates(input.models, channel, (model) =>
    input.runner
      .generate({
        model,
        messages: [{ role: "user", content: prompt }],
        options: { abortController: controller },
      })
      .then(({ content }) => content),
  );
  const candidates: ArtifactCandidate[] = settled.map((attempt) =>
    attempt.ok
      ? { model: attempt.model, ok: true, markdown: attempt.output }
      : { model: attempt.model, ok: false, error: attempt.error },
  );
  // Abort outranks the failure taxonomy: a cancelled step was not "all failed".
  assertNotAborted(controller, scope);
  const failures: FailedCall[] = settled.filter(
    (attempt): attempt is FailedCall => !attempt.ok,
  );
  const successes = settled.flatMap((attempt) =>
    attempt.ok ? [{ model: attempt.model, markdown: attempt.output }] : [],
  );
  if (successes.length === 0) {
    throw new IdeationAllCandidatesFailedError(
      input.step,
      failures.map((failure) => ({ model: failure.model, error: failure.error })),
    );
  }
  channel.push({ type: "reconcile-start", model: input.reconciler });
  try {
    const twin = input.runner.streamJson({
      model: input.reconciler,
      messages: [{ role: "user", content: artifactCandidatesPayload(successes) }],
      systemPrompts: [reconcileArtifactSystemPrompt(input)],
      schema: reconcileArtifactSchema,
      options: { abortController: controller },
    });
    const { data } = await twin.final;
    channel.push({ type: "reconcile-complete", model: input.reconciler });
    return {
      step: input.step,
      markdown: data.merged,
      mergedModel: input.reconciler,
      candidates,
      grades: gradesForSuccessful(data.grades, successes),
    };
  } catch (error) {
    channel.push({ type: "reconcile-error", model: input.reconciler, error: toCandidateError(error) });
    throw reconcilerFailure(
      error,
      controller,
      scope,
      input.step,
      input.reconciler,
      successes.map((success) => success.model),
    );
  }
}

// --- grades ------------------------------------------------------------------------

/**
 * Keep only the reconciler's grades for models that actually produced a
 * candidate. The reconciler is only ever shown successful candidates, so
 * this structurally guarantees "grades cover only successful candidates"
 * (PRD §6) even if the reconciler echoes a model id that never responded.
 */
function gradesForSuccessful(
  grades: IdeationGrade[],
  successes: ReadonlyArray<{ model: string }>,
): IdeationGrade[] {
  const successful = new Set(successes.map((success) => success.model));
  return grades.filter((grade) => successful.has(grade.model));
}
