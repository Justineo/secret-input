# Input capability review

Reviewed and updated on 2026-09-06. The product goal is avoiding unwanted browser autofill and password suggestions for non-login secrets. Keeping plaintext out of DOM value and reproducing every native-input behavior are not product goals.

Evaluate useful input capabilities and the public component contract. A form library integrates through component values, callbacks/model, and application error state; automatic compatibility with every raw-DOM collector is outside this scope.

## Correctness fixes

### Pending server-rendered input

The initial React SSR probe served markup without hydration and typed `demo` using real keyboard actions. Chrome 152 and Firefox 155 showed editable plaintext, and later attachment would discard those edits.

React and Vue now render a readonly text input until their controller attaches. Attachment restores the author's readonly setting; failed JavaScript loading leaves the field readonly. Browser regressions exercise actual typing before and after hydration, preserving the focused node. Unit tests cover author readonly settings and later updates.

CSS masking was considered. The existing project comparison records Safari password suggestions for CSS masking but none for the controller approach. Retain the controller and pending readonly guard on that autofill evidence, not because CSS leaves plaintext in DOM value. A future implementation may change this choice when saved-credential testing supports it.

### Optional validation wording

A throwing patternMismatch formatter previously interrupted synchronization after updating the value but before projecting custom validity. An invalid value could consequently pass checkValidity.

Formatter exceptions now have the same fallback as unavailable wording: use the default message and continue the operation, without propagating the exception. Tests cover all four failure types, initialization, updates, accepted input, history, reset, application-error priority, and native submission blocking.

### Form data

The old implementation deleted all entries for a managed name and appended secret values at the end. It lost ordinary same-name controls and changed global order.

The handler now locates managed entries by the successful native controls' entry counts and changes only their values in the browser's entry list. It preserves ordinary same-name inputs, textareas, selects, files, and global order. Real-browser coverage includes ordinary text identical to the mask, unchecked and disabled controls, multiple selected options, disabled options/groups, multiple files with their content and media type, a dirname companion entry, and a submitter with its own name.

This is a scoped form bridge, not a second implementation of HTML form serialization. Submitters, dirname companion entries, and form-associated custom elements must use names distinct from managed inputs. Earlier formdata observers must not change managed-name entries. If counts disagree, the handler preserves the original entries for that name, including any masks, instead of guessing and deleting unrelated data. Use distinct names for these unsupported collisions to obtain actual-value submission. Observers needing projected values run after the controller or inspect the completed FormData.

## Documented differences

- **Validation interaction styling:** the managed field supports native :invalid and reportValidity. The initial keyboard probe matched :user-invalid for a native password input but not the managed input in Chrome; Firefox matched it for both. Applications own touched/dirty display timing. Exact native user-validity styling is not promised.
- **beforeinput cancellation:** the controller applies a cancelable edit at the input target. Earlier capture cancellation is respected; a parent bubbling listener cannot undo an already committed edit. Retain the explicit component event contract rather than adding hooks to emulate every native event phase.
- **Form libraries:** use the controlled value/callback or model bridge, and customValidity for application errors. Reading input.value as the business value or independently owning setCustomValidity is not supported. This is an integration contract, not a backlog to make every native-input adapter work unchanged.

## Targeted manual coverage

Continue validating saved-credential autofill and password suggestions on actual browser profiles. Isolated automation tests unexpected write rejection, but does not establish the absence of browser password UI.

Operating-system IMEs, mobile typing/selection, and VoiceOver/NVDA/TalkBack need task-based checks: find the field, type or paste, edit, understand errors, and submit. Back/forward restoration and retained-node lifecycles also warrant targeted checks when used by applications. Automated composition events are not a substitute for physical input methods.

Track capabilities as tested, unverified, intentionally different, or unsupported. Differences alone are not defects; lost input, invalid values incorrectly passing validation, and wrong submission within the documented contract are.

## Verification

After the implementation and Simplify Code pass: 214 unit tests passed; Chrome and Edge each passed 40 browser tests; Firefox passed 39 with the Chromium-only composition test skipped. Static/TypeScript checks, library and site builds, strict package-consumer types, publint, and site budgets passed. Safari session creation was blocked because Allow Remote Automation is disabled. No new saved-credential autofill or physical-device result is claimed.
