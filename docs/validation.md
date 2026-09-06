# Controller validation and dynamic rules

Validation rules are explicit controller options. `createSecretInput(input, options)` returns a controller with read-only value, defaultValue, revealed, and input properties. `field.update(patch)` changes values, presentation, and rules synchronously. The native element remains the interaction surface, without added secret properties or overridden methods.

## Updating rules

```ts
import { createSecretInput } from "secret-input";

const input = document.querySelector<HTMLInputElement>("#secret")!;
const field = createSecretInput(input, {
  value: "ABCD",
  required: true,
  minLength: 4,
  maxLength: 64,
  pattern: "[A-F0-9]+",
});

field.update({ value: "123456", minLength: 6, pattern: "[0-9]+" });
input.reportValidity(); // Already uses the complete updated state.

field.update({ pattern: undefined, minLength: undefined, maxLength: undefined });
field.update({ required: false });
```

An omitted key leaves its setting unchanged. Explicit undefined removes a rule, clears value/defaultValue to an empty string, or resets revealed/required to false. Updates do not replace the input, emit input/change events, or clear history unless they change the actual value. Rule-only updates preserve focus, selection, and composition. Length limits must be integers between 0 and 2147483647; invalid limits throw before any part of the patch is applied. Contradictory valid bounds reject every nonempty value.

| Rule           | Controller option | Native integration                                                                 |
| -------------- | ----------------- | ---------------------------------------------------------------------------------- |
| Required       | required          | Mirrored onto input.required, preserving native valueMissing and required messages |
| Maximum length | maxLength         | Limits actual UTF-16 editing length and validates programmatic assignments         |
| Minimum length | minLength         | Validates actual UTF-16 length                                                     |
| Pattern        | pattern           | A detached password input checks the actual value using native pattern syntax      |

Core does not read or observe DOM rule attributes. Existing native pattern/minlength/maxlength attributes are removed at creation, without adopting or migrating their values. Do not subsequently add those attributes to the presentation input; the browser would validate bullets independently. There are no data-secret-* rule attributes or MutationObservers. Requiredness is deliberately reflected for native validation and accessibility. Native disabled/readOnly settings remain ordinary DOM properties.

React uses standard pattern/minLength/maxLength/required props; Vue uses pattern/minlength/maxlength/required. Adapters pass committed values directly to field.update(), including undefined when a prop is removed. Both adapters also consume customValidity as application error state without rendering it as an HTML attribute. No rule data attributes or application refresh calls are needed. Ordinary native attributes, styling, and ARIA remain on the element.

## Native validation and error messages

Core lazily creates one detached password input per controller. It is never attached, named, or focused. It temporarily holds the actual value for native pattern checks, clears value in finally, and reuses the object for later checks. A required-message formatter also uses the empty probe to obtain native default wording. Length-only checks do not create or write a probe. After moving the field across documents, field.update({}) refreshes form bindings and creates any required validator in the new ownerDocument.

Derived errors are applied by calling the input's original setCustomValidity() method. Core never replaces this method, native getters, or validity flags. This preserves :invalid, checkValidity(), reportValidity(), and native submission blocking. Derived errors use customError, without emulating patternMismatch/tooShort/tooLong. Requiredness and valueMissing remain native. A configured valueMissing message is applied as a custom error while the required field is empty; removing it restores the native message and leaves customError clear. Browsers still determine validation exemptions for disabled/readonly controls and disabled fieldsets.

Actual edits, controller updates, and reset synchronize validity before returning or emitting the accepted input event. Default rule failures are cached by actual value, rules, requiredness, whether a required formatter needs native wording, title, lang, and owner document. Message-map changes reuse those checks where possible; the active formatter runs again on every synchronization. Equal-value synchronization, reveal/default-only changes, focus, blur, and presentation repairs reuse the default failure while refreshing its formatter. Programmatic assignments are not truncated by maxLength; over-limit values remain intact but invalid.

Use the customValidity option for application errors. The controller stores it independently and projects the nonempty application message, otherwise the derived message, through native setCustomValidity(). Requiredness remains native. Clearing an application message exposes any remaining rule failure.

```ts
field.update({ customValidity: "This credential has been revoked." });
field.update({ value: "another value" }); // The application error remains.
field.update({ customValidity: undefined }); // Empty string also clears it.
```

Application errors persist through edits, undo/redo, reveal, reset, and unrelated framework renders until explicitly cleared. The controller cannot infer whether a message concerns the current value, an account, or another field. Clear a value-specific server error in the application's accepted-value callback; clear form errors in the application's reset workflow when appropriate. In React use customValidity={error}; in Vue use :custom-validity="error". Removing the prop clears the message. These props do not become DOM attributes or SSR markup.

Core is the sole native custom-validity writer. It never overrides the native method, but direct input.setCustomValidity() writes are outside the managed error-state contract and synchronization can replace them. Native focus(), checkValidity(), reportValidity(), invalid events, and submission behavior remain available. External form libraries should supply the actual value through the component model and bridge their error string through customValidity, with their separate native-message writer disabled for this field.

Async validation and error-display timing belong to the application. Use a request/value revision and invalidate pending work on edits and reset; checking only string equality misses A-to-B-to-A changes. Unrelated renders must not expire errors or restart requests. No validation callback registry, asynchronous validator, or duplicate imperative error method is added to the controller.

Native title/lang changes are not observed. Call field.update({}) when the derived message must be refreshed after a direct DOM change. Message language is still selected by the browser, as described below. A complete label, reveal, and inline-error example is in [field integration](field-integration.md).

## UTF-16 length and dummy-input limitations

With `maxLength = 3`, the entire `👩‍💻` grapheme, whose length is 5, is rejected; `🔐`, whose length is 2, can be entered and appears as one bullet. Minimum and maximum length use the same UTF-16 units; graphemes determine only editing boundaries and bullet count. An optional empty value does not fail minimum length; required controls whether a value must be present.

Real-browser checks used Chrome 152.0.7977.77, Edge 152.0.4191.62, and Firefox 155.0 on macOS:

| Operation                                                                   | Native result                                                      |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Set required on a detached password input with an empty value               | valueMissing and the native message work                           |
| Set pattern and assign a mismatching actual value from script               | patternMismatch and the native message work                        |
| Set minLength=5 and assign ab from script                                   | tooShort is false and the message is empty                         |
| Enter ab using real WebDriver keyboard input instead                        | tooShort is true and a specific length message appears             |
| Call setRangeText or dispatch synthetic input after programmatic assignment | Native length errors still do not become available                 |
| Programmatically assign a value exceeding maxLength                         | The value is retained and tooLong is false                         |
| Use type=hidden                                                             | Excluded from constraint validation; cannot serve as the validator |

[HTML length validation](https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#attr-fe-minlength) checks the browser's internal user-edit state, which scripts cannot set directly. Core compares the actual string's UTF-16 length directly. Length failures use explicit default messages: `The value is too short.` and `The value is too long.`. There is no probe, equal-length allocation, or generated length regex for length-only checks. Native tooShort/tooLong flags and browser length-specific translations are not emulated.

## Customizing validation messages

A message formatter is optional wording. If it throws, the controller uses the default message and continues the operation; it does not propagate that exception. Rule enforcement, accepted-input events, history, and reset remain intact.

`validationMessages` maps every supported built-in failure to either a string or a synchronous formatter. Keys are `valueMissing`, `patternMismatch`, `tooShort`, and `tooLong`; they identify the logical failure, not fabricated flags on the visible input. `customError` remains application-owned through `customValidity`, which already contains its display message.

```ts
import type { ValidationMessages } from "secret-input";

const messages: ValidationMessages = {
  valueMissing: "Please enter a secret.",
  patternMismatch: ({ defaultMessage }) => `Secret format: ${defaultMessage}`,
  tooShort: ({ valueLength, minLength }) =>
    `Length ${valueLength} is below the required ${minLength}.`,
  tooLong: ({ maxLength }) => `The secret exceeds the length limit of ${maxLength}.`,
};

const field = createSecretInput(input, {
  required: true,
  minLength: 8,
  maxLength: 64,
  validationMessages: messages,
});

field.update({ validationMessages: { tooShort: "Please enter a longer secret." } });
field.update({ validationMessages: undefined }); // Restore every default.
```

The public `ValidationMessageContext` contains `type`, `defaultMessage`, `valueLength`, `minLength`, `maxLength`, and `pattern`. All lengths use actual UTF-16 code units, not bullet count. `minLength` is 0 when absent; absent maxLength and pattern are undefined. The context contains no plaintext value. Required and pattern defaultMessage values come from the browser; tooShort/tooLong defaults are `The value is too short.` and `The value is too long.`.

React accepts `validationMessages`; Vue templates use `:validation-messages="messages"`. The map is consumed by the adapters and never becomes a DOM attribute or SSR markup. Formatters do not run during server rendering. Updating messages preserves value, selection, and history. An omitted controller patch key retains the current map; a supplied map replaces it entirely rather than merging entries. Explicit undefined removes the map. Missing entries, empty strings, and formatter results of empty string or undefined fall back to the default; they never suppress a failing rule. A message entry does not enable its rule.

Only the selected failure's formatter runs. Formatters run synchronously when validity is synchronized, including edits, reset, and controller updates, independently of cached native pattern checks. They should only format messages, not mutate the field. Call `field.update({})` after changing external state captured by a stable formatter. React rerenders synchronize messages; Vue observes reactive map entries, and application context changes should produce an updated map or formatter. Async validation remains application-owned through customValidity.

A nonempty application `customValidity` takes priority and persists until explicitly cleared. Otherwise the order is required for an empty value, pattern for a nonempty value, minimum length, then maximum length. Only that active failure is formatted. When it passes, its message disappears and the next failure, if any, becomes visible. Programmatic values are preserved even when over the maximum. User insertions instead retain only the longest complete-grapheme prefix that fits the remaining UTF-16 capacity, accounting for any replaced selection.

Default length messages describe the condition without calling UTF-16 units visible characters. Use the map for application-language or more specific wording across all supported rules. These overrides format rule failures; they are not independent persistent application errors.

## Composition

Composition drafts are not displayed. Handlers restore the committed presentation and original replacement selection. A commit from compositionend, insertFromComposition, or ordinary insertText sent after DOM restoration interrupts the engine's composition uses the saved range and commits once. Drafts do not satisfy required after the handler returns.

Chrome/Edge engine regressions use the CDP input protocol to cover draft restoration, replacement selections, undo, required, and Unicode limits. These are not operating-system Chinese IME tests. Real IMEs in Firefox/Safari and mobile IMEs remain unverified. Plaintext may still appear transiently in the DOM between a non-cancelable browser write and handler cleanup.

## Message language

Required and pattern default messages are localized by the browser. Length messages default to English. Applications can override all four rule messages through `validationMessages`, with strings or formatters from their own translation system. The [HTML specification](https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#dom-cva-validationmessage) requires a suitably localized message; [Chromium's Chinese resources](https://raw.githubusercontent.com/chromium/chromium/main/third_party/blink/public/strings/translations/blink_strings_zh-CN.xtb) include Chinese messages for required, pattern, and length limits.

All three local browsers returned English during testing. Changing input/html `lang` to Chinese or French did not switch the messages. Chrome still returned English after its preferred content language and `navigator.language` were changed to Chinese. Therefore:

- Applications can use messages in the language selected by the browser.
- That language is not guaranteed to match the page, and there is no interface such as `validationMessage('zh-CN')` for requesting a translation.
- `setCustomValidity` displays the supplied string without translating it.
- Products that require errors to follow the application language should manage that wording themselves.

Messages were not successfully retrieved under a browser configuration with Chinese UI. Official resources confirm that Chinese wording exists; checking those resources must not be reported as completed testing with Chinese browser UI.
