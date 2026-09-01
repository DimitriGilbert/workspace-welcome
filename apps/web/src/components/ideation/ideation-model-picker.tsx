import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronRight,
  KeyRound,
  Loader2,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";

import { Button } from "@workspace-welcome/ui/components/button";
import { Checkbox } from "@workspace-welcome/ui/components/checkbox";
import { cn } from "@workspace-welcome/ui/lib/utils";
import {
  DEFAULT_RECONCILER_MODEL,
  IDEATION_STEPS,
} from "@workspace-welcome/api/lib/ideation/shared";
import type {
  IdeationModelSet,
  IdeationStep,
} from "@workspace-welcome/api/lib/ideation/shared";

import { useTRPC } from "@/utils/trpc";
import {
  IdeationModelListbox,
  IdeationModelMultiListbox,
  buildIdeationModelOptions,
  findIdeationModelOption,
  missingIdeationKeys,
} from "@/components/ideation/ideation-model-listbox";
import type {
  IdeationMissingKey,
  IdeationModelOption,
} from "@/components/ideation/ideation-model-listbox";

/**
 * The ideation model picker (PRD §3, "model picker — simple first").
 *
 * The visible UI is a mode switch over one value: an {@link
 * IdeationModelSet}, the exact shape session.start takes and settings
 * persist — all mapping lives here so the panel stays dumb:
 *
 * - simple (default): one single-select picker. The shown model is the
 *   set's common solo model (fresh settings → zai/glm-5.3-flash); picking
 *   a model rewrites every step to that single model — solo everywhere,
 *   hence no reconciler on the wire (the field is preserved as-is and
 *   stays dormant server-side while every step is solo, PRD §6).
 * - "choose multiple models": the picker becomes a multi-select bound to
 *   the current step's array — only that step changes.
 * - "choose step models": three per-step multi-select pickers
 *   (questions / PRD / plan), each free to fan out.
 * - reconciler: a single-select appears only while an advanced mode is on
 *   AND some step holds >1 model (fan-out engaged), defaulting to
 *   DEFAULT_RECONCILER_MODEL when the stored id isn't selectable anymore.
 *
 * All catalog data comes from the ideation.models.list query — no local
 * model knowledge, no env reading on the client (criterion 10, §7); the
 * option list only ever contains keyPresent providers, and the no-keys
 * state names every absent env var.
 */

/** Display labels for the three fan-out-able steps (PRD §4.2 vocabulary). */
const STEP_LABELS: Record<IdeationStep, string> = {
  questions: "questions",
  prd: "PRD",
  plan: "plan",
};

export interface IdeationModelPickerProps {
  /** The live model set — settings defaults, a persisted session's frozen set, or the panel's draft. */
  value: IdeationModelSet;
  /** Emits the full next set on every pick; every mode change only re-renders, never emits. */
  onChange: (next: IdeationModelSet) => void;
  /**
   * The step the "choose multiple models" multi-select edits. Optional
   * because no caller passes it today: the fresh-session form is the only
   * call site, and before a session starts the questions step is the one
   * whose fan-out matters (the first model call is a grilling turn).
   */
  step?: IdeationStep;
  className?: string;
}

export function IdeationModelPicker({
  value,
  onChange,
  step = "questions",
  className,
}: IdeationModelPickerProps) {
  const trpc = useTRPC();
  const models = useQuery(trpc.ideation.models.list.queryOptions());

  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [multiMode, setMultiMode] = useState(false);
  const [stepMode, setStepMode] = useState(false);

  const options = useMemo(
    () => (models.data ? buildIdeationModelOptions(models.data) : []),
    [models.data],
  );
  const missingKeys = useMemo(
    () => (models.data ? missingIdeationKeys(models.data) : []),
    [models.data],
  );

  const anyFanOut =
    value.questions.length > 1 || value.prd.length > 1 || value.plan.length > 1;
  // The reconciler matters only once a step actually fans out, and only
  // the advanced modes can produce that; the simple picker forces solo.
  const reconcilerVisible = (multiMode || stepMode) && anyFanOut;

  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)}>
      <div className="flex min-h-7 items-center justify-between gap-2">
        <span className="font-mono text-[0.65rem] lowercase text-muted-foreground">
          model
        </span>
        {options.length > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            aria-expanded={advancedOpen}
            onClick={() => setAdvancedOpen((open) => !open)}
            className="font-mono text-[0.65rem] lowercase text-muted-foreground"
          >
            advanced
            <ChevronRight
              className={cn(
                "size-3.5 transition-transform",
                advancedOpen && "rotate-90",
              )}
            />
          </Button>
        ) : null}
      </div>

      {models.isPending ? <LoadingRow /> : null}

      {models.isError ? (
        <ErrorRow
          message={models.error.message}
          onRetry={() => {
            models.refetch().catch(() => undefined);
          }}
        />
      ) : null}

      {models.data && options.length === 0 ? (
        <MissingKeysState
          missingKeys={missingKeys}
          warning={models.data.warning}
        />
      ) : null}

      {options.length > 0 ? (
        <>
          {stepMode ? (
            <div className="flex flex-col gap-1.5">
              {IDEATION_STEPS.map((stepKey) => (
                <PickerRow key={stepKey} label={STEP_LABELS[stepKey]}>
                  <IdeationModelMultiListbox
                    options={options}
                    value={value[stepKey]}
                    ariaLabel={`${STEP_LABELS[stepKey]} step models`}
                    onChange={(ids) =>
                      onChange(withStepModels(value, stepKey, ids))
                    }
                  />
                </PickerRow>
              ))}
            </div>
          ) : multiMode ? (
            <PickerRow label={STEP_LABELS[step]}>
              <IdeationModelMultiListbox
                options={options}
                value={value[step]}
                ariaLabel={`${STEP_LABELS[step]} step models`}
                onChange={(ids) => onChange(withStepModels(value, step, ids))}
              />
            </PickerRow>
          ) : (
            <div className="min-w-0">
              <IdeationModelListbox
                options={options}
                value={soloModelId(value)}
                ariaLabel="ideation model"
                onSelect={(id) =>
                  onChange({
                    ...value,
                    questions: [id],
                    prd: [id],
                    plan: [id],
                  })
                }
              />
            </div>
          )}

          {reconcilerVisible ? (
            <PickerRow label="reconciler">
              <IdeationModelListbox
                options={options}
                value={resolveReconcilerId(value.reconciler, options)}
                ariaLabel="reconciler model"
                onSelect={(id) => onChange({ ...value, reconciler: id })}
              />
            </PickerRow>
          ) : null}

          {models.data?.warning ? (
            <SoftWarning warning={models.data.warning} />
          ) : null}

          {advancedOpen ? (
            <div className="flex flex-col gap-2.5 rounded-none border border-foreground/10 p-2.5">
              {/* Subsumed by per-step pickers, which are multi-select anyway. */}
              {!stepMode ? (
                <ToggleRow
                  id="ideation-multi-models-toggle"
                  checked={multiMode}
                  onCheckedChange={setMultiMode}
                  label="choose multiple models"
                  description={`fan the ${STEP_LABELS[step]} step out over several models`}
                />
              ) : null}
              <ToggleRow
                id="ideation-step-models-toggle"
                checked={stepMode}
                onCheckedChange={setStepMode}
                label="choose step models"
                description="separate pickers for questions, PRD, and plan"
              />
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

/** Micro-label + control row — the Note section's label voice, hairline aligned. */
function PickerRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="w-[5.5rem] shrink-0 truncate font-mono text-[0.65rem] lowercase text-muted-foreground">
        {label}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function ToggleRow({
  id,
  checked,
  onCheckedChange,
  label,
  description,
}: {
  id: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        className="mt-0.5"
      />
      <div className="flex flex-col gap-0.5">
        <label htmlFor={id} className="cursor-pointer text-xs leading-none">
          {label}
        </label>
        <p className="font-mono text-[0.65rem] text-muted-foreground">
          {description}
        </p>
      </div>
    </div>
  );
}

function LoadingRow() {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <Button variant="outline" size="sm" disabled className="h-7 gap-1.5">
        <Loader2 className="size-3.5 animate-spin" />
        loading models…
      </Button>
    </div>
  );
}

function ErrorRow({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2 text-xs text-destructive">
      <TriangleAlert className="size-3.5 shrink-0" />
      <span className="min-w-0 truncate" title={message}>
        couldn’t load the model catalog — {message}
      </span>
      <Button variant="outline" size="xs" onClick={onRetry} className="shrink-0">
        <RotateCcw className="size-3" />
        retry
      </Button>
    </div>
  );
}

/**
 * No usable providers (criterion 10): name every absent env var so the
 * user knows exactly what to set, and surface the catalog warning softly
 * when the degraded source carried one.
 */
function MissingKeysState({
  missingKeys,
  warning,
}: {
  missingKeys: IdeationMissingKey[];
  warning?: string;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-none border border-dashed border-foreground/15 p-3">
      <div className="flex items-center gap-1.5 font-mono text-[0.65rem] lowercase text-muted-foreground">
        <KeyRound className="size-3.5 shrink-0" />
        no model keys detected
      </div>
      {missingKeys.length > 0 ? (
        <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
          {missingKeys.map((missing) => (
            <li key={missing.envVar}>
              Set <span className="font-mono">{missing.envVar}</span> to use{" "}
              {missing.providerLabels} models
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">
          the model catalog came back empty
        </p>
      )}
      {warning ? <SoftWarning warning={warning} /> : null}
    </div>
  );
}

/** The catalog's degraded-source note (PRD §7) — informational, never blocking. */
function SoftWarning({ warning }: { warning: string }) {
  return (
    <p className="flex items-start gap-1.5 text-[0.65rem] text-muted-foreground/80">
      <TriangleAlert className="mt-px size-3.5 shrink-0" />
      {warning}
    </p>
  );
}

/**
 * The simple picker's shown value: the set's model when every step is solo
 * on the same one, else null ("mixed" hint — picking overwrites all steps).
 */
function soloModelId(value: IdeationModelSet): string | null {
  const first = value.questions[0] ?? value.prd[0] ?? value.plan[0];
  if (first === undefined) return null;
  const allSoloSame =
    value.questions.length === 1 &&
    value.prd.length === 1 &&
    value.plan.length === 1 &&
    value.questions[0] === first &&
    value.prd[0] === first &&
    value.plan[0] === first;
  return allSoloSame ? first : null;
}

/** Replace one step's array, keeping the others and the reconciler intact. */
function withStepModels(
  value: IdeationModelSet,
  step: IdeationStep,
  ids: string[],
): IdeationModelSet {
  return {
    reconciler: value.reconciler,
    questions: step === "questions" ? ids : value.questions,
    prd: step === "prd" ? ids : value.prd,
    plan: step === "plan" ? ids : value.plan,
  };
}

/**
 * The reconciler picker's value: keep the stored id when it is still
 * selectable, else fall back to the default reconciler (PRD §6), else the
 * first available option — a stale id must not render an empty trigger.
 */
function resolveReconcilerId(
  current: string,
  options: IdeationModelOption[],
): string {
  if (findIdeationModelOption(options, current) !== null) return current;
  if (findIdeationModelOption(options, DEFAULT_RECONCILER_MODEL) !== null) {
    return DEFAULT_RECONCILER_MODEL;
  }
  const first = options[0];
  return first !== undefined ? first.id : current;
}
