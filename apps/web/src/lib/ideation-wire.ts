import type { IdeationStep } from "@workspace-welcome/api/lib/ideation/shared";
import type { RunnerErrorKind } from "@workspace-welcome/api/lib/ideation/runner";

/**
 * The client-safe wire contract of the ideation chat route (PRD §4.3):
 * the endpoint, the sentinel commands that ride the message stream, and the
 * AG-UI CUSTOM event vocabulary the SSE route emits. Types and constants
 * only — zero runtime imports beyond constants, so Phase 6 can pull this
 * into the panel bundle freely; the route file itself stays server-only.
 *
 * Sentinel tension (PRD §10): control ops ride the SSE message stream as
 * ‹…›-style sentinels because `useChat` owns the transport. The same
 * constants are matched server-side (here, once) and filtered from the
 * visible transcript client-side (Phase 6) — emit and render share this
 * module, so the string-matching lives in exactly one place per side.
 */

/** The SSE chat route (PRD §4.3) — POST, AG-UI events on the wire. */
export const IDEATION_CHAT_ENDPOINT = "/api/ideation/chat";

/**
 * Sent by the panel to run the first grilling turn on a fresh session —
 * there is no answer yet, so the engine substitutes its own deterministic
 * kickoff message and the route appends nothing to the transcript.
 */
export const IDEATION_KICKOFF_SENTINEL = "‹start-interview›";

/** Sent by the "Create PRD" action while the session is in the prd phase. */
export const IDEATION_GENERATE_PRD_SENTINEL = "‹generate-prd›";

/** Sent by the "Create plan" action while the session is in the planning phase. */
export const IDEATION_GENERATE_PLAN_SENTINEL = "‹generate-plan›";

/** True when the raw user-typed text is one of the sentinel commands. */
export function isIdeationSentinel(text: string): boolean {
  const trimmed = text.trim();
  return (
    trimmed === IDEATION_KICKOFF_SENTINEL ||
    trimmed === IDEATION_GENERATE_PRD_SENTINEL ||
    trimmed === IDEATION_GENERATE_PLAN_SENTINEL
  );
}

/** Build the chat URL: session identity rides as query params (PRD §4.3). */
export function ideationChatUrl(sessionId: string, projectPath: string): string {
  const params = new URLSearchParams({
    session: sessionId,
    project: projectPath,
  });
  return `${IDEATION_CHAT_ENDPOINT}?${params.toString()}`;
}

// --- CUSTOM events ----------------------------------------------------------------
//
// AG-UI CUSTOM events are the extensibility channel (`{ type: "CUSTOM",
// name, value }`); toServerSentEventsResponse keeps `name` + `value` on the
// wire, and every per-message extra rides them because the spec strips
// unknown keys off the standard events.

/** Per-model progress chip: one of the step's candidate models changed state. */
export const IDEATION_CANDIDATE_EVENT = "ideation.candidate";

/** Reconciler chip: the fan-out merge call changed state (fan-out only). */
export const IDEATION_RECONCILER_EVENT = "ideation.reconciler";

/** Soft note, e.g. "2 of 3 models responded" after a mid-fan-out failure. */
export const IDEATION_STEP_NOTE_EVENT = "ideation.step-note";

/** Message metadata: the suggested-answer chips of a grilling question. */
export const IDEATION_SUGGESTED_ANSWERS_EVENT = "ideation.suggested-answers";

/** Lifecycle of one candidate / the reconciler chip. */
export type IdeationChipPhase = "start" | "complete" | "error";

/** A failed model call, as surfaced on chips and candidate errors. */
export interface IdeationWireError {
  kind: RunnerErrorKind;
  message: string;
}

export interface IdeationCandidateEventValue {
  /** questions | prd | plan. */
  step: IdeationStep;
  phase: IdeationChipPhase;
  /** Composite catalog id, e.g. "zai/glm-5.3-flash". */
  model: string;
  /** Present when phase is "error". */
  error?: IdeationWireError;
}

export interface IdeationReconcilerEventValue {
  step: IdeationStep;
  phase: IdeationChipPhase;
  /** The reconciler's catalog id. */
  model: string;
  error?: IdeationWireError;
}

export interface IdeationStepNoteEventValue {
  step: IdeationStep;
  /** Human-readable, e.g. "2 of 3 models responded". */
  note: string;
}

export interface IdeationSuggestedAnswersEventValue {
  /** The assistant message the suggested answers belong to. */
  messageId: string;
  /** 0–4 short answers (PRD §4.2); may be empty. */
  suggestedAnswers: string[];
}
