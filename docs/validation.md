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

Core lazily creates one detached password input per controller. It is never attached, named, or focused. It temporarily holds the actual value for native pattern checks, or a fixed non-secret value for a length-error message, clears value in finally, and reuses the object for later checks. After moving the field across documents, field.update({}) refreshes form bindings and creates any required validator in the new ownerDocument.

Derived errors are applied by calling the input's original setCustomValidity() method. Core never replaces this method, native getters, or validity flags. This preserves :invalid, checkValidity(), reportValidity(), and native submission blocking. Derived errors use customError, without emulating patternMismatch/tooShort/tooLong. Requiredness remains native, with no handwritten empty-value predicate or required message. Browsers still determine validation exemptions for disabled/readonly controls and disabled fieldsets.

Actual edits, controller updates, and reset synchronize validity before returning or emitting the accepted input event. Derived messages are cached by actual value, rules, title, lang, and owner document. Equal-value synchronization, reveal/default-only changes, focus, blur, and presentation repairs reuse that result. Programmatic assignments are not truncated by maxLength; over-limit values remain intact but invalid.

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

[HTML length validation](https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#attr-fe-minlength) checks the browser's internal user-edit state, which scripts cannot set directly. Core compares the actual string's UTF-16 length directly. If a bound fails, a fixed non-secret value mismatching the dummy input's pattern provides the browser's localized generic format message. There is no equal-length allocation or generated length regex. The result is not native tooShort/tooLong wording and does not include the current length or bounds. Applications can provide precise wording through customValidity; the library has no translation system or hardcoded English fallback.

## Composition

Composition drafts are not displayed. Handlers restore the committed presentation and original replacement selection. A commit from compositionend, insertFromComposition, or ordinary insertText sent after DOM restoration interrupts the engine's composition uses the saved range and commits once. Drafts do not satisfy required after the handler returns.

Chrome/Edge engine regressions use the CDP input protocol to cover draft restoration, replacement selections, undo, required, and Unicode limits. These are not operating-system Chinese IME tests. Real IMEs in Firefox/Safari and mobile IMEs remain unverified. Plaintext may still appear transiently in the DOM between a non-cancelable browser write and handler cleanup.

## Message language

`validationMessage` is localized text supplied by the browser, not fixed US English. The [HTML specification](https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#dom-cva-validationmessage) requires a suitably localized message; [Chromium's Chinese resources](https://raw.githubusercontent.com/chromium/chromium/main/third_party/blink/public/strings/translations/blink_strings_zh-CN.xtb) include Chinese messages for required, pattern, and length limits.

All three local browsers returned English during testing. Changing input/html `lang` to Chinese or French did not switch the messages. Chrome still returned English after its preferred content language and `navigator.language` were changed to Chinese. Therefore:

- Applications can use messages in the language selected by the browser.
- That language is not guaranteed to match the page, and there is no interface such as `validationMessage('zh-CN')` for requesting a translation.
- `setCustomValidity` displays the supplied string without translating it.
- Products that require errors to follow the application language should manage that wording themselves.

Messages were not successfully retrieved under a browser configuration with Chinese UI. Official resources confirm that Chinese wording exists; checking those resources must not be reported as completed testing with Chinese browser UI.
