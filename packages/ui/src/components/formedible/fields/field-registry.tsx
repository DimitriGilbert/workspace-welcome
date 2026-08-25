import type { ReactNode } from 'react';

import { AutocompleteField } from '@workspace-welcome/ui/components/formedible/fields/autocomplete-field';
import { CheckboxField } from '@workspace-welcome/ui/components/formedible/fields/checkbox-field';
import { ArrayField } from '@workspace-welcome/ui/components/formedible/fields/array-field';
import { ColorPickerField } from '@workspace-welcome/ui/components/formedible/fields/color-picker-field';
import { ComboboxField } from '@workspace-welcome/ui/components/formedible/fields/combobox-field';
import { DateField } from '@workspace-welcome/ui/components/formedible/fields/date-field';
import { DurationPickerField } from '@workspace-welcome/ui/components/formedible/fields/duration-picker-field';
import { FileUploadField } from '@workspace-welcome/ui/components/formedible/fields/file-upload-field';
import { LocationPickerField } from '@workspace-welcome/ui/components/formedible/fields/location-picker-field';
import { MaskedField } from '@workspace-welcome/ui/components/formedible/fields/masked-field';
import { MultiComboboxField } from '@workspace-welcome/ui/components/formedible/fields/multi-combobox-field';
import { MultiSelectField } from '@workspace-welcome/ui/components/formedible/fields/multi-select-field';
import { NumberField } from '@workspace-welcome/ui/components/formedible/fields/number-field';
import { ObjectField } from '@workspace-welcome/ui/components/formedible/fields/object-field';
import { PasswordField } from '@workspace-welcome/ui/components/formedible/fields/password-field';
import { PhoneField } from '@workspace-welcome/ui/components/formedible/fields/phone-field';
import { RadioField } from '@workspace-welcome/ui/components/formedible/fields/radio-field';
import { RatingField } from '@workspace-welcome/ui/components/formedible/fields/rating-field';
import { SelectField } from '@workspace-welcome/ui/components/formedible/fields/select-field';
import { SliderField } from '@workspace-welcome/ui/components/formedible/fields/slider-field';
import { SwitchField } from '@workspace-welcome/ui/components/formedible/fields/switch-field';
import { TextareaField } from '@workspace-welcome/ui/components/formedible/fields/textarea-field';
import { TextField } from '@workspace-welcome/ui/components/formedible/fields/text-field';
import type { FormedibleFieldRenderProps, FormedibleFormValues, NormalizedFieldType } from '@workspace-welcome/ui/components/formedible/lib/types';

type FieldComponent = <TFormValues extends FormedibleFormValues>(props: FormedibleFieldRenderProps<TFormValues>) => ReactNode;

const fieldRegistry: Partial<Record<NormalizedFieldType, FieldComponent>> = {
  array: ArrayField,
  autocomplete: AutocompleteField,
  checkbox: CheckboxField,
  color: ColorPickerField,
  combobox: ComboboxField,
  date: DateField,
  duration: DurationPickerField,
  email: TextField,
  file: FileUploadField,
  location: LocationPickerField,
  masked: MaskedField,
  multiCombobox: MultiComboboxField,
  multiSelect: MultiSelectField,
  number: NumberField,
  object: ObjectField,
  password: PasswordField,
  phone: PhoneField,
  radio: RadioField,
  rating: RatingField,
  select: SelectField,
  slider: SliderField,
  switch: SwitchField,
  tel: TextField,
  text: TextField,
  textarea: TextareaField,
  url: TextField,
};

export function getFieldComponent<TFormValues extends FormedibleFormValues>(
  type: NormalizedFieldType | (string & {}),
): (props: FormedibleFieldRenderProps<TFormValues>) => ReactNode {
  return fieldRegistry[type as NormalizedFieldType] ?? TextField;
}
