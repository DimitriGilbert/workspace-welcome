# Formedible — schema-driven forms (installed-source reference)

Date: 2026-08-24
Ground truth: the vendored source at `packages/ui/src/components/formedible/` in this repo. The online docs (https://formedible.dev/docs, repo https://github.com/DimitriGilbert/formedible) were cross-checked; **where they differ, the local code wins** and differences are called out in §12.

## 1. What is installed

Formedible is **not an npm dependency** — it was installed as source via the shadcn registry (`npx shadcn@latest add https://formedible.dev/r/use-formedible.json` style) into:

```
packages/ui/src/components/formedible/
├── form.tsx                  # plain <form> wrapper
├── field-renderer.tsx        # resolves field type -> component, builds props
├── lib/types.ts              # ALL public types (primary reference)
├── lib/validation.ts         # validator construction (built-ins, schema, cross-field, async)
├── lib/field-visibility.ts   # conditional evaluation (fields/pages/tabs)
├── lib/normalize-field-config.ts / normalize-options.ts
├── lib/field-path.ts         # get/set nested values ("items[0].name")
├── lib/dynamic-text.ts       # "{{field}}" token interpolation in labels etc.
├── lib/zod-errors.ts         # Standard-Schema issue -> message
├── fields/                   # 22 field components + field-registry.tsx + field-wrapper.tsx
├── hooks/use-formedible.tsx  # the main hook
├── hooks/use-multi-page.ts, use-form-tabs.ts, use-form-persistence.ts, use-form-analytics.ts
└── layout/                   # form-layout, form-navigation, form-progress, form-tabs
```

Runtime stack (from `packages/ui/package.json`): **`@tanstack/react-form: ^1.33.5`** (NOT react-hook-form), `zod: ^4.4.3` (catalog), `react: ^19.2.7`, `lucide-react`, plus the shadcn primitives in `packages/ui/src/components/` (`field.tsx`, `select.tsx`, `command.tsx`, `popover.tsx`, `radio-group.tsx`, `slider.tsx`, `switch.tsx`, `checkbox.tsx`, `input.tsx`, `textarea.tsx`, `button.tsx`, `badge.tsx`).
Because it is vendored source, there are no `peerDependencies` — the imports resolve within the `@workspace-welcome/ui` package.

Import path used inside the package (and by consumers via tsconfig paths — see §12 quirk):

```ts
import { useFormedible } from '@workspace-welcome/ui/components/formedible/hooks/use-formedible';
import type { FormedibleFieldConfig } from '@workspace-welcome/ui/components/formedible/lib/types';
```

## 2. Rendering a form (component API)

There is no `<Formedible>` JSX component. You call a **hook** and render the **`Form` element it returns** (source: `hooks/use-formedible.tsx`):

```tsx
export function useFormedible<TFormValues extends FormedibleFormValues = FormedibleFormValues>(
  config: UseFormedibleOptions<TFormValues>,
) // returns:
{
  Form,                 // (props: ComponentProps<'form'>) => ReactElement  — render <Form className=... /> with NO children
  form,                 // TanStack Form api instance from useForm() (form.state.values, form.reset(), ...)
  currentPage, totalPages, visiblePages, goToNextPage, goToPreviousPage, setCurrentPage,
  isFirstPage, isLastPage, progressValue,
  saveToStorage, loadFromStorage, clearStorage,   // persistence controls
}
```

`<Form />` renders the fields, optional tabs/page header, and the submit button itself — you pass no children. It accepts all `ComponentProps<'form'>` (`className`, `id`, event handlers...). It sets `noValidate` (true by default), `aria-busy` when `loading`, wraps everything in `<fieldset disabled>` while `disabled || loading || isSubmitting`, and calls `event.preventDefault()` on submit.

### `UseFormedibleOptions<TFormValues>` (exact, from `lib/types.ts`)

| Prop | Type | Notes |
|---|---|---|
| `fields` | `readonly FormedibleFieldConfig<TFormValues>[]` | the only required data; defaults `[]` |
| `formOptions` | `FormedibleFormOptions<TFormValues>` | `defaultValues`, `onSubmit`, `onChange`, `onBlur`, `onFocus`, `onReset`, `onSubmitInvalid`, `asyncDebounceMs`, `canSubmitWhenInvalid` |
| `schema` | `unknown` | any **Standard Schema v1** object (zod v3/v4 object schema works). Validated at form level; issues mapped to fields by path |
| `crossFieldValidation` | `readonly FormedibleCrossFieldValidation<TFormValues>[]` | see §7 |
| `asyncValidation` | `Partial<Record<string, FormedibleAsyncValidation<TFormValues>>>` | keyed by field name |
| `pages` / `tabs` | `readonly FormediblePageConfig[]` / `readonly (string \| FormedibleTabConfig)[]` | multi-step / tabbed forms |
| `progress` | `FormedibleProgressConfig` | `{ showSteps?, showPercentage? }` |
| `validationSummary` | `boolean \| FormedibleValidationSummaryConfig` | `{ autoNavigate?, showBadges? }`; default enabled |
| `persistence` | `FormediblePersistenceConfig` | `{ key, storage?, debounceMs?, exclude?, restoreOnMount? }` |
| `analytics` | `FormedibleAnalyticsConfig` | field/page/tab/form analytics callbacks |
| `defaultComponents` | `Record<string, FormedibleFieldComponent>` | override/register components by field `type` |
| `globalWrapper` | `FormedibleFieldWrapper` | wraps every field |
| `submitLabel` / `nextLabel` / `previousLabel` | `ReactNode` | button text (default `'Submit'`, `'Next'`, `'Previous'`) |
| `disabled` / `loading` | `boolean` | disables all controls + submit; `loading` also sets `aria-busy` |
| `showSubmitButton` | `boolean` | default `true` |
| `autoSubmitOnChange` / `autoSubmitDebounceMs` | `boolean` / `number` | debounced auto submit (default 300 ms) |
| `onFormReset` `onFormInput` `onFormInvalid` `onFormKeyDown` `onFormKeyUp` `onFormFocus` `onFormBlur` | `FormedibleFormEventHandler` | native form element events, `(event, formApiContext)` |
| `onPageChange` | `(page: number, direction: 'next' \| 'previous') => void` | |
| `resetOnSubmitSuccess` | `boolean` | **default `true`** — form resets to defaults after successful submit |
| `formClassName` / `fieldClassName` / `labelClassName` / `buttonClassName` / `submitButtonClassName` | `string` | layout styling |
| `collapseLabel` / `expandLabel` | `ReactNode` | for collapsible sections |

## 3. Field definition type

`FormedibleFieldConfig<TFormValues>` (from `lib/types.ts`) — every prop optional except `name`:

```ts
interface FormedibleFieldConfig<TFormValues extends FormedibleFormValues> {
  readonly name: Extract<keyof TFormValues, string> | string;   // supports nested paths "items[0].name"
  readonly type?: FormedibleFieldType | (string & {});          // default resolves to 'text'
  readonly label?: ReactNode;
  readonly description?: ReactNode;      // rendered under the control (FieldDescription)
  readonly placeholder?: string;
  readonly disabled?: boolean;
  readonly required?: boolean;           // adds "*" to label + built-in required validation
  readonly className?: string;           // class on the Field wrapper
  readonly inputClassName?: string;      // class on the input control
  readonly labelClassName?: string;
  readonly conditional?: FormedibleConditional<TFormValues>;    // visibility (see §6)
  readonly options?: readonly FormedibleFieldOption[] | ((values: TFormValues) => readonly FormedibleFieldOption[]);
  readonly min?: number; readonly max?: number; readonly step?: number;   // number/slider
  readonly rows?: number; readonly maxLength?: number;                    // textarea/text/number
  readonly datalist?: readonly FormedibleFieldOption[];                   // native datalist for text/number
  readonly page?: number; readonly tab?: string;                          // multi-step placement
  readonly section?: string | FormedibleFieldSection;
  readonly help?: ReactNode | FormedibleHelpConfig;                       // { text?, tooltip?, position?, link? }
  readonly validation?: FormedibleFieldValidation<TFormValues>;           // per-field (see §7)
  readonly inlineValidation?: FormedibleInlineValidation<TFormValues>;
  readonly component?: FormedibleFieldComponent<TFormValues>;              // per-field custom renderer
  readonly wrapper?: FormedibleFieldWrapper<TFormValues>;
  readonly nestedFields?: readonly FormedibleFieldConfig<TFormValues>[];   // object nesting (legacy)
  readonly arrayConfig?/objectConfig?/textareaConfig?/passwordConfig?/numberConfig?/dateConfig?/
    sliderConfig?/ratingConfig?/multiSelectConfig?/comboboxConfig?/autocompleteConfig?/
    maskedInputConfig?/multiComboboxConfig?/colorConfig?/phoneConfig?/durationConfig?/
    locationConfig?/fileConfig?: ...;                                     // typed per-type configs, see §4/§5
  readonly [customProp: string]: unknown;   // escape hatch; only consumed by custom renderers
}
```

**Options** (`FormedibleFieldOption`): either a plain `string` (value === label) or `{ value: string; label: ReactNode; disabled?: boolean; description?: ReactNode }`. **`value` is always a string** — select/radio store the string option value; use numbers only for `number`/`slider` fields. `options` may be a function of current form values (dynamic options).

**No per-field `defaultValue` exists** (except `arrayConfig.defaultValue` for new array items). Initial values come only from `formOptions.defaultValues`.

## 4. Supported field types (installed registry, `fields/field-registry.tsx`)

`FormedibleFieldType` union (exact, `lib/types.ts`): `text | email | password | url | tel | textarea | number | select | radio | checkbox | switch | date | slider | rating | phone | file | array | object | multiSelect | multiselect | combobox | autocomplete | multiCombobox | multicombobox | color | colorPicker | duration | location | masked | maskedInput` — lowercase aliases (`multiselect`, `multicombobox`, `colorPicker`, `maskedInput`) normalize to canonical (`multiSelect`, `multiCombobox`, `color`, `masked`) via `lib/normalize-field-config.ts`. Unknown type strings fall back to the `text` renderer unless registered in `defaultComponents`.

| `type` | Component (`fields/*.tsx`) | shadcn primitives used | Stored value type |
|---|---|---|---|
| `text`, `email`, `url`, `tel` | `text-field.tsx` | `Input` (native `type` attr switched; datalist support) | `string` |
| `password` | `password-field.tsx` | `Input` + `Button` (show/hide toggle, strength meter via `passwordConfig: { showToggle?, strengthMeter?, minStrength? }`) | `string` |
| `textarea` | `textarea-field.tsx` | `Textarea`; `textareaConfig: { rows?, cols?, maxLength?, resize?, showWordCount? }` | `string` |
| `number` | `number-field.tsx` | `Input type="number"`; min/max/step from top-level or `numberConfig` | `number \| undefined` (empty -> `undefined`) |
| `select` | `select-field.tsx` | `Select/SelectTrigger/SelectValue/SelectContent/SelectGroup/SelectItem` | `string` |
| `radio` | `radio-field.tsx` | `RadioGroup/RadioGroupItem` + `Field/FieldLabel` per option | `string` |
| `checkbox` | `checkbox-field.tsx` | `Checkbox` | `boolean` |
| `switch` | `switch-field.tsx` | `Switch` | `boolean` |
| `slider` | `slider-field.tsx` | `Slider` (defaults min 0 / max 100 / step 1) + `Button` for visualization clicks | `number` |
| `rating` | `rating-field.tsx` | `Button` + lucide icons; `ratingConfig: { max?=5, allowHalf?, icon?: 'star'\|'heart'\|'thumbs', size?, showValue? }` | `number` |
| `date` | `date-field.tsx` | `Input type="date"`; `dateConfig: { minDate?, maxDate?, disablePastDates?, disableFutureDates?, disableDate?(date, values) }` | `Date \| undefined` |
| `combobox` | `combobox-field.tsx` | `Popover` + `Command` (cmdk) + `Button`; `comboboxConfig: { searchable?=true, placeholder?, searchPlaceholder?, noOptionsText? }`; re-selecting clears value | `string` |
| `multiSelect` | `multi-select-field.tsx` | `Input` + `Badge` + `Button` (chips UI, not Command); `multiSelectConfig: { maxSelections?, searchable?, creatable?, placeholder?, noOptionsText? }` | `string[]` |
| `multiCombobox` | `multi-combobox-field.tsx` | wraps `MultiSelectField` (same UI) | `string[]` |
| `autocomplete` | `autocomplete-field.tsx` | `Input` + `Button`; `autocompleteConfig: { options?, asyncOptions?(query), debounceMs?, minChars?, maxResults?, allowCustom?, placeholder?, noOptionsText?, loadingText? }` | `string` |
| `masked` | `masked-field.tsx` | `Input`; `mask` or `maskedInputConfig: { mask, placeholder?, showMask?, guide?, keepCharPositions?, pipe? }` (`9` digits, `a` letters, `*` alnum) | `string` |
| `phone` | `phone-field.tsx` | `Input` + `Button`; `phoneConfig: { defaultCountry?, format?: 'national'\|'international', allowedCountries?, placeholder? }` | `string` |
| `color` | `color-picker-field.tsx` | `Input` + `Button`; `colorConfig: { format?: 'hex'\|'rgb'\|'hsl', showPreview?, presetColors?, allowCustom? }` | `string` |
| `duration` | `duration-picker-field.tsx` | `Input` + `Select` per unit; `durationConfig: { format?, maxHours?, maxMinutes?, maxSeconds?, showLabels? }` | `FormedibleDurationValue { hours, minutes, seconds, totalSeconds }` |
| `location` | `location-picker-field.tsx` | `Input` + `Button`; `locationConfig` incl. `searchCallback`, `reverseGeocodeCallback`, `enableGeolocation`, `showMap` | `FormedibleLocationValue { lat, lng, address?, ... }` |
| `file` | `file-upload-field.tsx` | `Input` + `Button`; `fileConfig: { accept?, multiple?, maxSize?, maxFiles?, onFilesChange?, onFileRemove?, onFilesRejected? }` | `File[]` |
| `array` | `array-field.tsx` | `Button` add/remove/reorder; `arrayConfig: { itemType?, minItems?, maxItems?, sortable?, defaultValue?, objectConfig? }` (+ untyped-at-runtime `itemLabel`, `addButtonLabel`, `removeButtonLabel`, `itemPlaceholder`) | array of item values |
| `object` | `object-field.tsx` | `Button` collapse; nested fields via `objectConfig.fields` or `nestedFields` | nested object |

Every built-in field renders inside `fields/field-wrapper.tsx`, which uses shadcn `Field / FieldLabel / FieldDescription / FieldError` (`packages/ui/src/components/field.tsx`): label (+ ` *` when required), control, `description`, help, and `FieldError` with the first validation message. Slider shows its current value inside the label.

## 5. Sections, pages, tabs (grouping)

- `section?: string | { title?, description?, collapsible?, defaultExpanded? }` — consecutive fields with the same section render under one `<h2>` header; `collapsible: true` wraps them in an expand/collapse group.
- `page?: number` on fields + `pages: [{ page, title, description?, conditional? }]` on the hook — renders `FormProgress` + `FormNavigation` (Previous/Next, submit on last page).
- `tab?: string` on fields + `tabs: ['general', ...] | [{ id, label, description?, conditional? }]` — renders `FormTabs`. Tabs take precedence over pages.
- `{{ fieldName }}` tokens in `label`/`description`/`placeholder`/section titles are interpolated from current values (`lib/dynamic-text.ts`).

## 6. Conditional logic (exact API)

There is **no `visibleIf` / `disabledIf` / `requiredIf`**. The single mechanism is:

```ts
readonly conditional?: FormedibleConditional<TFormValues>;
type FormedibleConditional<TFormValues> = string | ((values: TFormValues) => boolean);
```

Semantics (`lib/field-visibility.ts`):
- **string**: treated as a field path (supports `.` and `[n]`, e.g. `'notifications.enabled'`, `'items[0].name'`); the field renders iff `Boolean(valueAtPath)` — i.e. truthiness.
- **function**: receives the whole current values; renders iff it returns truthy.
- Hidden fields are **unmounted** (not just hidden) and their values stay in the form values; schema errors for currently-hidden fields are filtered out so they never block submit.
- The same `conditional` prop exists on **page configs** and **tab configs** (a page/tab is visible iff its conditional passes AND at least one of its fields is field-visible).
- Runtime (not config-driven) disabling: hook-level `disabled`/`loading` and `isSubmitting` disable all controls; there is no per-field `disabledIf`.

Example: show `repositoryUrl` only when `isPublic === true`:

```ts
{ name: 'repositoryUrl', type: 'url', label: 'Repository URL', conditional: 'isPublic' }
// or the function form:
{ name: 'repositoryUrl', type: 'url', conditional: (values) => values.isPublic === true }
```

## 7. Validation

Four layers, all defined in `lib/validation.ts`; every layer is **eager** (validators run on change, blur, and submit — the custom `validationLogic` even runs blur-cause validators on change events).

1. **Built-in constraints** (no config needed): `required` (empty string/null/undefined/`[]`/`false`-for-checkbox-switch -> `"<Label> is required"`), `email` type format check, `url` type `new URL()` check, `maxLength`, numeric `min`/`max`. First failing message wins.
2. **Per-field `validation`** — `FormedibleFieldValidation<TFormValues>`, one of:
   - a function `(value, values, { value, values, fieldName }) => string | null | undefined | false` (`false` -> "Invalid value")
   - any Standard Schema (e.g. `z.string().min(3)`) — validated via `~standard.validate`
   - `{ validator: (value, values) => result, message?: string }`
   - Async per-field: `asyncValidation: { [fieldName]: { validator(value, values, signal), debounceMs?, loadingMessage? } }` or `inlineValidation: { enabled?, debounceMs?, validator?, showSuccess? }`. (Note: `loadingMessage` is typed but never rendered by the installed code.)
3. **Form-level `schema`** — pass a zod (or any Standard Schema v1) object schema. Issues are mapped back onto fields by path (`lib/zod-errors.ts`), including nested paths. Async schemas are auto-detected and routed through async validator slots. Schema errors for hidden fields/pages/tabs are filtered.
4. **Cross-field** — `crossFieldValidation: [{ fields: ['startDate', 'endDate'], validator: (values) => string | null }]`; the message is attached to *all* listed fields, and listed fields become revalidation dependencies (`onChangeListenTo`) of each other.

**Error display**: first message per field renders via `FieldError` under the control; after a failed submit, an optional validation summary (`role="alert"`) lists every invalid field as clickable links that navigate to the right tab/page, scroll the field into view, and focus it (`autoNavigate` default true; tab/page badges show error counts).

## 8. Submission, reset, loading states

- `formOptions.onSubmit?: (context: { value: TFormValues; formApi: { state: { values }; handleSubmit() } }) => void | Promise<void>` — values arrive **fully typed as `TFormValues`**. If it throws, the error is `console.error`-ed ('Formedible form submission failed:'), analytics/reset are skipped.
- `formOptions.onSubmitInvalid?: ({ value, formApi, meta }) => void` fires on failed submit.
- **Reset**: after a successful submit the form **auto-resets to `defaultValues` and clears persistence** (`resetOnSubmitSuccess !== false`); opt out with `resetOnSubmitSuccess: false`. A native form `onReset` / `onFormReset` also calls `form.reset()`.
- **Loading/disabled**: hook-level `loading` disables all controls + submit and sets `aria-busy`; TanStack's `isSubmitting` does the same automatically. Submit button is additionally disabled while `!canSubmit` (unless `formOptions.canSubmitWhenInvalid`).
- **Controlled vs uncontrolled**: state lives in the internal TanStack Form instance (uncontrolled from your perspective). Escape hatches: the returned `form` api (`form.state.values`, `form.reset()`, `form.handleSubmit()`), `formOptions.onChange/onBlur` which receive `{ value, formApi }` (next-values snapshot), and `saveToStorage/loadFromStorage/clearStorage`. There is no `values`/`onChange` prop pair.
- `autoSubmitOnChange: true` submits automatically (debounced `autoSubmitDebounceMs` ?? 300 ms) after any change.

## 9. Typing the values object

`TFormValues` is **not inferred from `fields`** — type it via the generic (or let it infer from `formOptions.defaultValues`):

```ts
type ProjectFormValues = {
  name: string;
  visibility: 'public' | 'private';
  isPublic: boolean;
  maxMembers: number;
};

const { Form } = useFormedible<ProjectFormValues>({ fields, formOptions: { defaultValues, onSubmit } });
// onSubmit context.value: ProjectFormValues
```

Constraint: `TFormValues extends Record<string, unknown>` (`FormedibleFormValues`). Field `name` gets autocomplete for keys of `TFormValues` but plain strings are also allowed (`Extract<keyof TFormValues, string> | string`). When no generic/defaultValues are given, everything degrades to `Record<string, unknown>`. Note: select/radio/checkbox values are what TanStack stores — initialize correct types in `defaultValues` (`''` for strings, `false` for booleans, numbers for slider) because field components coerce on read (`typeof x === 'string' ? x : ''`) but the initial store value is what you set.

## 10. Custom components

- Per field: `component?: ComponentType<FormedibleFieldComponentProps>` receives both a render-props shape (`field: { id, name, value, formValues, error, onFocus?, onBlur, onChange }`, `fieldConfig`, `renderField?`) and a legacy flat shape (`fieldApi`, `label?`, `placeholder?`, `options?`, resolved `*Config` objects) — see `FormedibleFieldComponentProps` in `lib/types.ts` and `field-renderer.tsx`.
- Per type: `defaultComponents: { myType: MyComponent }` registers a custom `type: 'myType'`.
- Per field/group wrapper: `wrapper` / `globalWrapper: ({ fieldConfig, field, children }) => ReactNode`.

## 11. Copy-pasteable example — "create new project" form

Uses only installed-version features (text, select, switch, radio, slider, conditional visibility, defaults, typed onSubmit, built-in validation + one cross-field rule):

```tsx
import { useFormedible } from '@workspace-welcome/ui/components/formedible/hooks/use-formedible';
import type { FormedibleFieldConfig } from '@workspace-welcome/ui/components/formedible/lib/types';

type ProjectFormValues = {
  name: string;
  template: string;            // select stores string option values
  visibility: 'public' | 'private';
  isPublic: boolean;
  repositoryUrl: string;
  maxMembers: number;          // slider stores number
  notifyChannel: string;
};

const fields: readonly FormedibleFieldConfig<ProjectFormValues>[] = [
  {
    name: 'name',
    type: 'text',
    label: 'Project name',
    description: 'Shown to everyone in the workspace.',
    placeholder: 'my-project',
    required: true,
    maxLength: 60,
  },
  {
    name: 'template',
    type: 'select',
    label: 'Template',
    required: true,
    placeholder: 'Choose a template',
    options: [
      { value: 'blank', label: 'Blank' },
      { value: 'next-app', label: 'Next.js app', description: 'TypeScript + Tailwind' },
      { value: 'api', label: 'API service' },
    ],
  },
  {
    name: 'visibility',
    type: 'radio',
    label: 'Visibility',
    required: true,
    options: [
      { value: 'public', label: 'Public' },
      { value: 'private', label: 'Private' },
    ],
  },
  {
    name: 'isPublic',
    type: 'switch',
    label: 'List in workspace directory',
    description: 'Anyone in the workspace can discover this project.',
  },
  {
    // conditional visibility: shown only while the switch is on (string = truthy path check)
    name: 'repositoryUrl',
    type: 'url',
    label: 'Repository URL',
    required: true,
    placeholder: 'https://github.com/org/repo',
    conditional: 'isPublic',
  },
  {
    name: 'maxMembers',
    type: 'slider',
    label: 'Max members',
    min: 1,
    max: 50,
    step: 1,
    sliderConfig: { showValue: true, marks: [{ value: 1, label: '1' }, { value: 25, label: '25' }, { value: 50, label: '50' }] },
  },
  {
    name: 'notifyChannel',
    type: 'combobox',
    label: 'Notifications channel',
    placeholder: 'Select a channel',
    comboboxConfig: { searchable: true, searchPlaceholder: 'Search channels...' },
    options: (values) =>
      values.isPublic
        ? [{ value: '#general', label: '#general' }, { value: '#announce', label: '#announce' }]
        : [{ value: '#internal', label: '#internal' }],
  },
];

export function CreateProjectForm() {
  const { Form } = useFormedible<ProjectFormValues>({
    fields,
    submitLabel: 'Create project',
    formOptions: {
      defaultValues: {
        name: '',
        template: '',
        visibility: 'public',
        isPublic: false,
        repositoryUrl: '',
        maxMembers: 10,
        notifyChannel: '',
      },
      onSubmit: async ({ value }) => {
        // value: ProjectFormValues — repositoryUrl present but possibly stale when hidden; prune hidden fields yourself
        await createProject({ ...value, repositoryUrl: value.isPublic ? value.repositoryUrl : undefined });
      },
      onSubmitInvalid: ({ value }) => console.warn('invalid', value),
    },
    crossFieldValidation: [
      {
        fields: ['isPublic', 'repositoryUrl'],
        validator: (values) => (values.isPublic && !values.repositoryUrl ? 'Repository URL is required for public projects' : null),
      },
    ],
    persistence: { key: 'create-project-draft', storage: 'localStorage', restoreOnMount: true, exclude: ['repositoryUrl'] },
  });

  return <Form className="max-w-xl" />;
}
```

Notes on the example: hidden-but-previously-set values remain in the store (fields are unmounted, not cleared) — strip them in `onSubmit` if needed. `required` on `repositoryUrl` is enforced only while visible (built-in validation runs on the mounted field; schema/built-in errors for hidden fields are filtered).

Optional zod form schema (installed zod v4 also works as the whole-form `schema`):

```tsx
import { z } from 'zod';
const projectSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  template: z.string().min(1, 'Pick a template'),
  maxMembers: z.number().int().min(1).max(50),
});
// useFormedible<ProjectFormValues>({ fields, schema: projectSchema, ... })
```

## 12. Quirks of the installed version (local vs online docs)

Verified divergences — **local code is authoritative**:

| Topic | Online docs (formedible.dev) | Installed source |
|---|---|---|
| Conditional prop | `condition?: (values) => boolean` | `conditional?: string \| (values) => boolean` (string = truthy field path) |
| Select/radio options | `selectConfig` / `radioConfig` / `checkboxConfig` with `options` inside | no such config objects; `options` is **top-level** on the field (read by `resolveFieldOptions`) |
| Hook-level `layout?: LayoutConfig` | documented | **does not exist** — use `formClassName` / `fieldClassName` / `grid` via section/object configs |
| Phone countries | `preferredCountries` | `allowedCountries` (`phoneConfig`) |
| Rating | `allowClear` | not present; a Clear button always renders when value > 0 |
| `visibleIf`/string-rule DSL | — | never existed in this codebase; only `conditional` |

Additional quirks found in source:

1. **Import path / exports map**: `packages/ui/package.json` maps `"./components/*"": "./src/components/*.tsx"` — the `.tsx` suffix makes `formedible/lib/*.ts` subpaths (e.g. `lib/field-path`, imported as a *value*) unresolvable through Node package exports. Inside this monorepo it works because `apps/web/tsconfig.json` maps `@workspace-welcome/ui/*` -> `../../packages/ui/src/*` and Vite runs with `resolve.tsconfigPaths: true`. Keep importing via the `@workspace-welcome/ui/...` path alias; don't rely on package `exports` for the formedible folder.
2. Option `value` is always a `string`; number-typed fields (`number`, `slider`, `rating`) are the only numeric stores.
3. `number` field onChange yields `number | undefined` (empty input -> `undefined`), so type defaults accordingly.
4. No per-field `defaultValue` — only `formOptions.defaultValues` (plus `arrayConfig.defaultValue` for new array items).
5. `emailConfig` is deprecated and **ignored at runtime** (types.ts marks it so); use `validation`/`schema` for email rules.
6. `asyncValidation[].loadingMessage` and `inlineValidation.showSuccess` are typed but not rendered by the installed fields.
7. Validation is eager: change events also run blur-cause validators (`formedibleValidationLogic` in `use-formedible.tsx`).
8. `arrayConfig` runtime keys `itemLabel`, `addButtonLabel`, `removeButtonLabel`, `itemPlaceholder` work (read via the index signature) but are **not declared** in the `FormedibleArrayConfig` type — declare them with a cast if you need them typed.
9. The returned `Form` has a stable identity per mount (memoized via ref) — safe to pass around; it reads config through a runtime ref.
10. Combobox re-selecting the current value **clears** it (`field.onChange(nextValue === value ? '' : nextValue)`).
11. Files are untracked in git as of 2026-08-24 (`?? packages/ui/src/components/formedible/` etc.) — commit them.

## 13. Open questions

- **Which formedible release is vendored?** No version metadata shipped with the source (no package.json inside `formedible/`, registry install leaves none). It matches the current formedible.dev docs (TanStack Form v1 generation) but with local extensions (e.g. `conditional` string paths, `FormedibleFieldSection`) — exact upstream commit unknown. Check https://github.com/DimitriGilbert/formedible/commits if pinning matters.
- In-repo usage: **none found** — `grep` for `Formedible|formedible` outside the component folder returns nothing; this "create project" form will be the first consumer.
- `location`/`duration`/`file` field rendering details (beyond config types) were not deep-read; config keys above are from `lib/types.ts` and the field files' imports/usage.
- The local skill `~/.agents/skills/shadcn/SKILL.md` does **not** mention formedible (checked its TOC/grep — no hits), so no extra guidance from there.

## Source index (all paths relative to repo root)

- Hook: `packages/ui/src/components/formedible/hooks/use-formedible.tsx`
- Types: `packages/ui/src/components/formedible/lib/types.ts`
- Validation: `packages/ui/src/components/formedible/lib/validation.ts`, `lib/zod-errors.ts`
- Conditionals: `packages/ui/src/components/formedible/lib/field-visibility.ts`
- Registry: `packages/ui/src/components/formedible/fields/field-registry.tsx`
- Wrapper/errors UI: `packages/ui/src/components/formedible/fields/field-wrapper.tsx`
- Deps: `packages/ui/package.json`; workspace catalog `pnpm-workspace.yaml`
- Online: https://formedible.dev/docs (getting-started, fields, api pages), https://github.com/DimitriGilbert/formedible
