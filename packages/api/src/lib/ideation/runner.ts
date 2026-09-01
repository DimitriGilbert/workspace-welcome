import { chat } from "@tanstack/ai";
import { openaiCompatible } from "@tanstack/ai-openai/compatible";
import { z, ZodError } from "zod";
import type {
  AnyTextAdapter,
  ModelMessage,
  StructuredOutputStream,
  StreamChunk,
  SystemPrompt,
} from "@tanstack/ai";

import { listModels } from "./catalog";
import type { IdeationCatalogProvider } from "./shared";

/**
 * The TanStack AI model-runner boundary (PRD §4.1): the ONLY file in the
 * repo that imports `@tanstack/ai` / `@tanstack/ai-openai`, so the SDK's 0.x
 * churn (PRD §10) is confined here. It re-creates ideadump's ModelRunner
 * shape (`ideadump-lib/src/types.ts:78-83`) without the package: four
 * chat-completion operations — generate (text), generateJson (zod-validated
 * structured), stream (text deltas), streamJson (structured with streaming)
 * — over `openaiCompatible({ baseURL })` adapters built per provider from
 * the models.dev catalog plus the provider's env API key.
 *
 * 0.52.1 APIs used (verified against the installed type definitions, not
 * blog posts):
 * - `chat(options)` from `@tanstack/ai` with `TextActivityOptions`:
 *   `{ adapter, messages, systemPrompts, outputSchema, stream,
 *   abortController }`. `outputSchema` takes any Standard Schema — zod v4
 *   qualifies. The return type is driven by `TextActivityResult`:
 *   `stream: false` → `Promise<string>`; `outputSchema` without
 *   `stream: true` → `Promise<schema type>`; `outputSchema` +
 *   `stream: true` → `StructuredOutputStream<T>`; default → `ChatStream`.
 *   Where a caller-supplied generic schema would leave that conditional
 *   deferred, `chat<AnyTextAdapter, z.ZodType, false|true>` instantiates it
 *   explicitly — the only technique needed to stay cast-free on 0.52.1
 *   (ideadump's `as never` casts were a 0.32→0.52 artifact).
 * - `openaiCompatible(config)` from `@tanstack/ai-openai/compatible`:
 *   `{ name, baseURL, apiKey, models }` returns a `(model) => adapter`
 *   factory; it defaults to the Chat Completions API (`api` unset), which
 *   is what every catalog provider's base URL speaks.
 *
 * streamJson capability decision: @tanstack/ai 0.52.1 has NO field-delta
 * streaming of structured output — `chat({ outputSchema, stream: true })`
 * yields the raw JSON as `TEXT_MESSAGE_CONTENT` deltas and a terminal
 * `structured-output.complete` CUSTOM event carrying the assembled (but,
 * on this path, unvalidated) object at `value.object`. So streamJson
 * surfaces those deltas as they arrive and resolves `final` with the
 * zod-validated value on completion — the documented fallback shape. Both
 * JSON ops re-validate with the caller's zod schema at this boundary: the
 * SDK validates Standard Schemas only on the non-streaming path, and the
 * boundary contract ("validated against the caller's schema, typed error on
 * failure") must hold uniformly regardless of SDK internals.
 *
 * Error surfacing (verified in the 0.52.1 engine): non-streaming ops throw
 * `Error`s carrying a `code` property (`"aborted"`,
 * `"structured-output-validation-failed"`, provider codes); streaming ops
 * terminate with a `RUN_ERROR` chunk instead of throwing. Both are mapped
 * onto the typed errors below; aborted calls always reject with
 * `IdeationAbortedError` (including an abort that races completion).
 */

/** One pumped SDK event — an AG-UI protocol chunk (ideadump's StreamEvent). */
export type RunnerStreamChunk = StreamChunk;

/**
 * Element type of the SDK's `StructuredOutputStream` (`chat({ outputSchema,
 * stream: true })`): standard chunks plus the typed structured-output
 * CUSTOM events. Extracted by inference so `value.object` stays `unknown`
 * (typed) instead of the bare `CustomEvent`'s `any` payload.
 */
type StructuredStreamElement = StructuredOutputStream extends AsyncIterable<infer C> ? C : never;

/** Per-call options shared by every runner operation. */
export type GenerateOptions = {
  /** Forwarded to the SDK; aborts the underlying provider request. */
  abortController?: AbortController;
  /**
   * Convenience alternative to `abortController`: bridged onto an internal
   * controller that is forwarded to the SDK. When both are given, `signal`
   * firing aborts `abortController` too.
   */
  signal?: AbortSignal;
};

/** Input of generate/stream (ideadump's GenerateInput, minus tools). */
export type GenerateInput = {
  /** Composite catalog id: "<provider>/<model>", e.g. "zai/glm-5.3-flash". */
  model: string;
  messages: ModelMessage[];
  systemPrompts?: Array<SystemPrompt>;
  options?: GenerateOptions;
};

export type GenerateResult = {
  content: string;
};

/** Input of generateJson/streamJson: generate input plus the zod schema. */
export type GenerateJsonInput<S extends z.ZodType = z.ZodType> =
  GenerateInput & {
    /** The response is validated against this schema before it is returned. */
    schema: S;
  };

export type GenerateJsonResult<S extends z.ZodType = z.ZodType> = {
  data: z.output<S>;
};

/**
 * The run/stream twin (ideadump's StreamedRunResult): consumers iterate
 * deltas while the server awaits `final` before persisting — both views are
 * backed by one pump, so every chunk the stream yields is also seen by
 * `final`, and any failure rejects `final` and throws from `next()` once the
 * buffered chunks are drained.
 */
export type StreamedRunResult<R> = AsyncIterable<RunnerStreamChunk> & {
  final: Promise<R>;
};

/** Discriminant of every error this module throws. */
export type RunnerErrorKind =
  | "missing-key"
  | "unknown-model"
  | "provider"
  | "schema"
  | "aborted";

/** Base class of the typed errors — never a bare string throw. */
export class IdeationRunnerError extends Error {
  readonly kind: RunnerErrorKind;
  /** Composite catalog id of the model being called, when known. */
  readonly model: string;

  constructor(kind: RunnerErrorKind, model: string, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "IdeationRunnerError";
    this.kind = kind;
    this.model = model;
  }
}

/** The provider's env var is unset — the message names the exact var. */
export class IdeationMissingKeyError extends IdeationRunnerError {
  readonly envVar: string;
  readonly providerId: string;

  constructor(model: string, providerId: string, envVar: string) {
    super(
      "missing-key",
      model,
      `provider "${providerId}" needs ${envVar} set to serve model "${model}"`,
    );
    this.name = "IdeationMissingKeyError";
    this.envVar = envVar;
    this.providerId = providerId;
  }
}

/** Malformed id, unknown provider slug, or a model the catalog doesn't list. */
export class IdeationUnknownModelError extends IdeationRunnerError {
  constructor(model: string, message: string) {
    super("unknown-model", model, message);
    this.name = "IdeationUnknownModelError";
  }
}

/** The provider call failed (HTTP or otherwise) — carries the cause. */
export class IdeationProviderError extends IdeationRunnerError {
  /** Provider error code when the SDK surfaced one. */
  readonly code?: string;
  /** HTTP status when the failure was an HTTP response. */
  readonly status?: number;

  constructor(model: string, message: string, details?: { code?: string; status?: number; cause?: unknown }) {
    super("provider", model, message, { cause: details?.cause });
    this.name = "IdeationProviderError";
    this.code = details?.code;
    this.status = details?.status;
  }
}

/** The model's output failed the caller's zod schema. */
export class IdeationSchemaValidationError extends IdeationRunnerError {
  /** Compact one-line rendering of the zod issues. */
  readonly issues: string;

  constructor(model: string, issues: string, cause?: unknown) {
    super("schema", model, `model "${model}" returned output that failed schema validation: ${issues}`, { cause });
    this.name = "IdeationSchemaValidationError";
    this.issues = issues;
  }
}

/** The call was aborted through its AbortController/AbortSignal. */
export class IdeationAbortedError extends IdeationRunnerError {
  constructor(model: string, cause?: unknown) {
    super("aborted", model, `model call for "${model}" was aborted`, { cause });
    this.name = "IdeationAbortedError";
  }
}

/**
 * The ported ModelRunner boundary (ideadump's types.ts:78-83): all four
 * operations, none optional — this module always provides them.
 */
export type ModelRunner = {
  generate(input: GenerateInput): Promise<GenerateResult>;
  generateJson<S extends z.ZodType>(input: GenerateJsonInput<S>): Promise<GenerateJsonResult<S>>;
  stream(input: GenerateInput): StreamedRunResult<GenerateResult>;
  streamJson<S extends z.ZodType>(input: GenerateJsonInput<S>): StreamedRunResult<GenerateJsonResult<S>>;
};

type ResolvedAdapter = {
  adapter: AnyTextAdapter;
  /** The composite catalog id, threaded into typed errors. */
  modelId: string;
};

type CachedFactory = {
  /** Key the factory was built with; a mismatch rebuilds (env changes apply per call). */
  apiKey: string;
  factory: (model: string) => AnyTextAdapter;
};

/** Adapters keyed by "<providerId>|<baseUrl>" — one OpenAI client per provider. */
const adapterCache = new Map<string, CachedFactory>();

function buildFactory(provider: IdeationCatalogProvider, apiKey: string): (model: string) => AnyTextAdapter {
  return openaiCompatible({
    name: provider.id,
    baseURL: provider.baseUrl ?? "",
    apiKey,
    // Composite ids are "<provider>/<model>"; the adapter wants the bare part.
    models: provider.models.map((entry) => entry.id.slice(provider.id.length + 1)),
  });
}

/**
 * Resolve the adapter for a composite catalog id: find the provider in the
 * catalog, read its API key from the environment (per call, so env changes
 * apply without restart), and reuse the cached factory for that
 * provider+baseUrl unless the key changed.
 */
async function resolveAdapter(modelId: string): Promise<ResolvedAdapter> {
  const separator = modelId.indexOf("/");
  if (separator <= 0 || separator === modelId.length - 1) {
    throw new IdeationUnknownModelError(
      modelId,
      `"${modelId}" is not a catalog model id (expected "<provider>/<model>")`,
    );
  }
  const providerId = modelId.slice(0, separator);
  const providers = (await listModels()).providers;
  const provider = providers.find((candidate) => candidate.id === providerId);
  if (!provider) {
    throw new IdeationUnknownModelError(
      modelId,
      `unknown provider "${providerId}" (known: ${providers.map((entry) => entry.id).sort().join(", ") || "none"})`,
    );
  }
  if (!provider.baseUrl) {
    throw new IdeationUnknownModelError(
      modelId,
      `provider "${providerId}" has no OpenAI-compatible base URL in the catalog`,
    );
  }
  if (!provider.models.some((entry) => entry.id === modelId)) {
    throw new IdeationUnknownModelError(
      modelId,
      `model "${modelId}" is not in the catalog for provider "${providerId}"`,
    );
  }
  const apiKey = process.env[provider.envVar];
  if (typeof apiKey !== "string" || apiKey.length === 0) {
    throw new IdeationMissingKeyError(modelId, provider.id, provider.envVar);
  }
  const cacheKey = `${provider.id}|${provider.baseUrl}`;
  let entry = adapterCache.get(cacheKey);
  if (!entry || entry.apiKey !== apiKey) {
    entry = { apiKey, factory: buildFactory(provider, apiKey) };
    adapterCache.set(cacheKey, entry);
  }
  return { adapter: entry.factory(modelId.slice(separator + 1)), modelId };
}

type ResolvedAbort = {
  controller: AbortController;
  cleanup: () => void;
};

/** Bridge the caller's AbortController/AbortSignal into one forwarded controller. */
function resolveAbort(options: GenerateOptions | undefined): ResolvedAbort | undefined {
  const controller = options?.abortController ?? new AbortController();
  const signal = options?.signal;
  if (!signal) {
    return { controller, cleanup: () => undefined };
  }
  if (signal.aborted) {
    controller.abort();
    return { controller, cleanup: () => undefined };
  }
  const onAbort = () => controller.abort();
  signal.addEventListener("abort", onAbort, { once: true });
  return {
    controller,
    cleanup: () => signal.removeEventListener("abort", onAbort),
  };
}

/** Aborted calls reject with a distinguishable error — even if they raced completion. */
function throwIfAborted(abort: ResolvedAbort | undefined, modelId: string): void {
  if (abort?.controller.signal.aborted) {
    throw new IdeationAbortedError(modelId);
  }
}

/** Read `code` off an unknown thrown value without narrowing casts. */
function errorCodeOf(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error && typeof error.code === "string") {
    return error.code;
  }
  return undefined;
}

function errorNameOf(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "name" in error && typeof error.name === "string") {
    return error.name;
  }
  return undefined;
}

function errorStatusOf(error: unknown): number | undefined {
  if (typeof error === "object" && error !== null && "status" in error && typeof error.status === "number") {
    return error.status;
  }
  return undefined;
}

/** An all-digit provider code is an HTTP status (e.g. a RUN_ERROR "429"). */
function numericStatusCode(code: string | undefined): number | undefined {
  return code !== undefined && /^\d+$/.test(code) ? Number(code) : undefined;
}

/**
 * Map one failure onto the typed errors. Accepts both shapes the SDK emits:
 * thrown Errors (non-streaming ops) and `{ message, code }` payloads lifted
 * off a RUN_ERROR chunk (streaming ops) — `cause` carries the original.
 */
function classifyRunnerError(failure: { message?: string; code?: string }, modelId: string, cause?: unknown): IdeationRunnerError {
  const message = failure.message?.trim() || "the provider call failed";
  const code = failure.code;
  const name = errorNameOf(cause);
  const causeCode = errorCodeOf(cause);
  if (code === "aborted" || causeCode === "aborted" || name === "AbortError" || name === "APIUserAbortError" || causeCode === "ERR_CANCELED") {
    return new IdeationAbortedError(modelId, cause);
  }
  if (code === "structured-output-validation-failed" || cause instanceof ZodError) {
    return new IdeationSchemaValidationError(modelId, message, cause);
  }
  return new IdeationProviderError(modelId, message, {
    code,
    status: errorStatusOf(cause) ?? numericStatusCode(code),
    cause,
  });
}

function toRunnerError(error: unknown, modelId: string): IdeationRunnerError {
  if (error instanceof IdeationRunnerError) return error;
  if (error instanceof ZodError) {
    return new IdeationSchemaValidationError(modelId, summarizeZodIssues(error), error);
  }
  const message = error instanceof Error ? error.message : undefined;
  return classifyRunnerError({ message, code: errorCodeOf(error) }, modelId, error);
}

function summarizeZodIssues(error: ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.length > 0 ? `${issue.path.join(".")}: ` : ""}${issue.message}`)
    .join("; ");
}

/** Validate an assembled structured output against the caller's zod schema. */
function parseStructured<S extends z.ZodType>(schema: S, object: unknown, modelId: string): z.output<S> {
  try {
    return schema.parse(object);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new IdeationSchemaValidationError(modelId, summarizeZodIssues(error), error);
    }
    throw error;
  }
}

/**
 * The pump behind both stream twins — ideadump's createStreamedRunResult
 * (`streaming.ts`) with typed-failure semantics added: a terminal RUN_ERROR
 * chunk is published (so SSE forwarders still see it), then `final` rejects
 * and `next()` throws once buffered chunks are drained; a failure thrown by
 * the source or the finalizer behaves the same. `start` acquiring the
 * source inside the pump keeps synchronous SDK errors (schema conversion,
 * etc.) on the `final` rejection path instead of exploding `stream()`.
 */
function createStreamedResult<R, C extends RunnerStreamChunk>(input: {
  modelId: string;
  options?: GenerateOptions;
  start: (abortController: AbortController | undefined) => Promise<AsyncIterable<C>>;
  finalize: (chunks: C[]) => R | Promise<R>;
}): StreamedRunResult<R> {
  const chunks: C[] = [];
  const events: C[] = [];
  const waiters: Array<{
    resolve: (result: IteratorResult<RunnerStreamChunk>) => void;
    reject: (error: IdeationRunnerError) => void;
  }> = [];
  let completed = false;
  let failure: IdeationRunnerError | undefined;

  const final = pump();

  async function pump(): Promise<R> {
    const abort = resolveAbort(input.options);
    try {
      const source = await input.start(abort?.controller);
      for await (const chunk of source) {
        chunks.push(chunk);
        const broad: RunnerStreamChunk = chunk;
        if (broad.type === "RUN_ERROR") {
          failure = classifyRunnerError(
            { message: broad.message, code: broad.code },
            input.modelId,
          );
        }
        publish(chunk);
        if (failure) break;
      }
      throwIfAborted(abort, input.modelId);
      if (failure) throw failure;
      return await input.finalize(chunks);
    } catch (error) {
      failure = toRunnerError(error, input.modelId);
      throw failure;
    } finally {
      completed = true;
      abort?.cleanup();
      flushWaiters();
    }
  }

  function publish(event: C): void {
    const waiter = waiters.shift();
    if (waiter) {
      waiter.resolve({ value: event, done: false });
      return;
    }
    events.push(event);
  }

  function flushWaiters(): void {
    for (const waiter of waiters.splice(0)) {
      if (failure) {
        waiter.reject(failure);
      } else {
        waiter.resolve({ value: undefined, done: true });
      }
    }
  }

  return {
    final,
    [Symbol.asyncIterator]() {
      return {
        next: (): Promise<IteratorResult<RunnerStreamChunk>> => {
          const event = events.length > 0 ? events.shift() : undefined;
          if (event !== undefined) {
            return Promise.resolve({ value: event, done: false });
          }
          if (completed) {
            if (failure) {
              return Promise.reject(failure);
            }
            return Promise.resolve({ value: undefined, done: true });
          }
          return new Promise<IteratorResult<RunnerStreamChunk>>((resolve, reject) => {
            waiters.push({ resolve, reject });
          });
        },
      };
    },
  };
}

/** Concatenate the TEXT_MESSAGE_CONTENT deltas of a pumped stream. */
function collectText(chunks: ReadonlyArray<RunnerStreamChunk>): string {
  let content = "";
  for (const chunk of chunks) {
    if (chunk.type === "TEXT_MESSAGE_CONTENT") {
      content += chunk.delta;
    }
  }
  return content;
}

/** The assembled object of a pumped structured stream, when one arrived. */
function structuredObjectOf(chunks: ReadonlyArray<StructuredStreamElement>): { found: boolean; object: unknown } {
  for (const chunk of chunks) {
    if (chunk.type === "CUSTOM" && chunk.name === "structured-output.complete") {
      return { found: true, object: chunk.value.object };
    }
  }
  return { found: false, object: undefined };
}

/**
 * Build the runner. Adapter resolution is dynamic (catalog + env per call),
 * so the factory takes no configuration — one instance serves the whole app.
 */
export function createModelRunner(): ModelRunner {
  return {
    generate: async (input) => {
      const { adapter, modelId } = await resolveAdapter(input.model);
      const abort = resolveAbort(input.options);
      try {
        const content = await chat({
          adapter,
          messages: input.messages,
          systemPrompts: input.systemPrompts,
          abortController: abort?.controller,
          stream: false,
        });
        throwIfAborted(abort, modelId);
        return { content };
      } catch (error) {
        throw toRunnerError(error, modelId);
      } finally {
        abort?.cleanup();
      }
    },

    generateJson: async <S extends z.ZodType>(input: GenerateJsonInput<S>) => {
      const { adapter, modelId } = await resolveAdapter(input.model);
      const abort = resolveAbort(input.options);
      try {
        const raw: unknown = await chat<AnyTextAdapter, z.ZodType, false>({
          adapter,
          messages: input.messages,
          systemPrompts: input.systemPrompts,
          outputSchema: input.schema,
          abortController: abort?.controller,
        });
        throwIfAborted(abort, modelId);
        return { data: parseStructured(input.schema, raw, modelId) };
      } catch (error) {
        throw toRunnerError(error, modelId);
      } finally {
        abort?.cleanup();
      }
    },

    stream: (input) =>
      createStreamedResult({
        modelId: input.model,
        options: input.options,
        start: async (abortController) => {
          const { adapter } = await resolveAdapter(input.model);
          return chat({
            adapter,
            messages: input.messages,
            systemPrompts: input.systemPrompts,
            abortController,
          });
        },
        finalize: (chunks) => ({ content: collectText(chunks) }),
      }),

    streamJson: <S extends z.ZodType>(input: GenerateJsonInput<S>) =>
      createStreamedResult({
        modelId: input.model,
        options: input.options,
        start: async (abortController) => {
          const { adapter } = await resolveAdapter(input.model);
          const source: StructuredOutputStream = chat<AnyTextAdapter, z.ZodType, true>({
            adapter,
            messages: input.messages,
            systemPrompts: input.systemPrompts,
            outputSchema: input.schema,
            stream: true,
            abortController,
          });
          return source;
        },
        finalize: (chunks: StructuredStreamElement[]) => {
          const { found, object } = structuredObjectOf(chunks);
          if (!found) {
            throw new IdeationProviderError(
              input.model,
              `the stream for "${input.model}" ended without a structured-output.complete event`,
            );
          }
          return { data: parseStructured(input.schema, object, input.model) };
        },
      }),
  };
}
