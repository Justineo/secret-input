# Secret Input

[![CI](https://github.com/Justineo/secret-input/actions/workflows/ci.yml/badge.svg)](https://github.com/Justineo/secret-input/actions/workflows/ci.yml)

Keep autofill out of API keys, tokens, and other non-login secrets.

- **Wrong values.** Browser heuristics can pair unrelated fields as a login, even when they are far apart. Autofill can then replace configuration values with a saved username and password. Changes to fields outside the viewport, or to masked secrets, are easy to miss. Submitting the form can send a login password where an API key was expected and break a production integration.
- **Repeated interruptions.** Saved-password and password-generation menus can cover controls and reappear on focus. Users have to dismiss irrelevant suggestions while entering or reviewing configuration.

`createSecretInput()` keeps the actual value in a controller and renders bullets in a native text input. Browser and extension writes cannot silently replace that state. No wrapper, Shadow DOM, or CSS masking.

[Live demo and browser comparison](https://secret-input.void.app/) · [Limitations](#boundaries)

## Install

```sh
pnpm add secret-input
```

## Use

Start with a text input. Pass secrets to `createSecretInput()`, never to HTML markup, native `value`, or `defaultValue`.

```html
<form>
  <label for="api-key">API key</label>
  <input id="api-key" name="apiKey" type="text" />
</form>
```

```ts
import { createSecretInput } from "secret-input";

const input = document.querySelector<HTMLInputElement>("#api-key")!;
const field = createSecretInput(input, { value: "sk_test_123", required: true });

input.value; // "•••••••••••"
field.value; // "sk_test_123"
field.update({ value: "new secret", revealed: true });
```

The same native input retains its labels, styles, focus, selection, and form participation.

[Add an accessible reveal button and validate the actual value](docs/field-integration.md).

## API

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

declare function createSecretInput(
  input: HTMLInputElement,
  options?: SecretInputOptions,
): SecretInputController;
```

Use `field.update()` for synchronous patches. Omitted keys retain their settings; explicit `undefined` clears a rule or application error, resets value/defaultValue to an empty string, or resets a boolean to false. A patch updates the value, presentation, and rules together before returning, without emitting input/change events.

| Setting                                         | Update behavior                                                                                      |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `value`                                         | A different value clears history and composition; the same value preserves them.                     |
| `customValidity`                                | Sets an application error; empty string or undefined clears it and exposes any remaining rule error. |
| `defaultValue`                                  | Changes the form-reset baseline without overwriting the current edit.                                |
| `revealed`                                      | True reveals plaintext; false restores bullets. Preserves the value, history, and logical selection. |
| `required`, `pattern`, `minLength`, `maxLength` | Revalidates immediately without replacing the node, changing the value, or clearing history.         |

Initially, the secret is `value ?? defaultValue ?? ""` and the reset baseline is `defaultValue ?? initialSecret`. Length limits must be integers from 0 through 2147483647; use undefined to remove a bound. Invalid length configuration throws before changing the field.

There is one controller per input. Repeated creation returns that controller and ignores new options; use update for changes. The element has no added secret properties or overridden native methods. Use ordinary DOM properties for disabled, readOnly, name, styling, and ARIA, and native methods for focus, selection, and validation. The controller owns type, validation-rule attributes, autocomplete, and password-manager ignore hints.

| Native event | When it fires                                                                                                            |
| ------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `input`      | Each accepted user edit, including undo/redo.                                                                            |
| `change`     | Enter or blur confirms a net user edit since the last confirmation, focus, or reset. An unchanged value emits no change. |

Read `field.value` in handlers. The event target's native value remains presentation only.

## Frameworks

### React

```tsx
import { useState } from "react";
import { SecretInput } from "secret-input/react";

export function ApiKeyField() {
  const [apiKey, setApiKey] = useState("");
  return <SecretInput aria-label="API key" name="apiKey" value={apiKey} onChange={setApiKey} />;
}
```

Use `value` with an immediate `onChange(value: string)` for controlled state, or `defaultValue` for uncontrolled state. The callback receives the actual secret directly, so a state setter can be passed as-is. Do not combine controlled and uncontrolled props or switch modes after mounting. A `ref` exposes the native input for focus, selection, and validation; its DOM `value` remains presentation.

Native form reset restores an uncontrolled field's `defaultValue`. A controlled field retains its parent-owned value; reset the parent state to reset the field. Neither reset nor prop updates call `onChange`. There is no `onCommit` callback.

### Vue

```vue
<script setup lang="ts">
import { ref } from "vue";
import { SecretInput } from "secret-input/vue";

const apiKey = ref("");
</script>

<template>
  <SecretInput v-model="apiKey" aria-label="API key" name="apiKey" />
</template>
```

Vue uses `defineModel<string>()`: `modelValue` / `update:modelValue` is its only value API. There is no Vue `value` or `defaultValue` prop. Initialize and reset the field through the model; native form reset keeps its current value. Without a model binding, `defineModel` keeps local editing state. A component ref exposes the native element as `field.input`.

Neither component exposes a `type` prop; both use a text input. Both adapters support `revealed` (default `false`), forward native attributes, and reuse the core controller. React's standard `onInput(event)` remains an observer; Vue's `@input` and `@change` receive native events, not a separate value-first callback. Vue model updates happen on each accepted edit.

React and Vue are optional peers. SSR always renders bullets, even when `revealed` is `true`. Reveal happens after attachment. [Integration details](docs/agents/framework-integrations.md).

## Validation

Rules belong to controller options. Update or remove them in the same patch API as the value:

```ts
field.update({ required: true, minLength: 8, maxLength: 64, pattern: "[A-Za-z0-9]+" });
input.reportValidity(); // The new rules are already active.

field.update({ pattern: undefined, minLength: undefined });
```

Core validates the actual UTF-16 length and pattern. It mirrors requiredness onto the visible input and calls native `setCustomValidity()` for derived failures, preserving `:invalid`, native messages, and submission blocking. There are no rule data attributes, attribute observers, or custom-validity method overrides. Existing native pattern/minlength/maxlength attributes are removed at creation rather than adopted; supply rules explicitly through options.

React uses ordinary `pattern`, `minLength`, `maxLength`, and `required` props; Vue uses `pattern`, `minlength`, `maxlength`, and `required`. Both accept `customValidity` for application errors (Vue templates can use `:custom-validity="error"`). Adapters pass committed prop updates to the controller, including undefined to remove rules. Applications need no manual refresh after framework updates.

Set application errors through the controller or framework props:

```ts
field.update({ customValidity: "This credential has been revoked." });
field.update({ revealed: true }); // Keeps the application error.
field.update({ value: nextValue, customValidity: "" });
```

The application message takes precedence over derived rule messages and persists through edits, reset, and unrelated renders until explicitly cleared. Clearing it does not suppress remaining rule failures. Applications own when a server error expires and which asynchronous responses are still relevant. Core is the sole native custom-validity writer; direct `input.setCustomValidity()` calls are not a second error-state channel. Native `checkValidity()` and `reportValidity()` remain available. [Rules, native messages, and limitations](docs/validation.md).

## Behavior

| Area      | Contract                                                                                                                                                                            |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Forms     | Submission and `new FormData(form)` receive the actual secret without exposing it in `input.value`.                                                                                 |
| Reset     | Restores the controller's `defaultValue` after reset dispatch, unless canceled. Scripted `form.reset()` settles in a microtask; native reset buttons may need the next task.        |
| Editing   | Typing, deletion, paste, drop, selection replacement, and committed IME input update secret state.                                                                                  |
| History   | Contiguous typing/deletion are grouped. Selection edits start a group, paste/drop and IME commits stand alone. Undo restores the original selection. Redo restores the final caret. |
| Clipboard | Copy, cut, and selection dragging are blocked while redacted. Paste remains available.                                                                                              |
| Unicode   | One bullet per grapheme. No normalization. Native single-line CR/LF removal and UTF-16 `maxlength` semantics apply.                                                                 |
| Autofill  | Unexpected DOM writes are rejected. Browser and known password-manager opt-out hints are applied automatically.                                                                     |

Attach the input to its form/root before calling `createSecretInput()`. After moving it to another document or shadow root, call `field.update({})` before programmatic submission. Focus also refreshes bindings. Detached forms, shadow roots, and same-origin iframe inputs are supported.

[Value and form model](docs/agents/architecture.md) · [Editing and browser details](docs/agents/platform-and-input.md)

## Boundaries

Use native password inputs for login passwords. This library is **not a security boundary against same-origin JavaScript**.

| Area              | Limitation                                                                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Password managers | May ignore opt-out hints. Separate secret state protects the application value.                                                                   |
| Accessibility     | Redacted values expose bullets, but text inputs lack native secure-field semantics. Typing echo may announce input.                               |
| Undo/redo         | Uses controller history. Native menu items may be disabled. Grouping and selection can differ by platform.                                        |
| IME               | Suppression is best effort. Drafts are removed from the DOM without updating secret state; engines may expose transient plaintext before cleanup. |
| Reveal            | Plaintext becomes available through the DOM, accessibility APIs, selection, and clipboard.                                                        |
| Validation        | Derived failures use `customError`. Length errors use the browser’s localized format message, not native `tooShort` / `tooLong`.                  |
| Form names        | Do not mix masked and ordinary successful controls under one `name`. The masked group owns that entry.                                            |

Chrome, Edge, Firefox, and Safari have automated browser tests. Saved-credential autofill, real IMEs, iOS interaction, and assistive technology require manual checks. See the [live comparison](https://secret-input.void.app/) for observed behavior.

## Develop

```sh
pnpm install
vp dev                 # Demo
vpr check              # Formatting, lint, and types
vp test                # Unit tests
vp run test:browser    # Browser tests
vp build               # Website
vp pack                # Library
```

Set `BROWSER=chrome`, `edge`, `firefox`, or `safari` to select a browser. Safari requires **Develop → Allow Remote Automation**.

For releases, version the relevant [changelog](CHANGELOG.md) entries, then run `pnpm release`. CI gates deployment and publishing on all checks.

[Testing](docs/agents/testing.md) · [Releasing](docs/agents/releasing.md) · [Maintenance notes](docs/agents/)

## License

[MIT](LICENSE)
