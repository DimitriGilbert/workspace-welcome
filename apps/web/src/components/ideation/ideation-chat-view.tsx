import { useEffect, useRef, useState } from "react";
import { fetchServerSentEvents, useChat } from "@tanstack/ai-react";
import {
  ArrowUp,
  Check,
  FileText,
  Info,
  ListChecks,
  Loader2,
  Square,
  TriangleAlert,
  X,
} from "lucide-react";
import { Streamdown } from "streamdown";

import { Bubble, BubbleContent } from "@workspace-welcome/ui/components/bubble";
import { Button } from "@workspace-welcome/ui/components/button";
import { Marker, MarkerContent, MarkerIcon } from "@workspace-welcome/ui/components/marker";
import { Message, MessageContent } from "@workspace-welcome/ui/components/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerViewport,
} from "@workspace-welcome/ui/components/message-scroller";
import { Textarea } from "@workspace-welcome/ui/components/textarea";

import { IDEATION_STEPS } from "@workspace-welcome/api/lib/ideation/shared";

import {
  IDEATION_CANDIDATE_EVENT,
  IDEATION_GENERATE_PLAN_SENTINEL,
  IDEATION_GENERATE_PRD_SENTINEL,
  IDEATION_KICKOFF_SENTINEL,
  IDEATION_RECONCILER_EVENT,
  IDEATION_STEP_NOTE_EVENT,
  IDEATION_SUGGESTED_ANSWERS_EVENT,
  ideationChatUrl,
  isIdeationSentinel,
} from "@/lib/ideation-wire";

import type { UseChatOptions, UIMessage } from "@tanstack/ai-react";
import type {
  IdeationArtifactKind,
  IdeationMessage,
  IdeationSession,
  IdeationStep,
} from "@workspace-welcome/api/lib/ideation/shared";
import type { IdeationChipPhase } from "@/lib/ideation-wire";

/**
 * The conversation body of the ideation panel (PRD §3): the durable
 * questionHistory from session.get as the transcript base, with the current
 * turn's in-flight useChat messages layered on top. The wire contract is the
 * client-safe vocabulary of ideation-wire.ts — sentinels ride the message
 * stream and never render, suggested answers / per-model progress chips /
 * soft notes ride AG-UI CUSTOM events, and RUN_FINISHED always hands control
 * back to the panel so disk (session.get) becomes the truth again.
 */

/** The stream chunk type of the chat connection, without importing the SDK. */
type ChatChunk = Parameters<NonNullable<UseChatOptions["onChunk"]>>[0];

/** One per-model progress chip of the current fan-out turn. */
interface ChipState {
  /** `candidate` / `reconciler` + step + model — stable within a run. */
  key: string;
  reconciler: boolean;
  step: IdeationStep;
  model: string;
  phase: IdeationChipPhase;
  error?: string;
}

/** An inline, non-fatal run failure with its stable wire code when present. */
interface RunErrorState {
  code?: string;
  message: string;
}

/** What one rendered transcript row carries, durable or in-flight. */
interface TranscriptItem {
  key: string;
  role: "user" | "assistant";
  text: string;
  /** PRD/plan markdown — rendered with streamdown, no bubble chrome. */
  artifact: IdeationArtifactKind | null;
  /** 0–4 grilling suggestions; rendered as a chip row under the question. */
  suggestedAnswers?: string[];
  /** True while this assistant message is still streaming in. */
  streaming: boolean;
}

// --- wire value parsing ---------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseSuggestedAnswers(
  value: unknown,
): { messageId: string; suggestedAnswers: string[] } | null {
  if (!isRecord(value)) return null;
  const { messageId, suggestedAnswers } = value;
  if (typeof messageId !== "string" || !Array.isArray(suggestedAnswers)) {
    return null;
  }
  if (!suggestedAnswers.every((answer) => typeof answer === "string")) {
    return null;
  }
  return { messageId, suggestedAnswers };
}

/**
 * Runtime witness of the wire-local IdeationChipPhase union — the type comes
 * from ideation-wire.ts, which (unlike steps via shared IDEATION_STEPS)
 * exports no runtime constant, so this literal is what `includes` validates
 * the raw event value against.
 */
const CHIP_PHASES: readonly IdeationChipPhase[] = ["start", "complete", "error"];

function parseChip(
  value: unknown,
  reconciler: boolean,
): ChipState | null {
  if (!isRecord(value)) return null;
  const { step, phase, model, error } = value;
  if (
    typeof step !== "string" ||
    !IDEATION_STEPS.includes(step as IdeationStep) ||
    typeof phase !== "string" ||
    !CHIP_PHASES.includes(phase as IdeationChipPhase) ||
    typeof model !== "string"
  ) {
    return null;
  }
  let errorText: string | undefined;
  if (isRecord(error)) {
    const { kind, message } = error;
    if (typeof kind === "string" && typeof message === "string") {
      errorText = `${kind}: ${message}`;
    }
  }
  return {
    key: `${reconciler ? "reconciler" : "candidate"}:${step}:${model}`,
    reconciler,
    step: step as IdeationStep,
    model,
    phase: phase as IdeationChipPhase,
    error: errorText,
  };
}

function parseStepNote(value: unknown): { step: IdeationStep; note: string } | null {
  if (!isRecord(value)) return null;
  const { step, note } = value;
  if (typeof step !== "string" || !IDEATION_STEPS.includes(step as IdeationStep)) {
    return null;
  }
  if (typeof note !== "string") return null;
  return { step: step as IdeationStep, note };
}

// --- transcript layering ---------------------------------------------------------------

function uiMessageText(message: UIMessage): string {
  return message.parts.reduce(
    (acc, part) => (part.type === "text" ? acc + part.content : acc),
    "",
  );
}

function toUiMessage(message: IdeationMessage, index: number): UIMessage {
  return {
    id: `hist-${index}-${message.createdAt}`,
    role: message.role,
    parts: [{ type: "text", content: message.content }],
  };
}

/**
 * The durable transcript with the current turn's in-flight messages layered
 * on top. The walk matches flight messages beyond the seeded prefix against
 * durable entries in order (role + content), skipping them once disk has
 * absorbed them — so a finished grilling turn deduplicates after the
 * RUN_FINISHED refetch, while messages disk never stores (sentinels are
 * filtered outright; artifact markdown) stay visible as the overlay.
 */
function layerTranscript(input: {
  durable: readonly IdeationMessage[];
  flight: readonly UIMessage[];
  seedLength: number;
  artifactKinds: ReadonlyMap<string, IdeationArtifactKind>;
  suggested: ReadonlyMap<string, string[]>;
  streaming: boolean;
}): TranscriptItem[] {
  const { durable, flight, seedLength, artifactKinds, suggested, streaming } = input;
  const items: TranscriptItem[] = durable.map((message, index) => ({
    key: `d${index}-${message.createdAt}`,
    role: message.role,
    text: message.content,
    artifact: null,
    suggestedAnswers: message.suggestedAnswers,
    streaming: false,
  }));
  let flightIndex = Math.min(seedLength, flight.length);
  let durableIndex = Math.min(seedLength, durable.length);
  while (flightIndex < flight.length) {
    const message = flight[flightIndex];
    if (message === undefined) break;
    const text = uiMessageText(message);
    if (message.role === "user" && isIdeationSentinel(text)) {
      flightIndex += 1;
      continue;
    }
    const absorbed = durable[durableIndex];
    if (
      absorbed !== undefined &&
      absorbed.role === message.role &&
      absorbed.content === text
    ) {
      flightIndex += 1;
      durableIndex += 1;
      continue;
    }
    const isLast = flightIndex === flight.length - 1;
    items.push({
      key: message.id,
      role: message.role === "user" ? "user" : "assistant",
      text,
      artifact: message.role === "assistant" ? artifactKinds.get(message.id) ?? null : null,
      suggestedAnswers:
        message.role === "assistant" ? suggested.get(message.id) : undefined,
      streaming: streaming && message.role === "assistant" && isLast,
    });
    flightIndex += 1;
  }
  return items;
}

// --- component -------------------------------------------------------------------------

export interface IdeationChatViewProps {
  /** Absolute project path — rides the chat URL as a query param. */
  project: string;
  sessionId: string;
  /** Durable session.get snapshot — disk truth for phase and transcript. */
  session: IdeationSession | undefined;
  /** Panel hook: refetch session.get + sessions.list after RUN_FINISHED. */
  onSessionDiskChanged: () => void;
  /** Frozen context summary from session.start; rendered as a soft note. */
  contextSummary?: string | null;
}

export function IdeationChatView({
  project,
  sessionId,
  session,
  onSessionDiskChanged,
  contextSummary,
}: IdeationChatViewProps) {
  const phase = session?.phase ?? "grilling";

  // The useChat history is seeded exactly once per session mount (the view is
  // keyed by sessionId) — this is the prefix the layer walk treats as durable.
  const [initialMessages] = useState<UIMessage[]>(() =>
    (session?.questionHistory ?? []).map(toUiMessage),
  );

  const [draft, setDraft] = useState("");
  /** messageId → suggested answers of the streaming assistant question. */
  const [suggested, setSuggested] = useState<Map<string, string[]>>(new Map());
  const [chips, setChips] = useState<ChipState[]>([]);
  const [stepNote, setStepNote] = useState<{ step: IdeationStep; note: string } | null>(null);
  const [runError, setRunError] = useState<RunErrorState | null>(null);
  /** messageId → which artifact the in-flight assistant message carries. */
  const [artifactKinds, setArtifactKinds] = useState<Map<string, IdeationArtifactKind>>(new Map());
  /** The artifact kind whose sentinel was just sent — claims the next assistant message. */
  const pendingArtifactRef = useRef<IdeationArtifactKind | null>(null);
  const kickoffSentRef = useRef(false);

  const chat = useChat({
    connection: fetchServerSentEvents(() => ideationChatUrl(sessionId, project)),
    initialMessages,
    onChunk: (chunk: ChatChunk) => {
      switch (chunk.type) {
        case "RUN_STARTED":
          setChips([]);
          setStepNote(null);
          setRunError(null);
          break;
        case "RUN_FINISHED":
          // Disk is the source of truth (PRD §7) — never reconstruct from the
          // stream; hand control back so the panel refetches session.get.
          onSessionDiskChanged();
          break;
        case "RUN_ERROR":
          setRunError({
            code: typeof chunk.code === "string" ? chunk.code : undefined,
            message: chunk.message,
          });
          if (chunk.code === "phase") onSessionDiskChanged();
          break;
        case "TEXT_MESSAGE_START":
          if (chunk.role === "assistant" && pendingArtifactRef.current !== null) {
            const kind = pendingArtifactRef.current;
            pendingArtifactRef.current = null;
            setArtifactKinds((prev) => new Map(prev).set(chunk.messageId, kind));
          }
          break;
        case "CUSTOM": {
          const value: unknown = chunk.value;
          switch (chunk.name) {
            case IDEATION_SUGGESTED_ANSWERS_EVENT: {
              const parsed = parseSuggestedAnswers(value);
              if (parsed !== null) {
                setSuggested((prev) => {
                  const next = new Map(prev);
                  next.set(parsed.messageId, parsed.suggestedAnswers);
                  return next;
                });
              }
              break;
            }
            case IDEATION_CANDIDATE_EVENT:
            case IDEATION_RECONCILER_EVENT: {
              const chip = parseChip(value, chunk.name === IDEATION_RECONCILER_EVENT);
              if (chip !== null) {
                setChips((prev) => [
                  ...prev.filter((existing) => existing.key !== chip.key),
                  chip,
                ]);
              }
              break;
            }
            case IDEATION_STEP_NOTE_EVENT: {
              const note = parseStepNote(value);
              if (note !== null) setStepNote(note);
              break;
            }
            default:
              break;
          }
          break;
        }
        default:
          break;
      }
    },
  });

  const {
    messages,
    sendMessage,
    isLoading,
    stop,
    setMessages,
    error: chatError,
  } = chat;

  // The first grilling turn of a fresh session auto-sends the kickoff
  // sentinel (there is no answer yet); exactly once per session mount.
  useEffect(() => {
    if (kickoffSentRef.current || session === undefined) return;
    kickoffSentRef.current = true;
    if (session.phase === "grilling" && session.questionHistory.length === 0) {
      void sendMessage(IDEATION_KICKOFF_SENTINEL);
    }
  }, [session, sendMessage]);

  const sendAnswer = () => {
    const text = draft.trim();
    if (text === "" || isLoading || phase !== "grilling") return;
    setDraft("");
    pendingArtifactRef.current = null;
    void sendMessage(text);
  };

  const sendArtifactSentinel = (kind: IdeationArtifactKind) => {
    if (isLoading) return;
    pendingArtifactRef.current = kind;
    void sendMessage(
      kind === "prd" ? IDEATION_GENERATE_PRD_SENTINEL : IDEATION_GENERATE_PLAN_SENTINEL,
    );
  };

  /**
   * Manual stop: stop() emits no terminal chunk, so no RUN_STARTED/RUN_ERROR
   * arrives to reset the transient in-flight state — the spinner chips and
   * step note must be cleared here or they spin until the next run. The
   * aborted turn's user message is dropped from the hook's history too: a
   * mid-generation stop persists nothing (every turn write follows
   * generation), and leaving the message would double-render the answer when
   * the same text is re-sent. A stop landing after generation can however
   * have fully persisted — the server's persist sequence is atomic — so the
   * panel refetches disk state: a completed turn shows up here instead of
   * inviting a duplicate re-send, and a truly empty turn makes the refetch a
   * no-op.
   */
  const stopTurn = () => {
    stop();
    setChips([]);
    setStepNote(null);
    let lastUserIndex = -1;
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const message = messages[i];
      if (message !== undefined && message.role === "user") {
        lastUserIndex = i;
        break;
      }
    }
    // Only flight messages are removable — the seeded prefix is the durable
    // questionHistory snapshot, never ours to delete.
    if (lastUserIndex >= initialMessages.length) {
      setMessages(messages.filter((_, index) => index !== lastUserIndex));
    }
    onSessionDiskChanged();
  };

  const transcript = layerTranscript({
    durable: session?.questionHistory ?? [],
    flight: messages,
    seedLength: initialMessages.length,
    artifactKinds,
    suggested,
    streaming: isLoading,
  });

  // Manual stops surface as a raw AbortError on the hook — not a failure.
  const errorState: RunErrorState | null =
    runError ??
    (chatError !== undefined && chatError.name !== "AbortError"
      ? { message: chatError.message }
      : null);

  const phaseHint =
    phase === "prd"
      ? "idea resolved — create the prd next"
      : phase === "planning"
        ? "prd ready — create the implementation plan"
        : phase === "done"
          ? "interview complete — save the artifacts below"
          : "one question at a time — answer, or pick a suggestion";

  return (
    <div className="mt-2 flex min-w-0 flex-col gap-2">
      <div className="h-[24rem]">
        <MessageScroller className="border border-foreground/10 bg-background">
          <MessageScrollerViewport>
            <MessageScrollerContent className="gap-4 p-3">
              {contextSummary ? (
                <Marker>
                  <MarkerIcon>
                    <Info className="size-3.5" />
                  </MarkerIcon>
                  <MarkerContent className="font-mono text-[0.65rem]">
                    {contextSummary}
                  </MarkerContent>
                </Marker>
              ) : null}
              {transcript.length === 0 && isLoading ? (
                <Marker>
                  <MarkerIcon>
                    <Loader2 className="size-3.5 animate-spin" />
                  </MarkerIcon>
                  <MarkerContent className="font-mono text-[0.65rem]">
                    starting the interview…
                  </MarkerContent>
                </Marker>
              ) : null}
              {transcript.map((item) => (
                <MessageScrollerItem key={item.key} scrollAnchor>
                  {item.artifact !== null ? (
                    <Message align="start">
                      <MessageContent>
                        <span className="flex items-center gap-1.5 font-mono text-[0.65rem] text-muted-foreground">
                          {item.streaming ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : null}
                          {item.artifact}
                        </span>
                        <Streamdown className="min-w-0 text-xs leading-relaxed">
                          {item.text}
                        </Streamdown>
                      </MessageContent>
                    </Message>
                  ) : (
                    <Message align={item.role === "user" ? "end" : "start"}>
                      <MessageContent>
                        <Bubble
                          variant={item.role === "user" ? "default" : "secondary"}
                          align={item.role === "user" ? "end" : "start"}
                        >
                          <BubbleContent>{item.text}</BubbleContent>
                        </Bubble>
                        {phase === "grilling" &&
                        item.role === "assistant" &&
                        item.suggestedAnswers !== undefined &&
                        item.suggestedAnswers.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {item.suggestedAnswers.map((answer, index) => (
                              <Button
                                key={`${item.key}-s${index}`}
                                size="xs"
                                variant="outline"
                                className="max-w-full font-normal"
                                onClick={() => setDraft(answer)}
                              >
                                <span className="truncate">{answer}</span>
                              </Button>
                            ))}
                          </div>
                        ) : null}
                      </MessageContent>
                    </Message>
                  )}
                </MessageScrollerItem>
              ))}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton />
        </MessageScroller>
      </div>

      {chips.length > 0 || stepNote !== null ? (
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {chips.map((chip) => (
              <span
                key={chip.key}
                className="inline-flex items-center gap-1 font-mono text-[0.65rem] text-muted-foreground"
                title={chip.error ?? `${chip.step} · ${chip.model}`}
              >
                {chip.phase === "start" ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : chip.phase === "complete" ? (
                  <Check className="size-3" />
                ) : (
                  <X className="size-3" style={{ color: "var(--sev-error)" }} />
                )}
                {chip.reconciler ? "reconciler" : chip.model}
              </span>
            ))}
          </div>
          {stepNote !== null ? (
            <Marker>
              <MarkerIcon>
                <Info className="size-3.5" />
              </MarkerIcon>
              <MarkerContent className="font-mono text-[0.65rem]">
                {stepNote.note}
              </MarkerContent>
            </Marker>
          ) : null}
        </div>
      ) : null}

      {errorState !== null ? (
        <div
          className="flex items-start gap-1.5 text-[0.7rem] leading-relaxed"
          style={{ color: "var(--sev-error)" }}
        >
          <TriangleAlert className="mt-px size-3.5 shrink-0" />
          <span className="min-w-0 break-words">
            {errorState.code !== undefined ? `[${errorState.code}] ` : ""}
            {errorState.message}
          </span>
        </div>
      ) : null}

      {phase === "grilling" ? (
        <div className="flex items-end gap-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // The composition-commit Enter arrives as key "Enter" with
              // isComposing (macOS) or key "Process" (Windows) — never send
              // the half-composed draft.
              if (e.nativeEvent.isComposing || e.key === "Process") return;
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendAnswer();
              }
            }}
            rows={2}
            placeholder="Your answer — direct, skeptical and relentless back"
            className="min-h-[2.25rem] flex-1"
            disabled={isLoading}
          />
          {isLoading ? (
            <Button
              variant="outline"
              size="icon-sm"
              onClick={stopTurn}
              aria-label="Stop generating"
              title="Stop — nothing is persisted; the step can be re-run"
            >
              <Square className="size-3.5" />
            </Button>
          ) : (
            <Button
              size="icon-sm"
              onClick={sendAnswer}
              disabled={draft.trim() === ""}
              aria-label="Send answer"
            >
              <ArrowUp className="size-3.5" />
            </Button>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span className="min-w-0 flex-1 font-mono text-[0.65rem] text-muted-foreground">
            {phaseHint}
          </span>
          {isLoading ? (
            <Button variant="outline" size="sm" onClick={stopTurn}>
              <Square className="size-3.5" /> Stop
            </Button>
          ) : null}
          {phase === "prd" ? (
            <Button size="sm" onClick={() => sendArtifactSentinel("prd")} disabled={isLoading}>
              <FileText className="size-3.5" /> Create PRD
            </Button>
          ) : null}
          {phase === "planning" ? (
            <Button size="sm" onClick={() => sendArtifactSentinel("plan")} disabled={isLoading}>
              <ListChecks className="size-3.5" /> Create plan
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}
