# Secret Input architecture review

Research date: 2026-09-06. Status: decision implemented. The historical experiments below motivated the change; maintained regression tests now cover the implemented contract.

## Decision

Keep the explicit controller, the existing native text input, and native constraint-validation interaction. Use one application-owned `customValidity` option to the controller and framework adapters. The controller combines that message with its derived rule result and is the sole writer to the input's native custom-validity slot.

The controller boundary was retained. The previous error-ownership contract allowed a framework render to silently remove a blocking application error. Moving properties away from the DOM had not resolved that conflict; explicit application-message state now does.

This recommendation is specific to the project's existing requirements: non-login secrets, redacted DOM presentation, native input integration, framework-independent editing, and a small public API. It is not a recommendation to replace ordinary password inputs with this library.

## Evidence and constraints

### Native validation has a single custom-message slot

`setCustomValidity()` assigns one message; it does not register a validator or identify the writer. `validationMessage` is a display result, and becomes empty when validation is barred even if `customError` remains true. Thus the controller cannot reliably recover application error state by reading the DOM. Comparing the message with the controller's last message is also ambiguous when writers happen to use identical text. These limitations follow from the [HTML constraint-validation API](https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#the-constraint-validation-api).

Native length constraints depend on the browser's internal user-edit state. Assigning the real value to a detached input cannot produce native length failures on demand. Native requiredness can remain on our visible input because empty secret state has empty presentation. These are different cases, not reasons to simulate every native flag. See [HTML length constraints](https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#attr-fe-minlength).

### Established libraries separate state from the native bridge

IMask separates model and view and exposes an instance with values and `updateOptions()`. That supports keeping our controller boundary; it does not establish that IMask satisfies this project's autofill or plaintext-exposure requirements. See the [IMask guide](https://imask.js.org/guide.html).

React Aria tracks controlled, server, client, and built-in validation separately, selects a result, and projects it through native `setCustomValidity()`. Its form abstraction also owns error-display timing and clearing. This supports a single writer, but importing its whole form-state machinery into a small secret-entry controller would add responsibilities we do not need. See the pinned [validation state implementation](https://github.com/adobe/react-spectrum/blob/4dd44e0f400636a87a9ad4390903e78c5ae6113c/packages/react-stately/src/form/useFormValidationState.ts) and [native bridge](https://github.com/adobe/react-spectrum/blob/4dd44e0f400636a87a9ad4390903e78c5ae6113c/packages/react-aria/src/form/useFormValidation.ts).

React Hook Form's optional native-validation path also writes and reports messages after evaluating its rules. Its `setError()` and `clearErrors()` update form error state separately; they are not universal native-message synchronization methods. Two libraries independently controlling native validation would therefore still conflict. See pinned [validateField](https://github.com/react-hook-form/react-hook-form/blob/6f4ae0dbb2fb2ce8e27f140dde5512ee079fc69c/src/logic/validateField.ts) and [createFormControl](https://github.com/react-hook-form/react-hook-form/blob/6f4ae0dbb2fb2ce8e27f140dde5512ee079fc69c/src/logic/createFormControl.ts).

Shoelace's input component delegates `setCustomValidity()` directly to its inner input. That is sufficient when the inner input owns the actual value; it does not solve our separate actual-value and presentation-value problem. See its pinned [input implementation](https://github.com/shoelace-style/shoelace/blob/25bd8ec776609670a932f21390be59a495df497d/src/components/input/input.component.ts). This is an architectural comparison, not a dependency recommendation.

### Local browser experiments

The research fixture imported the pre-change core, React adapter, and Vue component. It uses real WebDriver keyboard input for the user-edit comparison. The candidate is a small state/projection prototype, not a replacement controller.

Tested on macOS: Chrome 152.0.7977.77, Edge 152.0.4191.62, and Firefox 155.0. Before implementation, all three produced these results:

| Experiment                                                            | Observed result                                                                  |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Native input: set an application error, then assign a different value | Error remains                                                                    |
| Native input: reset its form                                          | Error remains                                                                    |
| Native input: disable it                                              | `customError` remains true; message becomes empty; validation is barred          |
| Native input: script assigns `ab` with `minLength=5`                  | `tooShort` is false                                                              |
| Dispatch synthetic `input` after that assignment                      | `tooShort` remains false                                                         |
| Real keyboard enters `ab` with `minLength=5`                          | `tooShort` is true                                                               |
| Previous core: set an application error, then `update({})`            | Error disappears                                                                 |
| Previous core: same-value, reveal-only, or default-only update        | Error disappears                                                                 |
| Previous core: focus and blur without changing state                  | Error remains                                                                    |
| Previous React adapter: change only `className`                       | Error disappears                                                                 |
| Previous Vue adapter: change only `class`                             | Error disappears                                                                 |
| Candidate: same-value and different-value updates                     | Explicit application message remains                                             |
| Candidate: clear application message while a rule still fails         | Rule error takes over                                                            |
| Candidate: request submission while invalid                           | Submission is blocked; `invalid` fires; input receives focus; `:invalid` matches |
| Candidate: call `reportValidity()` while invalid                      | Returns false                                                                    |

These experiments established a correctness defect. React's layout effect ran its full controller patch on each commit, and Vue's function ref also synchronized during the tested render. Both reached a validation path that replaced the native message without retaining application error state. The implemented path now projects that state consistently.

Historical fixtures and browser JSON reports remain in the ignored `.vitest-attachments/architecture-research/` directory. Their assertions describe the pre-change implementation and the isolated candidate, not the current API. Maintained coverage is in tests/validation.test.ts, tests/react.test.ts, tests/vue.test.ts, tests/browser/secret-input.test.ts, and tests/browser/frameworks.test.ts. Run pnpm test --run and the appropriate BROWSER=<browser> pnpm test:browser command.

Safari, physical mobile devices, operating-system IMEs, screen-reader speech, and localized browser UI were not tested in this research. These experiments do not extend earlier coverage in those areas.

## Alternatives

| Architecture                                                                     | Fit for this project                                                                                                                                                            | Decision                                     |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Extend or intercept native input APIs and attributes                             | Can make some application code look native, but introduces interception, ambiguous ownership, and extra compatibility contracts; visible bullets still are not the actual value | Reject                                       |
| Explicit controller with built-in and application error state, one native writer | Preserves current editing and native interaction; makes framework updates deterministic; adds one state field                                                                   | Recommend                                    |
| Editing-only controller; application owns all validation                         | Coherent and viable for applications already owning a complete form layer; loses this package's integrated rules and default validation behavior                                | Do not make it the default                   |
| Attached hidden validator or temporarily swap plaintext into the visible input   | A hidden input cannot validate; a CSS-hidden normal input needs focus/error routing and retains another DOM value; swapping breaks the redacted-presentation requirement        | Reject                                       |
| Form-associated custom element using `ElementInternals`                          | Official mechanism for independent submission values and validity flags, but changes the primary element and integration contract                                               | Reserve for a separate Web Component product |

`ElementInternals.setValidity()` genuinely supports separate validity flags, and `setFormValue()` separates submitted value from internal UI. It is not necessary to invent flags for custom elements. However, adopting it here would require deliberate work on labels, focus, form lifecycle, SSR, styling, and framework refs. Existing input consumers would be migrating to a different component boundary. This is a scope tradeoff, not a claim that the platform feature lacks modern browser support. See [form-associated custom elements](https://html.spec.whatwg.org/multipage/custom-elements.html#custom-elements-face-example).

## API and ownership

Retain the existing `createSecretInput(input, options)` and synchronous `field.update(patch)` API. Options and adapters include `customValidity?: string | undefined`. Do not also add a `setCustomValidity()` controller method, validation callback registry, or separate imperative framework handle for the same operation.

```ts
const field = createSecretInput(input, {
  value: "ABCD",
  minLength: 4,
  pattern: "[A-F0-9]+",
  customValidity: "",
});

field.update({ customValidity: "This credential has been revoked." });
field.update({ revealed: true }); // Keeps the application error.
field.update({ value: "123456", customValidity: "" });
input.reportValidity();
```

The stored application message is independent from the derived rule message. Projection selects the nonempty application message first, otherwise the derived message, otherwise an empty string. Clearing the application message must reveal a remaining rule failure instead of clearing all validation. Requiredness remains native, so the browser still determines its interaction with other native constraints.

Native `focus()`, selection, `checkValidity()`, `reportValidity()`, `invalid`, and form APIs remain usable. Native `setCustomValidity()` is never overridden, but direct writes are not a supported second source of error state while the controller owns validation. Framework form libraries should pass their error string into the adapter and disable their separate native-message writer for this field. A raw native ref cannot make a library that reads `input.value` automatically understand the actual secret; value integration must use the controller/model callback.

### Clearing policy: explicit, not automatic

The controller should retain `customValidity` until the application changes or clears it, including across value changes and form reset. Omitted patch keys retain state; `""` and explicit `undefined` clear the application message. A framework prop removed on a later render must clear it through the adapter.

This is a deliberate choice. The controller cannot tell whether a message describes a rejected value, an account restriction, another field, or a server operation. Automatically clearing every error on typing would incorrectly clear some of those conditions. React Aria can offer server-specific clearing because it has a separate server-error channel and a form lifecycle; our single string has no such information. Its [forms documentation](https://react-aria.adobe.com/forms) describes that higher-level behavior.

Applications should clear a value-specific server error in their accepted-value callback, and clear form-specific state in their form-reset workflow. Async validation belongs there too: track a request or value revision, invalidate it on edits/reset, and ignore stale responses. Comparing strings alone is insufficient when values change from A to B and back to A. The core should not add requests, promises, debounce timers, touched state, or error-display timing merely to support a custom message.

| Transition                            | Derived rules              | Application message              | Editing state                      |
| ------------------------------------- | -------------------------- | -------------------------------- | ---------------------------------- |
| Accepted edit / undo / redo           | Recompute for actual value | Retain unless application clears | Existing edit/history semantics    |
| Programmatic different value          | Recompute                  | Retain unless patch clears       | Existing history/composition reset |
| Equal-value synchronization           | Reuse if inputs unchanged  | Retain                           | Preserve                           |
| Rule change                           | Recompute                  | Retain                           | Preserve                           |
| Reveal / selection / unrelated render | Reuse                      | Retain                           | Preserve existing reveal semantics |
| Default-value change                  | No immediate rule change   | Retain                           | Preserve                           |
| Uncanceled form reset                 | Recompute for reset value  | Retain unless application clears | Reset using existing contract      |
| Application message cleared           | Expose current rule result | Clear                            | Preserve                           |

## Validation implementation boundary

Keep native pattern evaluation in a lazy detached password input, with the temporary value cleared in `finally`. HTML patterns use whole-value matching and Unicode Sets (`v`) semantics; a casual `new RegExp(pattern)` replacement is not equivalent. This review also verified a Unicode Sets intersection pattern in the three local browsers. See [HTML pattern compilation](https://html.spec.whatwg.org/multipage/input.html#the-pattern-attribute).

Evaluate minimum/maximum lengths directly using the actual string's UTF-16 length. Retain complete-grapheme editing and the existing distinction between user input limiting and non-truncated programmatic assignments. Optional empty values remain exempt from length rules.

For the current browser-localized default, a failing length check may obtain a generic format message from a fixed non-secret failing probe. This avoids generating an ASCII string proportional to secret length and dynamically compiling a length pattern just to decide a numeric comparison. Keep this fallback explicitly described as a generic format error; it does not supply native length-specific wording or flags. An application needing precise, application-localized wording can provide `customValidity` from its own validation state. No new translation system is justified by the present scope.

Separate deriving a message from projecting it. Compare normalized value/rules/message inputs so unrelated renders do not rerun the validator. `update({})` must still refresh form bindings after relocation and repair presentation where needed. Message refresh should account for owner-document and explicit `title`/`lang` changes; these do not justify reintroducing attribute observers. Do not equate idempotence with skipping necessary form or presentation repair.

The reduction in repeated validation and allocation is identifiable from the code. Its user-visible speed benefit has not been benchmarked and should not be claimed as measured performance improvement.

## Acceptance criteria

1. Core and both adapters retain application-message state and project it through one native writer. Documentation and consumers use the option/prop rather than reapplying native messages after synchronization.
2. Application messages survive the transition table. Removing a framework prop or clearing the option exposes any remaining rule error.
3. Derived validation depends on meaningful inputs; relocation repair and editing semantics remain intact. Numeric length comparisons preserve the existing bounds and wording guarantees.
4. Native submission blocking, focus/reporting, disabled/read-only/fieldset exemptions, and invalid behavior work with managed messages. Controlled rollback, Vue synchronization, reset cancellation, history, selection, and composition retain their contracts.
5. Required static, package, site, and browser checks pass where the environment supports them. Safari/mobile/IME and localized-UI gaps remain explicit.

Implementation verification on 2026-09-06: 195 unit tests passed; Chrome and Edge each passed 36 browser tests; Firefox passed 35 with the Chromium-only composition case skipped. Static checks, package build, strict package-consumer types, publint, site build, and site budgets passed. Safari WebDriver rejected session creation because Allow Remote Automation is disabled. These automated results do not establish physical-device IME or screen-reader speech coverage.

No second architecture rewrite is warranted. A different choice becomes preferable if the product drops built-in form validation, or explicitly becomes a form-associated Web Component. Under the current requirements, fixing ownership and update semantics is the smallest coherent correction.
