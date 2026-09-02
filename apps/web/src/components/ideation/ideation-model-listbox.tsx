import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@workspace-welcome/ui/components/command";
import { Button } from "@workspace-welcome/ui/components/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace-welcome/ui/components/popover";
import { cn } from "@workspace-welcome/ui/lib/utils";

import type { IdeationModelsList } from "@workspace-welcome/api/lib/ideation/shared";

/**
 * The model picker's listbox layer (PRD §3, "model picker — simple first"):
 * a searchable Popover + Command combobox over the ideation.models.list
 * catalog — the repo's existing searchable pattern (the formedible
 * combobox-field composition) restyled to the Kiln voice: rounded-none,
 * lowercase mono micro-labels, lucide size-3.5. Two flavors share this
 * file: the single-select used for the "one model for every step" default
 * and the reconciler, and the multi-select used by the advanced toggles
 * (per-step fan-out sets). All catalog knowledge arrives via props —
 * these components never read env or keep a local model list (PRD §7).
 */

/** One selectable model — a keyPresent provider's model flattened for listbox use. */
export interface IdeationModelOption {
  /** Composite catalog id, e.g. "zai/glm-5.3-flash". */
  id: string;
  /** Model display label from the dump, e.g. "GLM-5.3-Flash". */
  label: string;
  /** Provider slug, e.g. "zai". */
  providerId: string;
  /** Provider display label, e.g. "Z.AI". */
  providerLabel: string;
}

/** One absent env var + the provider labels it would unlock (criterion 10). */
export interface IdeationMissingKey {
  envVar: string;
  /** Joined display names of the providers behind this env var. */
  providerLabels: string;
}

/**
 * Flatten the catalog into picker options: ONLY providers with
 * keyPresent === true (criterion 10) — the picker must never offer a
 * model whose provider cannot be called. Input order (providers by id,
 * models by id — catalog.ts's stable sort) is preserved.
 */
export function buildIdeationModelOptions(
  list: IdeationModelsList,
): IdeationModelOption[] {
  return list.providers
    .filter((provider) => provider.keyPresent)
    .flatMap((provider) =>
      provider.models.map((model) => ({
        id: model.id,
        label: model.label,
        providerId: provider.id,
        providerLabel: provider.label,
      })),
    );
}

/**
 * The missing-key empty state's copy source (criterion 10): every env var
 * that is unset among the listed providers, each with the labels of the
 * providers it would unlock — rendered by the picker as
 * "Set ZAI_API_KEY to use Z.AI models". One entry per env var, sorted by
 * env var name for stable output.
 */
export function missingIdeationKeys(
  list: IdeationModelsList,
): IdeationMissingKey[] {
  const byEnvVar = new Map<string, string[]>();
  for (const provider of list.providers) {
    if (provider.keyPresent) continue;
    const labels = byEnvVar.get(provider.envVar) ?? [];
    labels.push(provider.label);
    byEnvVar.set(provider.envVar, labels);
  }
  return [...byEnvVar.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([envVar, labels]) => ({
      envVar,
      providerLabels: [...new Set(labels)].sort().join(", "),
    }));
}

/** Look up an option by composite id; null when the catalog doesn't list it. */
export function findIdeationModelOption(
  options: IdeationModelOption[],
  id: string,
): IdeationModelOption | null {
  return options.find((option) => option.id === id) ?? null;
}

/** Options grouped per provider for the CommandGroup headings. */
function groupOptions(
  options: IdeationModelOption[],
): Map<string, { label: string; models: IdeationModelOption[] }> {
  const groups = new Map<string, { label: string; models: IdeationModelOption[] }>();
  for (const option of options) {
    const group = groups.get(option.providerId) ?? {
      label: option.providerLabel,
      models: [],
    };
    group.models.push(option);
    groups.set(option.providerId, group);
  }
  return groups;
}

/** Searchable text cmdk filters on — provider, label, and raw id all match. */
function searchableValue(option: IdeationModelOption): string {
  return `${option.providerLabel} ${option.label} ${option.id}`;
}

/**
 * The shared Popover + Command shell: outline trigger button (Kiln
 * rounded-none, size-3.5 chevron), searchable list grouped by provider,
 * each row showing the model label plus its provider label. `renderValue`
 * supplies the trigger's value display; rows report back through `onPick`,
 * and `closeOnPick` decides whether selecting closes the popover (single)
 * or leaves it open for further picks (multi).
 */
function IdeationModelListboxShell({
  options,
  ariaLabel,
  renderValue,
  onPick,
  isPicked,
  closeOnPick,
}: {
  options: IdeationModelOption[];
  ariaLabel: string;
  renderValue: () => ReactNode;
  onPick: (id: string) => void;
  isPicked: (id: string) => boolean;
  closeOnPick: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  // Drop the search text between opens so each session starts unfiltered.
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            role="combobox"
            aria-label={ariaLabel}
            aria-expanded={open}
            className="h-7 min-w-0 justify-between gap-2 font-normal"
          />
        }
      >
        {renderValue()}
        <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <Command>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="search models…"
          />
          <CommandList>
            <CommandEmpty>no models match.</CommandEmpty>
            {[...groupOptions(options)].map(([providerId, group]) => (
              <CommandGroup key={providerId} heading={group.label}>
                {group.models.map((option) => (
                  <CommandItem
                    key={option.id}
                    value={searchableValue(option)}
                    aria-selected={isPicked(option.id)}
                    onSelect={() => {
                      onPick(option.id);
                      if (closeOnPick) setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "size-3.5 shrink-0",
                        isPicked(option.id) ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="flex min-w-0 flex-1 items-baseline justify-between gap-2">
                      <span className="truncate">{option.label}</span>
                      <span className="shrink-0 font-mono text-[0.65rem] text-muted-foreground">
                        {option.providerLabel}
                      </span>
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/**
 * The single-select flavor: picking a model closes the listbox and reports
 * the composite id. `value` may be null (nothing common to show — the
 * picker renders a muted "mixed" hint then) or an id the catalog no longer
 * lists (stale settings — shown raw in mono rather than silently swapped).
 */
export function IdeationModelListbox({
  options,
  value,
  onSelect,
  ariaLabel,
}: {
  options: IdeationModelOption[];
  value: string | null;
  onSelect: (id: string) => void;
  ariaLabel: string;
}) {
  return (
    <IdeationModelListboxShell
      options={options}
      ariaLabel={ariaLabel}
      isPicked={(id) => id === value}
      onPick={onSelect}
      closeOnPick
      renderValue={() => <SingleValue options={options} value={value} />}
    />
  );
}

function SingleValue({
  options,
  value,
}: {
  options: IdeationModelOption[];
  value: string | null;
}) {
  if (value === null) {
    return (
      <span
        className="truncate text-muted-foreground"
        title="Steps use different models — picking one applies it to every step"
      >
        mixed
      </span>
    );
  }
  const option = findIdeationModelOption(options, value);
  if (option === null) {
    return (
      <span className="truncate font-mono text-[0.65rem] text-muted-foreground">
        {value}
      </span>
    );
  }
  return <OptionValue option={option} />;
}

/**
 * The multi-select flavor: rows toggle membership and the listbox stays
 * open for further picks. Deselecting the last remaining model is ignored
 * — every step must keep at least one model (ideationStepModelsSchema's
 * min(1)), enforced here so the emitted value is always schema-valid.
 */
export function IdeationModelMultiListbox({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: IdeationModelOption[];
  value: string[];
  onChange: (ids: string[]) => void;
  ariaLabel: string;
}) {
  return (
    <IdeationModelListboxShell
      options={options}
      ariaLabel={ariaLabel}
      isPicked={(id) => value.includes(id)}
      onPick={(id) => {
        if (value.includes(id)) {
          if (value.length > 1) onChange(value.filter((v) => v !== id));
        } else {
          onChange([...value, id]);
        }
      }}
      closeOnPick={false}
      renderValue={() => <MultiValue options={options} value={value} />}
    />
  );
}

function MultiValue({
  options,
  value,
}: {
  options: IdeationModelOption[];
  value: string[];
}) {
  const first = value[0];
  if (first === undefined) {
    return <span className="truncate text-muted-foreground">none</span>;
  }
  const option = findIdeationModelOption(options, first);
  return (
    <span className="flex min-w-0 items-baseline gap-1.5">
      {option === null ? (
        <span className="truncate font-mono text-[0.65rem] text-muted-foreground">
          {first}
        </span>
      ) : (
        <OptionValue option={option} />
      )}
      {value.length > 1 ? (
        <span className="shrink-0 font-mono text-[0.65rem] text-muted-foreground">
          +{value.length - 1}
        </span>
      ) : null}
    </span>
  );
}

/** Trigger value: model label with the provider as a mono micro-suffix. */
function OptionValue({ option }: { option: IdeationModelOption }) {
  return (
    <span className="flex min-w-0 items-baseline gap-1.5">
      <span className="truncate">{option.label}</span>
      <span className="shrink-0 font-mono text-[0.65rem] text-muted-foreground">
        {option.providerLabel}
      </span>
    </span>
  );
}
