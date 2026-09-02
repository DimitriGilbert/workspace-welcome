# Ideation feature: TanStack AI options research

Date: 2026-09-01
Question: for workspace-welcome (TanStack Start v1, tRPC in-app, Tailwind v4, shadcn-style on Base UI), what does building an AI "ideation" feature natively with TanStack AI look like — a chat that asks clarifying questions about a project idea, then generates PRD + plan Markdown saved into a server-side directory? Default model `glm-5.3-flash` (z.ai GLM, OpenAI-compatible), with multi-model fan-out. Verdict at the bottom versus reusing `~/workspace/ideadump/packages/ideadump-lib`.

All web claims cite primary sources (tanstack.com, ui.shadcn.com, docs.z.ai, ai-sdk.dev, pnpm.io, npm registry), checked 2026-09-01. Local claims cite files in the two repos.

## 1. TanStack AI today

### Packages

| Package (npm latest, 2026-09-01) | Role |
| --- | --- |
| `@tanstack/ai` **0.52.1** | Core: `chat()`, `toolDefinition()` (isomorphic `.server()`/`.client()`), adapters, agent loop strategies, SSE server helpers |
| `@tanstack/ai-client` 0.29.x | Headless client: chat state, connection adapters (SSE/HTTP), tool execution, approvals |
| `@tanstack/ai-react` **0.22.4** | `useChat` hook, `InferChatMessages` (peers: `@tanstack/ai ^0.52.0`, react >= 18) |
| `@tanstack/ai-openai` | OpenAI adapter + the generic **OpenAI-compatible** adapter at subpath `/compatible` |
| `@tanstack/ai-openrouter` 0.19.6 | Docs' "recommended" provider adapter (300+ models) |
| others | `@tanstack/ai-anthropic`, `-gemini`, `-groq`, `-grok`, `-ollama`, `-vertex`, `-bedrock`, `-vercel-gateway`, … (16 official LLM adapters per the comparison page) |

Sources: [overview](https://tanstack.com/ai/latest/docs/getting-started/overview), [npm @tanstack/ai](https://registry.npmjs.org/@tanstack/ai/latest), [npm @tanstack/ai-react](https://registry.npmjs.org/@tanstack/ai-react/latest), [comparison](https://tanstack.com/ai/latest/docs/comparison/vercel-ai-sdk).

### Server-side usage in TanStack Start — yes, first-class

The quick start's blessed shape is a **file-based server route handler** (the same `routes/api/…` mechanism this app already uses for tRPC — `apps/web/src/routes/api/` exists today), not `createServerFn`. The docs state it "works with TanStack Start, Next.js, SvelteKit, Hono, and any host that returns a Web `Response`" ([quick start](https://tanstack.com/ai/latest/docs/getting-started/quick-start)):

```ts
// routes/api/ideation/chat.ts (server)
import { chat, chatParamsFromRequest, toServerSentEventsResponse } from "@tanstack/ai";
import { openaiCompatible } from "@tanstack/ai-openai/compatible";

const zai = openaiCompatible({
  baseURL: "https://api.z.ai/api/paas/v4",
  apiKey: process.env.ZAI_API_KEY!,
  models: ["glm-5.3-flash", "glm-5.3", "glm-4.7-flash", "glm-4.5-flash"],
});

export const Route = createFileRoute("/api/ideation/chat")({
  server: { handlers: { POST: async ({ request }) => {
    const { messages } = await chatParamsFromRequest(request);
    const stream = chat({ adapter: zai("glm-5.3-flash"), messages });
    return toServerSentEventsResponse(stream);   // SSE Web Response
  }}},
});
```

Client:

```tsx
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react"; // fetchServerSentEvents from client pkg per docs sample
const { messages, sendMessage, isLoading, stop } = useChat({
  connection: fetchServerSentEvents("/api/ideation/chat"),
});
```

So the streaming primitives are consumable over HTTP/SSE out of the box: `toServerSentEventsResponse` (server) + `fetchServerSentEvents` connection (client). Events on the wire are native **AG-UI protocol** events — `@tanstack/ai` depends on `@ag-ui/core` directly ([npm](https://registry.npmjs.org/@tanstack/ai/latest): `"@ag-ui/core": "0.1.1-canary.beta.0"`). The event vocabulary (`RUN_STARTED`, `TEXT_MESSAGE_CONTENT`, `TOOL_CALL_*`, `RUN_FINISHED`, `RUN_ERROR`) is exactly what ideadump-lib's `StreamEvent` handling already consumes (see `ideadump/packages/ideadump-lib/src/streaming.ts`).

Non-streaming works too: `chat({ stream: false })` resolves to the final string (ideadump-lib's `tanstack.ts` relies on this).

### z.ai (GLM) endpoint support — documented, first-party

The OpenAI-compatible adapter ships in `@tanstack/ai-openai/compatible` and the docs' provider table lists **Z.AI (GLM)** explicitly: `baseURL: https://api.z.ai/api/paas/v4`, example model `glm-4.6` ([adapter docs](https://tanstack.com/ai/latest/docs/adapters/openai-compatible)). z.ai's own docs confirm that base URL is OpenAI-SDK compatible ([quick start](https://docs.z.ai/guides/overview/quick-start), [HTTP intro](https://docs.z.ai/guides/develop/http/introduction)). Model ids declared as bare strings get streaming + function calling + structured outputs by default; `createModel(name, capabilities)` gives precise control. Default API is `/chat/completions`; `api: "responses"` opts into the Responses API.

### Maturity and breaking-change risk

- All packages are **pre-1.0** (0.x). Semver minors may break.
- Release cadence is very high: batch releases every ~3-4 days, ~1000 releases total across the monorepo ([releases](https://github.com/tanstack/ai/releases)). Recent entries are patches/minors; the visible notes list no "breaking" sections.
- Concrete evidence of drift: ideadump pins `@tanstack/ai` **0.32.0** (ideadump `pnpm-workspace.yaml`); latest is **0.52.1**. ideadump's `createTanStackRunner` already papers over signature drift with `as never` casts (`ideadump-lib/src/tanstack.ts:20-28`) — i.e. a 20-minor upgrade has visible API friction.
- One dependency sits on a canary: `@ag-ui/core 0.1.1-canary.beta.0`.
- Mitigation: pin exact versions in the catalog (ideadump already does), and wrap `chat()` behind a tiny `ModelRunner`-style boundary so SDK churn stays in one file — copying ideadump's boundary pattern without copying the package.

## 2. Alternative: Vercel AI SDK (`ai`) in TanStack Start

- Current: `ai` **7.0.87** (stable major v7, Apache-2.0, Node >= 22), `@ai-sdk/react` for hooks, `@ai-sdk/openai-compatible` **3.0.41** for custom endpoints via `createOpenAICompatible({ name, baseURL, apiKey })` ([npm ai](https://registry.npmjs.org/ai/latest), [npm @ai-sdk/openai-compatible](https://registry.npmjs.org/@ai-sdk/openai-compatible/latest)).
- The official TanStack Start guide ([ai-sdk.dev](https://ai-sdk.dev/docs/getting-started/tanstack-start)) uses the **same shape** as TanStack AI's: a file-based route with a POST server handler, `streamText(...)`, then `createUIMessageStreamResponse({ stream: toUIMessageStream(...) })`; client `useChat` from `@ai-sdk/react` defaults to `/api/chat`. Caveats called out there: `convertToModelMessages` for UIMessage→ModelMessage, tool parts render blank until handled client-side, and multi-step tool chains need `stopWhen: isStepCount(n)`.
- Wire protocol is Vercel's proprietary **UI Message Stream**; AG-UI interop needs the `@ag-ui/vercel-ai-sdk` translation layer and "native support remains an open feature request" ([TanStack comparison](https://tanstack.com/ai/latest/docs/comparison/vercel-ai-sdk)).
- **Which do the TanStack docs recommend?** TanStack no longer points at the AI SDK — tanstack.com now hosts TanStack AI's own quick start (which marks TanStack Start "(recommended!)") plus a [comparison](https://tanstack.com/ai/latest/docs/comparison/vercel-ai-sdk) and a [migration-from-Vercel guide](https://tanstack.com/ai/latest/docs/migration/migration-from-vercel-ai). The only AI-SDK-on-Start guide lives on ai-sdk.dev. TanStack's comparison concedes Vercel wins on provider breadth (~38 first-party provider packages), a reusable `ToolLoopAgent` class, and the AI Gateway (failover/caching/single key); it positions TanStack AI as the pure library with native AG-UI, isomorphic tools, per-model type narrowing, and built-in persistence/resumability.
- Practical read for this app: either works in a Start server route. The AI SDK is the more mature/stable dependency (v7, slower-moving); TanStack AI is the one the TanStack ecosystem itself now steers toward, its server/client SSE helpers are Start-shaped, and shadcn supports it at parity (see §3). Both can reach z.ai via an OpenAI-compatible adapter.

## 3. shadcn chat UI: registry story

What exists today on [ui.shadcn.com](https://ui.shadcn.com/docs/components/message):

- **`message`** (`pnpm dlx shadcn@latest add message`) — presentational row: `Message`, `MessageGroup`, `MessageAvatar`, `MessageContent`, `MessageHeader`, `MessageFooter`; `align="start" | "end"`. Pairs with **`Bubble`** (visible surface) and **`MessageScroller`** (scroll container). Related: `Attachment`, `Marker`, `Spinner`.
- **`questionnaire`** (`pnpm dlx shadcn@latest add questionnaire`) — a multi-step single/multi-choice + freeform + skippable questionnaire, explicitly themed for "collecting structured input from a user on behalf of an AI agent" ([docs](https://ui.shadcn.com/docs/components/questionnaire)). This is a near-direct fit for the "asks clarifying questions" phase: the model emits question items, the component renders progress/validation/skip logic, answers come back via `FormData`.
- **Primitive variants: Base UI / React Aria / Radix tabs on every component.** The Base UI variant is at `/docs/components/base/message`. So a Base UI (non-Radix) library is not a conflict — it is a supported variant. This repo is already there: `packages/ui` depends on `@base-ui/react ^1.6.0` and `@shadcn/react ^0.2.0` (the headless behavior package behind `message-scroller`/`questionnaire`) and `shadcn ^4.12.0` for the CLI (`packages/ui/package.json`). Tailwind v4 is what the current registry targets; no conflict either.
- **Streaming markdown**: the official renderer is Vercel's **streamdown** ([github](https://github.com/vercel/streamdown)) — a drop-in react-markdown replacement that tolerates unterminated markdown mid-stream; components built on shadcn/ui design tokens (CSS custom properties `--background`, `--foreground`, `--border`, `--radius`), Tailwind v4 setup via `@source "../node_modules/streamdown/dist/*.js"`. Usage: `<Streamdown animated isAnimating={status === 'streaming'}>{part.text}</Streamdown>`. It is framework-agnostic about the chat SDK. shadcn's own **typeset** (`shadcn add typeset`, [docs](https://ui.shadcn.com/docs/typeset)) is the companion styling system for rendered markdown.
- **`@shadcn/helpers`** ships scripted-chat test helpers for **both** `@tanstack/ai-react` `useChat` and AI SDK `useChat` ([TanStack helper](https://ui.shadcn.com/docs/helpers/tanstack-ai), [AI SDK helper](https://ui.shadcn.com/docs/helpers/ai-sdk)) — useful for CI-safe chat-component tests with zero network/token spend. Parity here confirms shadcn treats TanStack AI as a first-class stack.
- There is **no** `conversation`/`thread`/`composer` registry item — you compose `Message` + `Bubble` + `MessageScroller` + your own composer input, which is what the docs' chat demos do.

## 4. Multi-model fan-out on z.ai

### Same endpoint, same key — yes

All GLM chat models are served by the one OpenAI-compatible endpoint `https://api.z.ai/api/paas/v4/` ([quick start](https://docs.z.ai/guides/overview/quick-start)). `glm-5.3-flash`'s classmates per the pricing page ([docs.z.ai/guides/overview/pricing](https://docs.z.ai/guides/overview/pricing)):

| Model id | Input $/M | Output $/M | Notes |
| --- | --- | --- | --- |
| `glm-5.3-flash` | 0.075 (promo, ends 2026-09-09; then 0.15) | 0.25 (then 0.50) | Default. 1M ctx / 128K out, multimodal in, thinking always on ([model page](https://docs.z.ai/guides/vlm/glm-5.3-flash)) |
| `glm-5.3` | 1.4 | 4.4 | Flagship; judge/merge or final-PRD candidate |
| `glm-5.2`, `glm-5.1` | 1.4 | 4.4 | Prior flagships |
| `glm-4.7-flash`, `glm-4.5-flash` | **Free** | **Free** | Obvious fan-out classmates |
| `glm-4.7-flashx` | 0.07 | 0.40 | Fast tier |
| `glm-4.7` / `glm-4.6` / `glm-4.5` | 0.6 | 2.2 | Mid tier |
| `glm-4.5-air` | 0.2 | 1.1 | |

(`glm-5.3-air` does not exist; current lineup per [llms.txt](https://docs.z.ai/llms.txt) is glm-5.3 / glm-5.3-flash / glm-5.2.) Model-page recommendations for glm-5.3-flash: `temperature 1`, `top_p 0.95`, `stream: true`, `tool_stream: true`.

### Pragmatic pattern

Plain `Promise.all` fan-out plus a judge/merge call is the documented approach (AI SDK's [workflow patterns](https://ai-sdk.dev/docs/agents/workflows): parallel processing, orchestrator-workers, evaluator-optimizer). The pattern is SDK-agnostic — with TanStack AI it is N `chat()` calls against N adapters from one `openaiCompatible(...)` factory, then one structured-output `chat()` with `outputSchema` (zod) as judge:

```
questions/PRD draft:  flash(default) ∥ glm-4.7-flash(free) ∥ glm-4.5-flash(free)
                          ↓
judge (structured):    glm-5.3-flash scores/picks or merges → { verdict, best, critique }
final artifacts:       glm-5.3 (or flash) emits final PRD/plan markdown
```

ideadump-lib already models per-role models (`createTanStackRunner({ models: { chat, grill, prd, planner } })`), which maps directly onto this. Cost ceiling for a 3-way flash fan-out is ~3x flash pricing (promo $0.075/$0.25 per M) with two of three lanes free if the 4.x-flash models suffice for question drafts.

## 5. Native build vs reusing `@ideadump/core` (ideadump-lib)

### What ideadump-lib is

`~/workspace/ideadump/packages/ideadump-lib` ships as `@ideadump/core` 0.0.0, raw `.ts` exports (no build step), built on `@tanstack/ai` 0.32.0 + `@tanstack/ai-openrouter` (its `pnpm-workspace.yaml`, `package.json`). It owns **no persistence, transport, auth, or UI**; its host `@ideadump/local-api` adds tRPC + SQLite + an NDJSON wire protocol (README). Core API: `createInitialState` → `runGrillQuestion`/`recordGrillAnswer` (loop) → `runPrdCreation` → `runPlanCreation`, with `stream*` twins returning `AsyncIterable<StreamEvent> & { final: Promise<Result> }`, phases `grilling → prd → planning → done` (+ `refining` side exit), plus side-chat, virtual-FS context tools, prompt overrides, and per-role prompts.

### Cross-repo pnpm constraints (two separate private repos)

| Option | Mechanics | Verdict here |
| --- | --- | --- |
| `workspace:*` | Only resolves inside one `pnpm-workspace.yaml`; the two repos are separate workspaces — would require adding `../ideadump/packages/*` to this repo's workspace globs, coupling both installs | Not viable without restructuring |
| `pnpm link ../path` (symlink) | Docs: "pnpm will not install the dependencies of the linked package" — this app would have to manually add `@tanstack/ai`, `@tanstack/ai-openrouter`, zod at compatible versions; link isn't version-pinned in the lockfile ([pnpm.io/cli/link](https://pnpm.io/cli/link)) | Fragile; violates both repos' pnpm isolation rules |
| `file:../path` (hard-link) | Installs the linked package's deps but "overrides the node_modules of the linked package" — pnpm would rewrite ideadump's own node_modules from this repo's context; forces pnpm on both; still path-pinned, not version-pinned | Actively harmful to the other checkout |
| Private registry publish (GitHub Packages/verdaccio) | Clean semver + lockfile pinning; needs publish pipeline, auth in CI, and ideadump-lib still exports raw `.ts` so consumers need TS-aware tooling (Vite handles it; `tsc --noEmit` can resolve `.ts` export maps, same as this repo's own packages) | The only *clean* link, at real ongoing cost |

Also: version skew — ideadump pins `@tanstack/ai` 0.32.0 while a fresh native install gets 0.52.1; the lib's `tanstack.ts` already contains `as never` casts working around that API. Linking would freeze this app to ideadump's pinned era or force an upgrade inside ideadump.

### What a native build must recreate from ideadump-lib (concrete gaps)

| ideadump-lib capability | Needed for workspace-welcome ideation? |
| --- | --- |
| Phase state machine (grilling→prd→planning→done, `IdeaDumpState`) | **Yes** — but can be a tiny discriminated-union per session (sessions can be ephemeral/in-store) |
| `ModelRunner` boundary over `chat()` (generate/generateJson/stream/streamJson) | **Yes, copy the pattern** (~100 lines) — isolates 0.x SDK churn |
| Stream pump `StreamedRunResult` (async iterable + `final` promise, abort forwarding) | Mostly **no** — `toServerSentEventsResponse` + `useChat` replace it on the wire; a `final` promise is still handy server-side before writing files |
| Per-role system prompts (`defaultPrompts`: grill/prd/plan) | **Yes** — this is the real IP to port |
| `GrillDecision` structured output (when to stop asking questions) | **Yes** — `outputSchema` zod call |
| Virtual-FS context tools (`listFiles`/`readFile`/`searchFiles`, path guard) | **No** — workspace-welcome reads real directories server-side; the app already has scan data and confined file browsing (ADR-0002 patterns) |
| Side-chat, refinement re-entry, suggested actions | Optional; skip for v1 |
| OpenRouter adapter | **No** — replaced by `openaiCompatible` pointed at z.ai |
| tRPC host + SQLite persistence + NDJSON protocol (local-api) | **No** — artifacts are Markdown files written into a configured directory via this app's own server code (same pattern as report files, which already cache under `$XDG_CACHE_HOME/workspace-welcome/reports/`) |
| Fan-out/judge across models | **New** — ideadump does role-per-model, not fan-out/merge; add `Promise.all` + judge call |

Net: the native build is roughly one router/module in `packages/api` (state + prompts + 3 runners + file writer), one SSE server route in `apps/web/src/routes/api/`, and a chat page composing `Message`/`Bubble`/`MessageScroller`/`questionnaire` + `streamdown` from the Base UI variant registry — not a port of ideadump-lib's 10-module surface.

## Verdict

**Build natively with TanStack AI; do not link or publish ideadump-lib.**

- Stack: `@tanstack/ai` + `@tanstack/ai-react` + `@tanstack/ai-openai` (for `/compatible`), pinned exact in the catalog; z.ai via `openaiCompatible({ baseURL: "https://api.z.ai/api/paas/v4", models: [...] })`; SSE via `toServerSentEventsResponse` in a `routes/api/ideation/*` server route beside the existing tRPC mount; UI from shadcn's Base UI variants (`message`, `bubble`, `message-scroller`, `questionnaire`) + `streamdown` for streaming markdown — no conflict with Tailwind v4 / Base UI, and `packages/ui` already has the right deps (`@base-ui/react`, `@shadcn/react`, `shadcn` CLI).
- Why TanStack AI over Vercel AI SDK here: the app is an all-TanStack shop; TanStack's own docs now recommend TanStack Start for TanStack AI (and host a migration path *from* the AI SDK); server/client SSE helpers match Start's route-handler model; shadcn supports both stacks at parity. Accept the 0.x churn risk by pinning exact versions and hiding `chat()` behind a runner boundary. If stability ever outranks ecosystem fit, `ai` v7 + `@ai-sdk/openai-compatible` is the drop-in fallback with the identical route shape.
- Why not reuse ideadump-lib: every linking mechanism is either fragile (`pnpm link` skips dep install), destructive (`file:` overrides the other repo's node_modules), or requires publishing infrastructure; the package is 0.0.0 raw-TS pinned to an older `@tanstack/ai`; and ~70% of its surface (virtual FS, side-chat, refinement, OpenRouter, SQLite/NDJSON host concerns) is dead weight for this feature. Port the two assets actually worth money — the grill/PRD/plan prompts and the runner-boundary pattern — and add the one thing ideadump lacks: flash-tier fan-out with a structured-output judge/merge, using the free `glm-4.7-flash`/`glm-4.5-flash` classmates and `glm-5.3` for final passes on the same z.ai key.

## Sources

- TanStack AI overview — https://tanstack.com/ai/latest/docs/getting-started/overview
- TanStack AI quick start (Start server route + SSE) — https://tanstack.com/ai/latest/docs/getting-started/quick-start
- OpenAI-compatible adapter (Z.AI base URL listed) — https://tanstack.com/ai/latest/docs/adapters/openai-compatible
- TanStack AI vs Vercel AI SDK — https://tanstack.com/ai/latest/docs/comparison/vercel-ai-sdk
- Migration from Vercel AI SDK — https://tanstack.com/ai/latest/docs/migration/migration-from-vercel-ai
- TanStack AI releases — https://github.com/tanstack/ai/releases
- npm: @tanstack/ai 0.52.1, @tanstack/ai-react 0.22.4, ai 7.0.87, @ai-sdk/openai-compatible 3.0.41 — registry.npmjs.org
- AI SDK + TanStack Start guide — https://ai-sdk.dev/docs/getting-started/tanstack-start
- AI SDK workflow patterns (fan-out, judge) — https://ai-sdk.dev/docs/agents/workflows
- shadcn message — https://ui.shadcn.com/docs/components/message (Base UI variant: /docs/components/base/message)
- shadcn questionnaire — https://ui.shadcn.com/docs/components/questionnaire
- shadcn helpers (TanStack AI / AI SDK) — https://ui.shadcn.com/docs/helpers/tanstack-ai , https://ui.shadcn.com/docs/helpers/ai-sdk
- shadcn typeset — https://ui.shadcn.com/docs/typeset
- Streamdown — https://github.com/vercel/streamdown
- z.ai quick start (base URL, models) — https://docs.z.ai/guides/overview/quick-start
- z.ai pricing (model lineup) — https://docs.z.ai/guides/overview/pricing
- GLM-5.3-Flash model page — https://docs.z.ai/guides/vlm/glm-5.3-flash
- z.ai docs index — https://docs.z.ai/llms.txt
- pnpm link vs file: — https://pnpm.io/cli/link
- Local: `~/workspace/ideadump/packages/ideadump-lib/{package.json,README.md,src/tanstack.ts,src/streaming.ts}`, ideadump `pnpm-workspace.yaml`; this repo's `packages/ui/package.json`, `apps/web/package.json`, `apps/web/src/routes/`
