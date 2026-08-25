import { FieldWrapper } from '@workspace-welcome/ui/components/formedible/fields/field-wrapper';
import { Switch } from '@workspace-welcome/ui/components/switch';
import type { FormedibleFieldRenderProps, FormedibleFormValues } from '@workspace-welcome/ui/components/formedible/lib/types';

export function SwitchField<TFormValues extends FormedibleFormValues>({ fieldConfig, field }: FormedibleFieldRenderProps<TFormValues>) {
  const checked = field.value === true;

  return (
    <FieldWrapper fieldConfig={fieldConfig} field={field}>
      <Switch
        id={field.id}
        name={field.name}
        checked={checked}
        disabled={fieldConfig.disabled}
        required={fieldConfig.required}
        aria-invalid={field.error ? true : undefined}
        className={fieldConfig.inputClassName}
        onBlur={field.onBlur}
        onCheckedChange={field.onChange}
      />
    </FieldWrapper>
  );
}
