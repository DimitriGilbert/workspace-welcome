import { readdir, readFile } from "node:fs/promises";

import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { listModels } from "../lib/ideation/catalog";
import { gatherProjectContext } from "../lib/ideation/context";
import {
  CANDIDATES_DIR_NAME,
  IDEADUMP_DIR_NAME,
  IDEATION_DIR_NAME,
  createSession,
  listSessions,
  loadSession,
  parseMatterBlock,
  saveArtifacts,
} from "../lib/ideation/session";
import {
  IDEATION_STEPS,
  ideationCandidateSchema,
  ideationModelSetSchema,
  ideationStepSchema,
} from "../lib/ideation/shared";
import { requireKnownProject } from "../lib/known-project";
import { resolveInside } from "../lib/file-ops";
import { readSettings } from "../lib/store";
import { scaffoldInputSchema } from "../lib/scaffold-options";
import { publicProcedure, router } from "../index";
import type {
  IdeationCandidate,
  IdeationCatalogProvider,
  IdeationModelSet,
  IdeationStep,
} from "../lib/ideation/shared";

/**
 * Ideation router (PRD §4.4): the control plane of the ideation panel —
 * model catalog for the picker, the pre-start context preview, session
 * lifecycle (start / poll / list), the candidates drawer listing, and the
 * write-once save of the final docs/ artifacts. All disk work is delegated
 * to ideation/session.ts, whose every path goes through requireKnownProject
 * + resolveInside (PRD §4.6); the only
 * filesystem this file touches directly is the read-only walk of a session's
 * candidates/ tree, under the same discipline.
 *
 * Key values never cross this boundary — models.list reports `keyPresent`
 * booleans only (PRD §8). Client-consumable input/output shapes live in
 * ideation/shared.ts.
 */

/**
 * Early feedback mirroring session.ts's real gate (sessionDirRel): session
 * ids also arrive from the wire, so the pattern is revalidated there before
 * any use as a path segment — defense in depth on top of resolveInside.
 */
const sessionId = z
  .string()
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/,
    "Invalid ideation session id",
  );

/** Early feedback mirroring createSession's non-blank idea gate. */
const idea = z
  .string()
  .refine(
    (s) => s.trim().length > 0,
    "An idea is required to start an ideation session.",
  );

/** Final artifacts (PRD §4.4) — the docs/ subset of the step enum. */
const artifactKind = z.enum(["prd", "plan"]);

/**
 * Validate a model set against the live catalog (PRD §7): every selected
 * model — by its full composite id — must be listed under a provider that
 * carries its env key. Returns null when the set is usable, else a
 * human-readable problem message naming every absent env var ("Set
 * ZAI_API_KEY to use zai models") and every model the current catalog does
 * not know.
 */
function modelSetProblem(
  models: IdeationModelSet,
  providers: IdeationCatalogProvider[],
): string | null {
  const bySlug = new Map(providers.map((p) => [p.id, p]));
  // env var → provider slugs whose key is missing (one env var per provider).
  const missingKeys = new Map<string, string[]>();
  const unknown: string[] = [];
  const selected = [
    ...models.questions,
    ...models.prd,
    ...models.plan,
    models.reconciler,
  ];
  for (const id of new Set(selected)) {
    const slug = id.split("/")[0] ?? "";
    const provider = bySlug.get(slug);
    // The composite id — not just the provider slug — must be in the catalog,
    // so a typo'd model fails here instead of freezing into session.json.
    if (
      provider === undefined ||
      !provider.models.some((m) => m.id === id)
    ) {
      unknown.push(id);
    } else if (!provider.keyPresent) {
      const slugs = missingKeys.get(provider.envVar) ?? [];
      slugs.push(provider.id);
      missingKeys.set(provider.envVar, slugs);
    }
  }
  if (missingKeys.size === 0 && unknown.length === 0) return null;
  const problems = [
    ...[...missingKeys.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(
        ([envVar, slugs]) =>
          `Set ${envVar} to use ${[...new Set(slugs)].sort().join(", ")} models`,
      ),
    ...unknown
      .sort()
      .map((id) => `ideation model "${id}" is not in the current models.dev catalog`),
  ];
  return problems.join("; ");
}

/** The session subtree root, relative to the project (PRD §5 layout). */
function sessionDirRel(targetSessionId: string): string {
  return `${IDEADUMP_DIR_NAME}/${IDEATION_DIR_NAME}/${targetSessionId}`;
}

/**
 * Enumerate one session's persisted candidates (PRD §4.4): walk
 * `candidates/<step>/<provider>/<model>.md`, parse each file's matter block,
 * and shape it for the drawer. Each directory level is resolved through
 * resolveInside so a symlink escape is rejected (criterion 9); a candidates
 * tree that does not exist yet — every session starts without one — is an
 * empty list, while a candidate file whose matter is missing or unreadable
 * is skipped so one bad file cannot hide the rest (listSessions' discipline).
 */
async function listCandidates(
  projectPath: string,
  targetSessionId: string,
  step: IdeationStep | null,
): Promise<IdeationCandidate[]> {
  const absProject = await requireKnownProject(projectPath);
  const candidatesRel = `${sessionDirRel(targetSessionId)}/${CANDIDATES_DIR_NAME}`;
  const candidatesRoot = await resolveInside(absProject, candidatesRel);
  const stepDirents = await readdir(candidatesRoot, { withFileTypes: true }).catch(
    (err: NodeJS.ErrnoException) => {
      if (err.code === "ENOENT") return null;
      throw err;
    },
  );
  if (stepDirents === null) return [];
  const rows: IdeationCandidate[] = [];
  for (const stepDirent of stepDirents) {
    if (!stepDirent.isDirectory()) continue;
    if (step !== null && stepDirent.name !== step) continue;
    const stepDir = await resolveInside(
      absProject,
      `${candidatesRel}/${stepDirent.name}`,
    );
    for (const providerDirent of await readdir(stepDir, { withFileTypes: true })) {
      if (!providerDirent.isDirectory()) continue;
      const providerDir = await resolveInside(
        absProject,
        `${candidatesRel}/${stepDirent.name}/${providerDirent.name}`,
      );
      for (const fileDirent of await readdir(providerDir, {
        withFileTypes: true,
      })) {
        if (!fileDirent.isFile() || !fileDirent.name.endsWith(".md")) continue;
        const rel = `${candidatesRel}/${stepDirent.name}/${providerDirent.name}/${fileDirent.name}`;
        const raw = await readFile(
          await resolveInside(absProject, rel),
          "utf8",
        );
        const { matter } = parseMatterBlock(raw);
        if (matter === null) continue;
        // The matter block is the source of truth — the drawer row is typed
        // and enum-checked through the shared schema, not by trusting the
        // directory names.
        const parsed = ideationCandidateSchema.safeParse({
          step: matter.step,
          model: matter.model,
          score: matter.score,
          rationale: matter.rationale,
          error: matter.error,
          file: rel,
        });
        if (parsed.success) rows.push(parsed.data);
      }
    }
  }
  return rows.sort(
    (a, b) =>
      IDEATION_STEPS.indexOf(a.step) - IDEATION_STEPS.indexOf(b.step) ||
      a.model.localeCompare(b.model),
  );
}

export const ideationRouter = router({
  models: router({
    /**
     * Every catalog provider reachable through the OpenAI-compatible adapter,
     * with key-presence booleans (never values) and a soft `warning` when a
     * degraded source was served — the picker's data source (PRD §4.4, §7).
     */
    list: publicProcedure.query(() => listModels()),
  }),

  context: router({
    /**
     * Pre-start context preview (criterion 1): the one-line summary the
     * gatherer produces, served on demand for the idea form so even an
     * un-seeded project shows its real bts.jsonc/tree/README/git context
     * before the first session exists. Read-only — nothing is persisted,
     * the frozen copy is gatherer output re-run at session.start — and the
     * idea is empty because the summary describes the project, not the
     * draft. Containment is the same requireKnownProject gate every other
     * procedure here passes (PRD §4.6).
     */
    preview: publicProcedure
      .input(z.object({ path: z.string() }))
      .query(async ({ input }) => {
        const projectPath = await requireKnownProject(input.path);
        const { contextSummary } = await gatherProjectContext(projectPath, "");
        return { contextSummary };
      }),
  }),

  session: router({
    /**
     * Start a session: gathers and freezes the project context, writes
     * session.json + context.json under `.ideadump/ideation/<id>/`, and
     * persists the scaffold seed immediately (PRD §4.4). `models` defaults
     * to the flattened settings block; the effective set is validated
     * against the catalog first, so a session whose models' keys are
     * missing fails cleanly naming every absent env var (PRD §7) before
     * anything is written.
     */
    start: publicProcedure
      .input(
        z.object({
          path: z.string(),
          idea,
          scaffoldInput: scaffoldInputSchema.optional(),
          models: ideationModelSetSchema.optional(),
        }),
      )
      .mutation(async ({ input }) => {
        const settings = await readSettings();
        const models: IdeationModelSet =
          input.models ??
          // Settings nest the reconciler beside the per-step sets; sessions
          // freeze the flat IdeationModelSet (session.ts's CreateSessionInput).
          {
            ...settings.ideation.models,
            reconciler: settings.ideation.reconciler,
          };
        const problem = modelSetProblem(models, (await listModels()).providers);
        if (problem !== null) {
          throw new TRPCError({ code: "BAD_REQUEST", message: problem });
        }
        const { sessionId: startedId, contextSummary } = await createSession({
          projectPath: input.path,
          idea: input.idea,
          scaffoldInput: input.scaffoldInput ?? null,
          models,
        });
        return { sessionId: startedId, phase: "grilling", contextSummary };
      }),

    /**
     * Full session snapshot — transcript, phase, model sets, artifact status
     * — or null when the id is unknown; doubles as the status/poll op
     * (PRD §4.4, §7: disk is the resume source of truth after restarts).
     */
    get: publicProcedure
      .input(z.object({ path: z.string(), sessionId }))
      .query(({ input }) => loadSession(input.path, input.sessionId)),
  }),

  sessions: router({
    /** Session summaries for the panel's resume picker, newest-updated first. */
    list: publicProcedure
      .input(z.object({ path: z.string() }))
      .query(({ input }) => listSessions(input.path)),
  }),

  candidates: router({
    /**
     * The candidates drawer listing (PRD §4.4): every persisted candidate of
     * the session — step, model, score/rationale when reconciled, error when
     * failed, and the project-relative file path — optionally narrowed to
     * one step.
     */
    list: publicProcedure
      .input(
        z.object({
          path: z.string(),
          sessionId,
          step: ideationStepSchema.optional(),
        }),
      )
      .query(({ input }) =>
        listCandidates(input.path, input.sessionId, input.step ?? null),
      ),
  }),

  artifacts: router({
    /**
     * Save the merged PRD/plan into docs/ with write-once semantics: an
     * existing target comes back as a collision unless the caller passed
     * `overwrite` after an explicit confirm — never silently replaced
     * (PRD §4.4, §7). First save in a git repo also offers the one-time
     * `.ideadump/` gitignore append via `gitignoreAppended`.
     */
    save: publicProcedure
      .input(
        z.object({
          path: z.string(),
          sessionId,
          artifacts: z.array(artifactKind).min(1),
          overwrite: z.boolean().optional(),
        }),
      )
      .mutation(({ input }) =>
        saveArtifacts({
          projectPath: input.path,
          sessionId: input.sessionId,
          artifacts: input.artifacts,
          overwrite: input.overwrite,
        }),
      ),
  }),
});
