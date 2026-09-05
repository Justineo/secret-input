# Secret Input

[![CI](https://github.com/Justineo/secret-input/actions/workflows/ci.yml/badge.svg)](https://github.com/Justineo/secret-input/actions/workflows/ci.yml)

Keep autofill out of API keys, tokens, and other non-login secrets.

- **Wrong values.** Browser heuristics can pair unrelated fields as a login, even when they are far apart. Autofill can then replace configuration values with a saved username and password. Changes to fields outside the viewport, or to masked secrets, are easy to miss. Submitting the form can send a login password where an API key was expected and break a production integration.
- **Repeated interruptions.** Saved-password and password-generation menus can cover controls and reappear on focus. Users have to dismiss irrelevant suggestions while entering or reviewing configuration.

`mask()` keeps the actual value in `input.secretValue` and renders bullets in a native text input. Browser and extension writes cannot silently replace that state. No wrapper, Shadow DOM, or CSS masking.

[Live demo and browser comparison](https://secret-input.void.app/) · [Limitations](#boundaries)

## Install

```sh
pnpm add secret-input
```

## Use

Start with a text input. Pass secrets to `mask()`, never to HTML markup, native `value`, or `defaultValue`.

```html
<form>
  <label for="api-key">API key</label>
  <input id="api-key" name="apiKey" type="text" required />
</form>
```

```ts
import { mask } from "secret-input";

const input = mask(document.querySelector<HTMLInputElement>("#api-key")!, {
  value: "sk_test_123",
});

input.value; // "•••••••••••"
input.secretValue; // "sk_test_123"
```

The same native input retains its labels, styles, focus, selection, and form participation.

## API

```ts
declare function mask(
  input: HTMLInputElement,
  options?: {
    value?: string;
    defaultValue?: string;
    redacted?: boolean;
  },
): SecretInput;
```

`SecretInput` extends `HTMLInputElement` with three accessors:

| Accessor             | Purpose                   | Assignment                                                                           |
| -------------------- | ------------------------- | ------------------------------------------------------------------------------------ |
| `secretValue`        | Actual secret             | A different value clears history and composition. The same value preserves both.     |
| `defaultSecretValue` | Form-reset value          | Leaves the current secret unchanged.                                                 |
| `redacted`           | Masking, initially `true` | `false` reveals plaintext. `true` restores bullets. Preserves selection and history. |

Initial values:

- Secret: `value ?? defaultValue ?? ""`.
- Reset value: `defaultValue ?? initialSecret`.

`mask()` returns the same input. Repeated calls refresh form bindings. Options apply only on the first call. Property assignments emit no events.

| Native event | When it fires                                                                                                    |
| ------------ | ---------------------------------------------------------------------------------------------------------------- |
| `input`      | Each accepted user edit, including undo/redo.                                                                    |
| `change`     | Blur after user edits leave a net change from the focus/reset value. Undoing back to that value emits no change. |

Read `input.secretValue` in handlers. The event target’s native `value` remains presentation only.

## Frameworks

### React

```tsx
import { useState } from "react";
import { SecretInput } from "secret-input/react";

export function ApiKeyField() {
  const [apiKey, setApiKey] = useState("");
  return <SecretInput aria-label="API key" name="apiKey" value={apiKey} onInput={setApiKey} />;
}
```

Use `value` for controlled state or `defaultValue` for uncontrolled state. A `ref` exposes the masked native input.

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

Both adapters support `defaultValue` and `redacted`, forward native attributes, and reuse the core controller. Their `input`/`change` callbacks receive `(value, event)` and follow the timing above. React uses `onInput`/`onChange`.

React and Vue are optional peers. SSR always renders bullets, even when `redacted` is `false`. Reveal happens after attachment. [Integration details](docs/agents/framework-integrations.md).

## Behavior

| Area      | Contract                                                                                                                                                                            |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Forms     | Submission and `new FormData(form)` receive the actual secret without exposing it in `input.value`.                                                                                 |
| Reset     | Restores `defaultSecretValue` at the next microtask, unless canceled. Await a microtask before reading it.                                                                          |
| Editing   | Typing, deletion, paste, drop, selection replacement, and committed IME input update secret state.                                                                                  |
| History   | Contiguous typing/deletion are grouped. Selection edits start a group, paste/drop and IME commits stand alone. Undo restores the original selection. Redo restores the final caret. |
| Clipboard | Copy, cut, and selection dragging are blocked while redacted. Paste remains available.                                                                                              |
| Unicode   | One bullet per grapheme. No normalization. Native single-line CR/LF removal and UTF-16 `maxlength` semantics apply.                                                                 |
| Autofill  | Unexpected DOM writes are rejected. Browser and known password-manager opt-out hints are applied automatically.                                                                     |

Attach the input to its form/root before calling `mask()`. After moving it to another document or shadow root, call `mask()` again before programmatic submission. Focus also refreshes bindings. Detached forms, shadow roots, and same-origin iframe inputs are supported.

[Value and form model](docs/agents/architecture.md) · [Editing and browser details](docs/agents/platform-and-input.md)

## Boundaries

Use native password inputs for login passwords. This library is **not a security boundary against same-origin JavaScript**.

| Area              | Limitation                                                                                                                  |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Password managers | May ignore opt-out hints. Separate secret state protects the application value.                                             |
| Accessibility     | Redacted values expose bullets, but text inputs lack native secure-field semantics. Typing echo may announce input.         |
| Undo/redo         | Uses controller history. Native menu items may be disabled. Grouping and selection can differ by platform.                  |
| IME               | Suppression is best effort. Drafts stay outside secret state, but engines may expose transient plaintext.                   |
| Reveal            | Plaintext becomes available through the DOM, accessibility APIs, selection, and clipboard.                                  |
| Validation        | `minlength` and `pattern` inspect presentation. Validate `secretValue`. Use `setCustomValidity()` for native validation UI. |
| Form names        | Do not mix masked and ordinary successful controls under one `name`. The masked group owns that entry.                      |

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
