import { z } from "zod";

import type { ScaffoldInput } from "../scaffold-options";

/**
 * The client-safe half of the ideation pipeline (PRD §4.1): phases, message
 * and model-set shapes, candidate/grade records, the session.json snapshot,
 * and the zod schemas shared by the model runner and the UI — with zero
 * Node-only imports so apps/web can pull it straight into its bundle (the
 * scaffold-options.ts discipline). Disk persistence lives in session.ts;
 * everything touching the model SDK lives in runner.ts.
 */

/** Pipeline phases (PRD §4.2): grilling → prd → planning → done. */
export const IDEATION_PHASES = ["grilling", "prd", "planning", "done"] as const;
export type IdeationPhase = (typeof IDEATION_PHASES)[number];
export const ideationPhaseSchema = z.enum(IDEATION_PHASES);

/**
 * The three fan-out-able pipeline steps — also the matter block's `step`
 * domain and the candidates/ directory segments (PRD §5).
 */
export const IDEATION_STEPS = ["questions", "prd", "plan"] as const;
export type IdeationStep = (typeof IDEATION_STEPS)[number];
export const ideationStepSchema = z.enum(IDEATION_STEPS);

/** Saved final artifacts: the two write-once files under docs/ (PRD §4.4). */
export type IdeationArtifactKind = Exclude<IdeationStep, "questions">;

/** One chat turn, as persisted to session.json and transcript.jsonl. */
export const ideationMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  /** ISO timestamp. */
  createdAt: z.string(),
  /** Present on assistant grilling turns that carried suggested answers. */
  suggestedAnswers: z.array(z.string()).optional(),
});
export type IdeationMessage = z.infer<typeof ideationMessageSchema>;

/** Per-step model sets: catalog ids like "zai/glm-5.3-flash" (PRD §6). */
export const ideationStepModelsSchema = z.object({
  questions: z.array(z.string().min(1)).min(1),
  prd: z.array(z.string().min(1)).min(1),
  plan: z.array(z.string().min(1)).min(1),
});
export type IdeationStepModels = z.infer<typeof ideationStepModelsSchema>;

/** The `models` block frozen into session.json at start (PRD §4.5). */
export const ideationModelSetSchema = ideationStepModelsSchema.extend({
  /** Merges + grades fan-out candidates; dormant while every step is solo. */
  reconciler: z.string().min(1),
});
export type IdeationModelSet = z.infer<typeof ideationModelSetSchema>;

/** The `ideation` block persisted in Settings (PRD §4.5). */
export const ideationSettingsSchema = z.object({
  models: ideationStepModelsSchema,
  reconciler: z.string().min(1),
});
export type IdeationSettings = z.infer<typeof ideationSettingsSchema>;

/**
 * Defaults (PRD §6): solo `glm-5.3-flash` on every step, flagship `glm-5.3`
 * as reconciler — catalog ids with the models.dev provider slug `zai`.
 * Frozen so shared references can't be mutated by consumers.
 */
export const DEFAULT_STEP_MODELS: Readonly<
  Record<IdeationStep, readonly string[]>
> = Object.freeze({
  questions: Object.freeze(["zai/glm-5.3-flash"]),
  prd: Object.freeze(["zai/glm-5.3-flash"]),
  plan: Object.freeze(["zai/glm-5.3-flash"]),
});
export const DEFAULT_RECONCILER_MODEL = "zai/glm-5.3";

/** A saved final artifact, as tracked in session.json (PRD §5). */
export interface IdeationArtifactStatus {
  /** Project-relative target, e.g. "docs/PRD.md". */
  path: string;
  /** ISO timestamp of the save. */
  savedAt: string;
}

/** session.json snapshot (PRD §5) — the on-disk resume source of truth. */
export interface IdeationSession {
  id: string;
  /** Absolute path of the owning project. */
  projectPath: string;
  createdAt: string;
  updatedAt: string;
  phase: IdeationPhase;
  idea: string;
  /** Scaffold-wizard seed frozen at start (deep-link flow), or null. */
  scaffoldInput: ScaffoldInput | null;
  questionHistory: IdeationMessage[];
  /**
   * Per-session model choices copied from settings at start, so later
   * settings changes never rewrite a session's provenance (PRD §4.5).
   */
  models: IdeationModelSet;
  artifacts: Partial<Record<IdeationArtifactKind, IdeationArtifactStatus>>;
}

/** One row of candidates.list / the candidates drawer (PRD §4.4). */
export const ideationCandidateSchema = z.object({
  step: ideationStepSchema,
  /** Catalog provider/model id, e.g. "zai/glm-5.3-flash". */
  model: z.string(),
  /** 0–10, reconciler-assigned; omitted in solo mode and on failure. */
  score: z.number().int().min(0).max(10).optional(),
  /** One line; omitted when ungraded. */
  rationale: z.string().optional(),
  /** Present only when this candidate's model call failed. */
  error: z.string().optional(),
  /** Project-relative path to the persisted candidate file. */
  file: z.string(),
});
export type IdeationCandidate = z.infer<typeof ideationCandidateSchema>;

/** The grill decision (PRD §4.2, ported verbatim): one question, or done. */
export const grillDecisionSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("question"),
    question: z.string().min(1),
    suggestedAnswers: z.array(z.string()).default([]),
  }),
  z.object({ status: z.literal("complete"), reason: z.string().optional() }),
]);
export type GrillDecision = z.infer<typeof grillDecisionSchema>;

/** One reconciler grade for a candidate — also the grades.jsonl record. */
export const ideationGradeSchema = z.object({
  model: z.string(),
  score: z.number().int().min(0).max(10),
  rationale: z.string(), // one line
});
export type IdeationGrade = z.infer<typeof ideationGradeSchema>;

export const gradesSchema = z.array(ideationGradeSchema);

/** Reconciler outputs (PRD §6): the merged result plus per-candidate grades. */
export const reconcileQuestionsSchema = z.object({
  merged: grillDecisionSchema,
  grades: gradesSchema,
});
export type ReconcileQuestions = z.infer<typeof reconcileQuestionsSchema>;

export const reconcileArtifactSchema = z.object({
  merged: z.string().min(1),
  grades: gradesSchema,
});
export type ReconcileArtifact = z.infer<typeof reconcileArtifactSchema>;

/**
 * The matter block (PRD §5): YAML front matter atop every persisted
 * candidate file — the traceability record of what ran, when, and how well.
 */
export interface CandidateMatter {
  /** questions | prd | plan. */
  step: IdeationStep;
  /** Catalog provider/model id, e.g. "zai/glm-5.3-flash". */
  model: string;
  /** ISO timestamp of generation. */
  timestamp: string;
  /** 0–10, reconciler-assigned; omitted in solo mode. */
  score?: number;
  /** One line; omitted when ungraded. */
  rationale?: string;
  /** Present only when this candidate failed. */
  error?: string;
}

/** Final artifacts carry matter too, with provenance instead of grades. */
export interface ArtifactMatter {
  step: IdeationArtifactKind;
  /** Owning session id. */
  session: string;
  /** ISO timestamp; kebab-case as serialized into the front matter. */
  "generated-at": string;
  /** Catalog ids of every candidate that ran for this step. */
  models: string[];
  /** Omitted in solo mode. */
  reconciler?: string;
}
