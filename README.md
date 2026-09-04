# Secret Input

[![CI](https://github.com/Justineo/secret-input/actions/workflows/ci.yml/badge.svg)](https://github.com/Justineo/secret-input/actions/workflows/ci.yml)

Keep aggressive browser autofill out of fields that are not passwords.

`secret-input` masks a native `input[type="text"]` while keeping its actual value in separate state. The DOM contains bullets, while autofill and extension writes remain untrusted and cannot silently replace the application value.

[Live demo and browser comparison](https://secret-input.void.app/)

```text
input.type                  text
input.value                 •••••••••
input[secretInput].value    secret123
```

## Install

```sh
pnpm add secret-input
```

## Use

Start with an ordinary text input. Do not put the secret in its markup, `value`, or `defaultValue`.

```html
<form>
  <label for="api-key">API key</label>
  <input id="api-key" name="apiKey" type="text" required />
</form>
```

```ts
import { mask, secretInput } from "secret-input";

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

`mask()` returns the same native input. It adds no wrapper, Shadow DOM, CSS masking, or framework runtime, so labels, focus, form ownership, attributes, classes, styles, and input pseudo-elements continue to work normally.

When a form is submitted—or passed to `new FormData(form)`—the actual secret replaces the presentation value in the resulting `FormData`.

## API

```ts
function mask(input: HTMLInputElement, options?: MaskOptions): SecretInput;

interface MaskOptions {
  value?: string;
  defaultValue?: string;
  redacted?: boolean;
}

interface SecretInputState {
  value: string;
  defaultValue: string;
  redacted: boolean;
}

interface SecretInput extends HTMLInputElement {
  readonly [secretInput]: SecretInputState;
}
```

`mask()` is idempotent. The exported `secretInput` Symbol avoids collisions with native and third-party string properties.

- `value` is the authoritative secret.
- `defaultValue` initializes `value` when `value` is omitted and supplies the form-reset value.
- `redacted` defaults to `true`. Setting it to `false` deliberately places plaintext in `input.value`; setting it back to `true` restores bullets.

State assignments do not emit events. User edits emit `input`, and blurring after an edit emits `change`.

## React

```tsx
import { useState } from "react";
import { SecretInput } from "secret-input/react";

const [apiKey, setApiKey] = useState("");

return <SecretInput name="apiKey" value={apiKey} onValueChange={setApiKey} />;
```

`SecretInput` supports controlled `value`, uncontrolled `defaultValue`, `redacted`, and a ref to the native input. Other input props pass through. Use `onValueChange` for the actual secret; the native `onInput` event target contains only the presentation value.

## Vue

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

The Vue SFC supports `v-model`, `defaultValue`, and `redacted`. Attributes and listeners fall through to its single native input.

React and Vue are optional peer dependencies. Both adapters reuse the same framework-independent controller and emit hydration-safe bullets during SSR; neither server-renders plaintext or a temporary password input.

## Behavior

- The native input retains focus, selection, caret, pointer, and context-menu behavior.
- Typing, deletion, paste, drop, IME composition, and selection replacement update the separate secret state.
- Undo and redo operate on secret-state history and preserve common native transaction grouping.
- Copy, cut, and dragging selected text are blocked while redacted; paste remains available.
- Unicode is preserved exactly. Masked edits treat extended graphemes as atomic, while `maxlength` keeps native UTF-16 semantics.
- `autocomplete="off"` and known ignore attributes for 1Password, Bitwarden, Dashlane, LastPass, and Proton Pass are applied automatically.
- Autofill-shaped and otherwise unexpected DOM mutations are discarded instead of becoming secret state.

Current Chrome, Edge, Firefox, and Safari are covered by browser tests. Real saved-credential autofill, platform IMEs, iOS interaction, and assistive-technology combinations remain manual compatibility tests because WebDriver cannot reliably automate them.

## Boundaries

This library reduces unwanted autofill and protects its state from browser-written DOM values; it is not a security boundary against same-origin JavaScript or a native password field replacement.

- Password managers may ignore their opt-out hints. State separation is the durable protection.
- Assistive technology inspecting a redacted value should encounter bullets, but `input[type="text"]` has no native secure-field semantics. Typing echo depends on the assistive technology and user settings.
- IME suppression is best effort. Composition text is buffered so phonetic keystrokes do not enter the secret, but some engines may expose plaintext transiently before the mask is restored.
- Revealed state exposes plaintext through the DOM, accessibility APIs, selection, and clipboard.
- `minlength` and `pattern` inspect the presentation value; validate the actual secret in application code and use `setCustomValidity()` when native constraint UI is needed.
- Do not mix masked and ordinary successful controls with the same `name`; the masked group owns that `FormData` entry.

## Develop

```sh
pnpm install
vp dev
vpr check
vp test
vp run test:browser
vp build
vp pack
```

Set `BROWSER=chrome`, `edge`, `firefox`, or `safari` to run one browser target. Safari requires **Develop → Allow Remote Automation** or `safaridriver --enable`.

GitHub Actions runs static checks, unit tests, package validation, the demo build, and all four browser targets. Deployment and tagged releases wait for the complete verification chain.

Before a release, move the relevant entries in [CHANGELOG.md](CHANGELOG.md) under a versioned heading, then run `pnpm release`. The tag workflow creates the GitHub release and publishes the matching npm dist-tag with provenance. See the [release guide](docs/agents/releasing.md) for first-publish setup.

Detailed architecture and maintenance notes live in [`docs/agents/`](docs/agents/).

## License

[MIT](LICENSE)
