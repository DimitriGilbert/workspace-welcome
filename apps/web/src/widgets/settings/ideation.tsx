import { useEffect, useState } from "react";

import {
  DEFAULT_RECONCILER_MODEL,
  DEFAULT_STEP_MODELS,
  type IdeationModelSet,
} from "@workspace-welcome/api/lib/ideation/shared";
import { Button } from "@workspace-welcome/ui/components/button";

import { IdeationModelPicker } from "@/components/ideation/ideation-model-picker";
import { useSettings } from "@/lib/contexts/settings-context";
import { WidgetShell } from "@/components/widgets/widget-shell";

/** The settings-less seed: the shared solo defaults (PRD §6), cloned. */
function defaultModelSet(): IdeationModelSet {
  return {
    questions: [...DEFAULT_STEP_MODELS.questions],
    prd: [...DEFAULT_STEP_MODELS.prd],
    plan: [...DEFAULT_STEP_MODELS.plan],
    reconciler: DEFAULT_RECONCILER_MODEL,
  };
}

function sameModelSet(a: IdeationModelSet, b: IdeationModelSet): boolean {
  const sameStep = (x: readonly string[], y: readonly string[]) =>
    x.length === y.length && x.every((id, i) => id === y[i]);
  return (
    sameStep(a.questions, b.questions) &&
    sameStep(a.prd, b.prd) &&
    sameStep(a.plan, b.plan) &&
    a.reconciler === b.reconciler
  );
}

/**
 * SettingsIdeation — the ideation pipeline's model set (PRD §4.5) as a
 * /settings page common widget: the ONE IdeationModelPicker over the stored
 * block (simple solo pick, per-step fan-out, reconciler). The draft hydrates
 * from `settings.data.ideation` (always present — the store migrates it in);
 * Save writes the whole block through the settings context with every other
 * field passed through. Dirty gating, invalidation, and toasts are the
 * legacy settings page's contract.
 */
export function SettingsIdeation() {
  const { settings, update, saving } = useSettings();
  const data = settings.data;

  const [modelSet, setModelSet] = useState<IdeationModelSet>(defaultModelSet);

  // Hydrate the draft once settings load (and after each persisted save).
  useEffect(() => {
    const ideation = data?.ideation;
    if (ideation === undefined) return;
    setModelSet({
      questions: [...ideation.models.questions],
      prd: [...ideation.models.prd],
      plan: [...ideation.models.plan],
      reconciler: ideation.reconciler,
    });
  }, [data]);

  const dirty =
    data !== undefined &&
    !sameModelSet(modelSet, {
      questions: data.ideation.models.questions,
      prd: data.ideation.models.prd,
      plan: data.ideation.models.plan,
      reconciler: data.ideation.reconciler,
    });

  return (
    <WidgetShell title="Ideation models" className="border bg-card">
      <div className="flex flex-col gap-3 px-3 pb-3 pt-1">
        <p className="text-xs leading-relaxed text-muted-foreground">
          Models the ideation pipeline uses per step — frozen into new
          sessions when they start.
        </p>
        <IdeationModelPicker value={modelSet} onChange={setModelSet} />
        <Button
          className="w-fit"
          disabled={!dirty || saving}
          onClick={() =>
            update({
              editorCommand: data?.editorCommand ?? "",
              terminalCommand: data?.terminalCommand ?? null,
              snitchPath: data?.snitchPath ?? null,
              excludeGlobs: data?.excludeGlobs ?? [],
              ideation: {
                models: {
                  questions: [...modelSet.questions],
                  prd: [...modelSet.prd],
                  plan: [...modelSet.plan],
                },
                reconciler: modelSet.reconciler,
              },
            })
          }
        >
          Save
        </Button>
      </div>
    </WidgetShell>
  );
}
