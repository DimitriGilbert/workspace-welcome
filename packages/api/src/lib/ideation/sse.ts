import { chatParamsFromRequest, EventType, toServerSentEventsResponse } from "@tanstack/ai";

export type { ModelMessage, StreamChunk, UIMessage } from "@tanstack/ai";

/**
 * The server-side SSE transport slice of @tanstack/ai 0.52.1 (PRD §4.3):
 * re-exported here because apps/web — which depends on @tanstack/ai-react
 * only, and resolves packages through pnpm's isolated node_modules — cannot
 * import @tanstack/ai itself. Consuming the SDK through this package's
 * sources keeps every SDK import inside packages/api (the runner.ts
 * discipline, PRD §4.1/§10), while the version stays exact-pinned once in
 * the pnpm-workspace catalog.
 *
 * - `chatParamsFromRequest(request)` — parses the POST body as an AG-UI
 *   `RunAgentInput` (`{ messages, threadId, runId, ... }`); throws a 400
 *   `Response` TanStack Start returns directly on a malformed body.
 * - `toServerSentEventsResponse(stream, init)` — wraps an
 *   `AsyncIterable<StreamChunk>` into the SSE `Response`; `init.abortController`
 *   fires both ways: client disconnect cancels the response body and aborts
 *   the controller, and aborting the controller stops the pump.
 * - `EventType` — the AG-UI event-type enum; event objects are constructed
 *   with its members (`{ type: EventType.RUN_STARTED, ... }`), per the
 *   documented creation shape in @tanstack/ai's types.
 *
 * Server-only on purpose (runtime SDK import): nothing under apps/web/src may
 * import this from client code — the client-safe wire shapes live beside the
 * route instead.
 */
export { chatParamsFromRequest, EventType, toServerSentEventsResponse };
