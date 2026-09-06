# Secret Input public API design

Status: controller-based design implemented on 2026-09-06. The core exposes explicit state and update operations while retaining native input interaction. React uses value/onChange with controlled and uncontrolled modes; Vue uses defineModel. There is no React onCommit.

## Start with actual tasks

Users need to type, paste, edit, inspect, validate, and submit non-login secrets such as API keys and tokens on configuration pages while avoiding unrelated credential fills. The component handles correct editing, hiding/revealing, and natural form integration without becoming a password manager, validation framework, or general editor.

Every new interface must serve an actual task. Do not add synonyms for problems already solved by native methods, framework events, or state. A core event does not imply that every framework needs a corresponding component callback.

## Native core

```ts
interface SecretInputOptions {
  value?: string | undefined;
  defaultValue?: string | undefined;
  revealed?: boolean | undefined;
  required?: boolean | undefined;
  pattern?: string | undefined;
  minLength?: number | undefined;
  maxLength?: number | undefined;
  customValidity?: string | undefined;
}

interface SecretInputController {
  readonly input: HTMLInputElement;
  readonly value: string;
  readonly defaultValue: string;
  readonly revealed: boolean;
  update(options: SecretInputOptions): void;
}

function createSecretInput(
  input: HTMLInputElement,
  options?: SecretInputOptions,
): SecretInputController;
```

The factory returns an explicit controller, distinct from its native input. Repeated creation returns the same controller and ignores subsequent options; updates always use controller.update(). There are no added native secret properties, Symbol-based state entry points, or overridden native methods.

| Interface                | Contract                                                                                           |
| ------------------------ | -------------------------------------------------------------------------------------------------- |
| controller.input         | Read-only reference to the native input for focus, selection, styling, ARIA, and form interaction  |
| controller.value         | Read-only actual secret, separate from native input.value presentation                             |
| controller.defaultValue  | Read-only reset baseline                                                                           |
| controller.revealed      | Read-only presentation state, initially false                                                      |
| controller.update(patch) | Applies value, reset default, reveal, and rule changes synchronously without emitting input/change |

Initially, the secret is value ?? defaultValue ?? "" and the reset baseline is defaultValue ?? initialSecret. A patch only changes keys it includes. Explicit undefined clears value/defaultValue to an empty string, resets boolean settings to false, removes optional pattern/length rules, and clears customValidity. Length bounds must be integers from 0 through 2147483647; invalid configuration throws before any state or DOM mutation. Contradictory bounds remain valid configuration that rejects every nonempty value.

A different actual value clears history and composition and moves the caret to the end. Equal-value synchronization preserves both. Updating only the reset baseline or rules preserves editing state. Reveal changes preserve the secret, history, and logical selection. Patches apply the final value, presentation, and rules together and return with current validity.

```ts
const field = createSecretInput(input, { value: "ABCD", required: true });
field.update({ value: "123456", pattern: "[0-9]+", minLength: 6, revealed: true });
field.update({ pattern: undefined });
input.reportValidity();
```

Native input.value and defaultValue belong to presentation. Pass actual values through controller options, never native value writes. Ordinary disabled, readOnly, name, form, placeholder, class/style, label, ARIA, focus, and selection remain native operations. The controller owns type, rule attributes, autocomplete, and password-manager ignore hints. After moving the input to another root/document, update({}) refreshes form bindings before submission without focus.

Core emits native input for accepted edits and change when Enter or blur confirms a net user edit. Enter retains focus and native implicit submission; repeated confirmation does not duplicate notifications. Read controller.value in handlers. Programmatic updates and reset do not pretend to be user edits.

## Validation interaction

Rules belong to controller options, not a DOM configuration protocol. Existing native pattern/minlength/maxlength attributes are removed at creation without adoption or migration. No MutationObserver is needed. React/Vue pass their committed rule props directly to controller.update(), including undefined for removal.

Requiredness is mirrored onto the visible input to preserve native valueMissing and accessible requiredness. Core compares UTF-16 length directly. A lazy detached password input obtains actual-value pattern messages and a localized generic format message for failing length bounds; its temporary value is always cleared. Core calls the visible input's original setCustomValidity() method to retain :invalid, reportValidity(), and native submission blocking. It never overrides that method or emulates patternMismatch/tooShort/tooLong; derived errors use customError and localized generic format messages for length failures.

The customValidity option stores application errors separately from the derived rule result. Core is the sole native writer, selecting a nonempty application message before the derived message. Clearing customValidity with an empty string or explicit undefined reveals any remaining rule failure. It persists through edits, history, reveal, reset, and unrelated renders until the application explicitly clears it. Both adapters consume the corresponding prop without emitting an HTML attribute.

Derived messages are cached by value, rules, title/lang, and owner document; every synchronization projects current owned state. update({}) still repairs presentation and refreshes form bindings after relocation. Direct input.setCustomValidity() calls remain unmodified platform operations but are not a supported second source of managed error state. Applications own server-error expiration, async request revisions, and display timing. See [validation details](validation.md) and the [architecture review](architecture-review.md).

## React: value / onChange

```tsx
const [apiKey, setApiKey] = useState("");

<SecretInput
  value={apiKey}
  onChange={setApiKey}
  revealed={revealed}
  name="apiKey"
  ref={inputRef}
/>;
```

The React component uses `onChange(value: string)` to pass the edited secret directly. Callers can pass setState without understanding bullet presentation or accessing controller state through an event. The callback receives exactly one string argument.

The React ecosystem has no universal callback signature: React Aria TextField uses onChange(value), Radix Select uses onValueChange(value), and MUI TextField uses onChange(event). This component follows React Aria's text-field value interface while retaining the selected onChange name and adding no synonymous callback.

The decision follows from the difference between the component's application value and DOM presentation. State synchronization should operate on the secret string; native events, focus, selection, and validation use their existing interfaces. Emulating the complete event interface of a native React HTML element is unnecessary.

| Mode         | Usage                           | Value owner            | Reset                                                                    |
| ------------ | ------------------------------- | ---------------------- | ------------------------------------------------------------------------ |
| Controlled   | value + onChange                | Parent component state | Retains parent state; the application resets the field by updating state |
| Uncontrolled | defaultValue, optional onChange | Controller             | Restores defaultValue                                                    |

Ordinary attributes such as readOnly and disabled use native types and pass through the props spread, without separate type branches or state modes. onChange is optional; editable controlled usage uses it to update parent state.

Types prevent combining value and defaultValue. Keep the same mode throughout the component's lifetime and use an empty string for an empty controlled value. Later uncontrolled defaultValue changes update only the reset baseline, leaving the current edit intact.

Controlled edits notify the parent immediately. When the parent synchronously accepts the value, writing back the same value preserves history and selection. If the parent does not accept it, the field restores the committed parent value. Save asynchronously after updating state synchronously. Restoration uses only committed render state and never writes to an old element after unmount.

In controlled mode, the controller's defaultValue follows the current value so native reset cannot separate the secret from parent state. Reset does not trigger onChange; applications can update parent state in the form's onReset handler. Uncontrolled reset retains core's default-value behavior and respects cancellation.

There is one application-value callback: onChange. Standard onInput(event) still observes React input events but no longer receives a separate string argument. onBlur, onFocus, keyboard, and pointer events retain their ordinary purposes; applications can validate the current value on blur or form submission as needed.

Do not add onCommit, map core change to a second React application-value callback, or report Enter or blur as another immediate onChange.

## Vue: defineModel

```vue
<script setup lang="ts">
import { ref } from "vue";
import { SecretInput } from "secret-input/vue";

const apiKey = ref("");
</script>

<template>
  <SecretInput v-model="apiKey" name="apiKey" />
</template>
```

The component uses `defineModel<string>()` and only the `modelValue` / `update:modelValue` value protocol. It has no parallel Vue value/defaultValue interface and declares no model default that could cause parent and child initial values to diverge. An undefined model appears as an empty string on the input surface.

An accepted edit writes to the model. After Vue finishes updating, the controller synchronizes with the final model. Parent acceptance of the same value preserves history; rejection restores the parent value. Without a parent model binding, use defineModel's built-in local state rather than a separate uncontrolled implementation.

Initialization and reset use the model. There is no independent reset default; native reset retains the current model, including a local model without a parent binding. Applications restore initial records by updating the model themselves.

Vue @input and @change receive native events for ordinary observation. They no longer receive `(value, event)` or provide a second model-synchronization mechanism. Listeners installed after core's filters forward events so ordinary observers do not receive rejected browser writes.

The component ref exposes a read-only input reference to the same native element after mount; it is empty after unmount. Use `field.input.focus()`, select(), and reportValidity() without component-method aliases. Supply application errors through the customValidity prop. React refs point directly to the native element.

## Core and framework boundaries

1. Core handles editing synchronously, maintaining the actual value, presentation, Unicode selection, and undo history.
2. Adapters pass accepted edits to React onChange or the Vue model.
3. Controlled parent state determines the final value; writing back an equal value does not reset editing state.
4. Only the controller writes runtime DOM value. Frameworks own the node, attributes, and ordinary events.

React retains stable initial defaultValue markup; Vue uses :value.attr for the initial HTML attribute. Ordinary class, error-description, or style changes must not write stale bullets back into the live value. Ref reattachment and React Strict Mode must not reinitialize the secret or duplicate application callbacks.

SSR outputs only bullets matching the initial grapheme count. Even when revealed is true, plaintext appears only after client attachment. Hydration discards DOM writes made before attachment and never infers the secret from browser values. The component cannot control secrets serialized by the application elsewhere in page data.

Do not depend on React's private value tracker, bypass setters to trick React into emitting change, or implement separate editing engines for React and Vue.

## Preserve native capabilities and explain value interpretation

Neither the React nor Vue component exposes a type prop; the runtime type is fixed to text. revealed is a positive switch defaulting to false, and only true reveals plaintext.

Ordinary name, form, disabled, readOnly, required, placeholder, class/style, label, ARIA, focus, and selection use native interfaces. The component owns type=text, autocomplete, and password-manager ignore attributes.

The maxLength option limits the actual string in UTF-16 units without splitting graphemes during editing. Pattern and length rules stay in controller state, and requiredness is mirrored to the native input. Adapters update all rules through the same synchronous patch API as values. No attribute migration, data-rule attributes, attribute observers, or custom-validity overrides are involved. FormData outputs actual values; the restriction on mixing ordinary and masked fields under the same name remains.

IME handling retains the existing approach: disable it where possible; otherwise clean up incidental input and protect the actual value. Add no public configuration for it.

## Lessons informing this API

| Observation                                                                                   | Decision                                                                         |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| autocomplete off does not protect values, and CSS masking retains plaintext DOM values        | Keep actual value separate from presentation                                     |
| Symbol and augmented native properties hide a distinct state model                            | Expose a separate controller with read-only state and explicit updates           |
| Writing back equal controlled values previously damaged selection and history                 | Keep core writes idempotent and reuse them in adapters                           |
| Reset microtasks can precede later cancellation listeners                                     | Internally wait for complete dispatch without adding a reset-completion callback |
| beforesecretinput introduced approval, reentrancy, and versioning for rare interception cases | Add no edit-approval phase                                                       |
| Native Enter can confirm edits while retaining focus                                          | Preserve real event order in core without requiring a larger React API           |
| onCommit is not a React text-input convention                                                 | Remove the proposal and retain only immediate onChange                           |
| Controlled reset previously separated the field from the parent model                         | Let the framework model own the final value                                      |
| Unrelated React/Vue renders could clear a blocking application error                          | Store application errors through customValidity and keep one native writer       |
| Changing only a Vue class could write stale bullets back                                      | Separate initial attributes from runtime DOM writes                              |

Event arguments forced callers to read currentTarget.secretValue, exposing the internal presentation model. Passing the value directly simplifies state synchronization and removes adaptation added solely to match ChangeEvent types.

Do not reserve interfaces for general plugins, subscriptions, undo-stack configuration, IME modes, validation engines, or destroy/unmask for hypothetical reuse. Reassess the smallest extension when a concrete requirement appears.

## Migration and acceptance

| Previous usage                                                            | New usage                                                                                         |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| mask(input, options) returns an augmented element                         | createSecretInput(input, options) returns a controller                                            |
| input.secretValue / defaultSecretValue / revealed                         | Read controller.value / defaultValue / revealed; write with controller.update()                   |
| Native or data-secret-* validation-rule attributes                        | Explicit pattern/minLength/maxLength/required options and update patches                          |
| Repeated mask(input) synchronizes rule attributes                         | controller.update(patch) applies rules synchronously; update({}) refreshes validation/bindings    |
| An overridden setCustomValidity preserves an application error separately | customValidity option/prop; core stores the message and calls unmodified native setCustomValidity |
| Enhanced native input refs in framework adapters                          | Plain HTMLInputElement refs; value ownership stays with props/model                               |
| React onInput(value, event) synchronizes state                            | onChange(value), accepting a state setter directly                                                |
| React onChange(value, event) confirms edits                               | Ordinary blur/form-validation paths                                                               |
| redacted, default true                                                    | revealed, default false                                                                           |
| Vue defaultValue                                                          | Initialize modelValue or the variable bound with v-model                                          |
| Vue input/change(value, event)                                            | Native event observation; model synchronization through v-model                                   |
| Vue ref relies on implicit $el                                            | componentRef.input                                                                                |
| An independent default participates in controlled reset                   | Parent state determines reset                                                                     |

These are breaking interface changes. Update README, examples, package consumers, and release notes together. Do not retain aliases with conflicting return types or state ownership.

Acceptance covers real keyboard input, Enter submission, native reset buttons and cancellation, parent-model reset, controlled acceptance and rejection, uncontrolled default-value updates, ordinary rerenders, selection and undo, SSR/hydration, and ref reattachment. Automation does not replace actual mobile, IME, or assistive-technology testing. Do not expand the public interface merely to cover rare native hooks.

## References

- [React Aria useTextField](https://react-aria.adobe.com/TextField/useTextField): The value/defaultValue and onChange(value) text-field interface informing this component's callback signature.
- [Radix Select](https://www.radix-ui.com/primitives/docs/components/select): onValueChange(value) is another component value-callback name; it does not imply that every component must use the same name.
- [MUI TextField](https://mui.com/material-ui/api/text-field/): onChange(event) illustrates another existing component-library interface; one library's choice is not a universal ecosystem convention.
- [React input](https://react.dev/reference/react-dom/components/input): Controlled synchronization and value/defaultValue ownership principles.
- [React form](https://react.dev/reference/react-dom/components/form): Native form integration and uncontrolled reset after a successful Action.
- [Vue component v-model](https://vuejs.org/guide/components/v-model.html): defineModel, the modelValue/update:modelValue protocol, and the risk of parent/child divergence from default model values.
- [HTML input events](https://html.spec.whatwg.org/multipage/input.html#common-input-element-events): Native input and edit-confirmation events.
- The repository's core and adapter tests, plus local native-input, Enter, and Vue rerender probes.
