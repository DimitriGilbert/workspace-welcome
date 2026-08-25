import { normalizeFieldConfig } from '@workspace-welcome/ui/components/formedible/lib/normalize-field-config';
import type { FormedibleFormValues, NormalizedUseFormedibleOptions, UseFormedibleOptions } from '@workspace-welcome/ui/components/formedible/lib/types';

export function normalizeOptions<TFormValues extends FormedibleFormValues>(
  options: UseFormedibleOptions<TFormValues>,
): NormalizedUseFormedibleOptions<TFormValues> {
  return {
    ...options,
    fields: (options.fields ?? []).map((field) => normalizeFieldConfig(field)),
  };
}
