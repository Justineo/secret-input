# Secret Input

Browser autofill is aggressive enough to silently replace API keys, webhook signing secrets, and other non-login values with saved credentials. The resulting form can look valid while holding the wrong value. A native password input invites that classification; a plain text input avoids the explicit password signal but normally exposes its value.

The `mask(input)` API treats browser-controlled DOM state as untrusted. It uses a text input, keeps the actual secret in separate controller state, renders bullets by default, and discards browser-originated mutations instead of adopting them as application state.

```text
input[secretInput].value     secret123
input[secretInput].redacted  true
input.value                  •••••••••
```

`mask()` returns the same input. The actual secret is exposed through a state object at the exported `secretInput` Symbol, which cannot collide with native or third-party string properties. The native DOM value is presentation state and is never used as the source of truth. It contains one bullet per grapheme while `redacted` is `true`, which is the default.

## Use

```ts
import { mask, secretInput } from "@justineo/secret-input";

const input = mask(document.querySelector<HTMLInputElement>("#api-key")!, {
  value: applicationState.apiKey,
});
const state = input[secretInput];

input.addEventListener("input", () => {
  applicationState.apiKey = state.value;
});

showButton.addEventListener("click", () => {
  state.redacted = !state.redacted;
});
```

```html
<form>
  <label for="api-key">API key</label>
  <input class="secret-input" id="api-key" name="apiKey" type="text" autocomplete="off" required />
</form>
```

`mask()` is idempotent and returns the native input with one Symbol-keyed extension:

```ts
const secretInput: unique symbol;

interface SecretInputState {
  value: string;
  defaultValue: string;
  redacted: boolean;
}

interface SecretInput extends HTMLInputElement {
  readonly [secretInput]: SecretInputState;
}
```

Do not put a secret in the input's `value`, `defaultValue`, or markup. Initialize it through `mask()` or assign it to the Symbol-keyed state:

```ts
const input = mask(element, {
  value: initialSecret,
  defaultValue: initialSecret,
  redacted: true,
});

input[secretInput].value = nextSecret;
```

`defaultValue` supplies the initial value when `value` is omitted and controls form reset. Setting `redacted` to `false` renders plaintext into the native value; setting it back to `true` restores bullets. State writes are quiet, and changing presentation preserves the logical selection. Explicit user edits emit native-shaped `input` events, and blur after editing emits `change`.

## React

The React 19 component exposes the actual value as a controlled `value` prop and reports edits through `onValueChange`. Other input props go to the native input, and `ref` receives that input directly.

```tsx
import { useState } from "react";
import { SecretInput } from "@justineo/secret-input/react";

const [apiKey, setApiKey] = useState("");

return <SecretInput name="apiKey" value={apiKey} onValueChange={setApiKey} />;
```

Use `defaultValue` instead of `value` for an uncontrolled initial value. The component does not expose React's `onChange` prop because its event target necessarily contains the presentation value; use `onValueChange` for the actual value and `onInput` for the native event.

## Vue

The Vue component supports ordinary `v-model`. Attributes, listeners, classes, and styles fall through to its single native input.

```vue
<script setup lang="ts">
import { SecretInput } from "@justineo/secret-input/vue";
import { ref } from "vue";

const apiKey = ref("");
</script>

<template>
  <SecretInput v-model="apiKey" name="apiKey" />
</template>
```

Both adapters render `input[type="text"]` and reuse `mask()`; neither implementation passes the actual value to the native `value` prop. React and Vue are optional peer dependencies and are absent from the core entry point.

## Comparison page

The page served by `vp dev` first saves a disposable browser credential, then compares native `autocomplete="off"`, the common `autocomplete="new-password"` workaround, CSS masking, and `mask(input)` in that order. The CSS case applies `-webkit-text-security: disc` only after `CSS.supports()` confirms support; it is an experiment, not part of the library API.

## Styling

The masked element is the native input, so ordinary selectors and input pseudo-elements work directly:

```css
.secret-input {
  padding: 0.75rem 1rem;
  border: 1px solid #aaa;
  border-radius: 0.375rem;
  font: inherit;
}

.secret-input:focus-visible {
  outline: 2px solid royalblue;
}

.secret-input::placeholder {
  color: GrayText;
}
```

The `mask()` implementation has no Shadow DOM, generated wrapper, CSS masking, or framework runtime.

## Editing behavior

The native input still owns focus, caret movement, selection, pointer interaction, and the context menu. The controller handles only operations that need access to the separate secret:

- Paste, drop, typing, deletion, and selection replacement edit the actual state and immediately render the current presentation.
- IME composition is buffered separately: phonetic keystrokes do not enter the actual state, and the committed result is applied once when composition finishes.
- Undo and redo use secret-state history. Continuous typing and character deletion are grouped into transactions; caret movement, pointer interaction, composition, paste/drop, and other edit kinds start a new transaction. Native `beforeinput` commands are honored, with standard Ctrl/Command+Z, Ctrl+Y, and Command+Shift+Z shortcuts as a fallback when the browser has no native history entry for the masked DOM value.
- Copy, cut, and dragging selected text are canceled while redacted, matching the non-exporting behavior of concealed native password fields. Revealed state deliberately restores native export and cut behavior. Paste remains available.
- Autocapitalization, autocorrection, and spellcheck default to off unless the author explicitly supplies those attributes.

The browser still knows this is a text input. Its context menu may therefore display a different set of enabled commands than a native password field even though dispatched commands follow the behavior above. Word-wise caret movement and pointer word selection operate on the bullets, not undisclosed word boundaries in the secret.

## Forms

The browser initially collects the current presentation value. A document-level `formdata` handler replaces it with the actual state value, so ordinary submissions and `new FormData(form)` receive the actual secret in either presentation. Multiple masked inputs may share a name and retain DOM order. Do not mix masked and ordinary successful controls under the same name; the masked group owns that `FormData` entry.

Native `disabled`, fieldset-disabled, `readonly`, `required`, labels, ARIA, focus, selection, and styling remain attached to the real input. `maxlength` limits user edits by grapheme count, while property assignment follows native value-setter behavior and is not truncated. Constraints whose meaning depends on the actual text, such as `pattern`, need application validation through `setCustomValidity()`.

## Security and accessibility boundary

Recognized user edits update `input[secretInput].value`, then render the selected presentation. Autofill-like or otherwise unexpected `input.value` mutations are discarded when an input/change/edit event is observed; they never silently become secret state. The controller restores bullets while redacted or the authoritative plaintext while revealed. A script that writes `input.value` without dispatching an event can temporarily alter presentation until the next controller interaction, but it cannot change the actual state.

While redacted, assistive technology inspecting the current field value should encounter bullets only. The element is still `input[type="text"]`, not a native password field, and has no secure-field semantics. Typing echo may announce characters or words depending on assistive technology and user settings. Some engines expose IME edits as non-cancelable; plaintext may then exist transiently until the following input handler restores the mask.

Revealing is an explicit relaxation of that boundary: plaintext enters `input.value`, becomes available to accessibility APIs and selection export, and may be observed by same-origin code. A reveal UI should therefore be user-operated, visibly indicate its state, and expose a clear accessible name.

The controller requests password-style IME handling with the legacy `ime-mode: disabled` declaration and cancels `compositionstart` when the browser permits it. It also briefly writes two bullets during initialization before restoring the correct presentation value; current Chromium recognizes that pattern as a custom password field and may consequently suppress IME context. The primer is never retained for an empty secret. The CSS-masked text experiment on the comparison page makes the same event/CSS best-effort request.

These measures are engine-specific hardening, not a portable guarantee. Firefox honors `ime-mode`; WebKit ignores it and does not implement Chromium's bullet heuristic. Chromium behavior is version-dependent and password autofill uses separate classification signals, so IME and autofill behavior require continuing tests in Chrome, Edge, Firefox, and Safari.

This is not a security boundary against same-origin JavaScript: application code can read `input[secretInput].value` because consumers need the actual value. The Symbol prevents property-name collisions; it does not conceal the state.

## Develop

```bash
pnpm install
vp dev
vpr check
vp test
vp build
vp pack
```

The Vue adapter is an SFC using `<script setup>`. Vite+ packages it through tsdown and `unplugin-vue`; `vue-tsc` runs through `typescript-native-bridge`, whose checker is TypeScript 7's tsgo engine.

Maintenance guidance starts in [AGENTS.md](AGENTS.md), with deeper design notes under [`docs/agents/`](docs/agents/).
