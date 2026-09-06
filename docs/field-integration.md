# Reveal, describe, and validate a secret field

The controller owns the actual value and validation rules. Pass rules to `createSecretInput()` and change them with synchronous `field.update()` patches. The application reads the native input's `validationMessage` to display inline errors. Core mirrors requiredness onto the input, checks actual UTF-16 length and pattern, and revalidates updates, edits, and reset without an application validator.

For pattern checks, core creates one detached password input lazily, reads its localized message, and clears its value immediately. Length checks use explicit defaults without a probe. validationMessages can override required, pattern, and length messages with strings or synchronous functions; a required formatter obtains native default wording using an empty probe. Derived failures use the visible input's native custom validity, so `checkValidity()`, `reportValidity()`, `:invalid`, and form submission continue to work. Requiredness still uses native `valueMissing`; a message override adds customError while the required field is empty, and removing it restores the native message. Application errors use field.update({ customValidity: message }) or the corresponding framework prop. They remain until explicitly cleared, including across edits and reset; clearing them exposes remaining rule failures. See [validation details](validation.md) for lifecycle, rule updates, and length-message limits.

Keep the native input and add ordinary form controls around it. This example uses an illustrative application rule: a signing key must contain exactly 32 hexadecimal characters. Replace that rule with your own requirements; Secret Input itself does not restrict secrets to ASCII or this format.

```html
<form id="integration-form" novalidate>
  <label for="signing-key">Signing key</label>
  <input
    id="signing-key"
    name="signingKey"
    type="text"
    aria-describedby="key-format key-visibility key-error"
  />
  <p id="key-format">Enter the 32-character hexadecimal key supplied by your integration.</p>
  <p id="key-visibility">Content is hidden.</p>
  <p id="key-error" hidden></p>
  <button id="toggle-key" type="button" aria-controls="signing-key">Show signing key</button>
  <button type="reset">Reset</button>
  <button type="submit">Save</button>
  <p id="form-status" role="status"></p>
</form>
```

Run the following after the form is attached to the document. In TypeScript, give the queried input and form their native element types.

```js
import { createSecretInput } from "secret-input";

const form = document.querySelector("#integration-form");
const input = document.querySelector("#signing-key");
const field = createSecretInput(input, { required: true, pattern: "[0-9a-fA-F]{32}" });
const toggle = document.querySelector("#toggle-key");
const visibility = document.querySelector("#key-visibility");
const error = document.querySelector("#key-error");
const status = document.querySelector("#form-status");
let showError = false;

function updateVisibility() {
  toggle.textContent = field.revealed ? "Hide signing key" : "Show signing key";
  visibility.textContent = field.revealed ? "Content is visible." : "Content is hidden.";
}

function updateError() {
  const message = input.validationMessage;
  const visibleMessage = showError ? message : "";
  error.textContent = visibleMessage;
  error.hidden = !visibleMessage;
  input.setAttribute("aria-invalid", String(Boolean(visibleMessage)));
}

input.addEventListener("input", () => {
  status.textContent = "";
  updateError();
});

input.addEventListener("blur", () => {
  showError = true;
  updateError();
});

toggle.addEventListener("click", () => {
  // Let the browser finish button activation before changing value and selection.
  requestAnimationFrame(() => {
    field.update({ revealed: !field.revealed });
    updateVisibility();
    updateError();
  });
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  status.textContent = "";
  showError = true;
  updateError();
  if (!input.reportValidity()) return;

  const data = new FormData(form);
  // Pass data to your application's submission code, for example:
  // saveIntegration(data);
  status.textContent = "Valid key ready for submission.";
});

form.addEventListener("reset", (event) => {
  setTimeout(() => {
    if (event.defaultPrevented) return;
    showError = false;
    status.textContent = "";
    updateError();
    updateVisibility();
  }, 0);
});

updateVisibility();
updateError();
```

The example prepares form data but does not send a network request. `novalidate` lets the submit handler display the inline error before explicitly asking the browser to report validity. The browser supplies its localized required/format message; this is not an API for selecting a message language. Validate again on your server.

- Core validates the actual value in both presentations. Update or remove rules with field.update(); framework adapters pass their ordinary rule props directly to this API.
- Use a normal button with a changing action name. Do not combine this pattern with a changing `aria-pressed` state; a toggle-button pattern instead needs a stable name.
- Keep the key itself out of descriptions, errors, and live regions. The status region announces only a non-secret submission status.
- The button retains normal focus behavior. The animation-frame callback applies the presentation change after button activation: in desktop Chrome, changing the value during the click handler can otherwise reset an unfocused input's selection after the handler returns. This also occurs with native password-to-text toggles. The example preserves the selection without forcibly moving focus or suppressing pointer events.
- Controller updates emit no `input` event. Core revalidates value and rule updates synchronously; after a quiet programmatic change, update the inline error or visibility description as needed. The reset listener waits until the next task so native reset activation and the controller update have finished, and respects cancellation.
- Revealing deliberately exposes plaintext through the DOM, accessibility APIs, and normal clipboard operations. The description reports presentation state; it does not establish native secure-field semantics or control typing echo.

See [behavior expectations](behavior-expectations.md) for the product contract and [framework integrations](agents/framework-integrations.md) for controlled state and event semantics.
