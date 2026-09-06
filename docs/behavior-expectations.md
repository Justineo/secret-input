# Secret Input experience goals and expected behavior

This document defines the target contract; it does not claim that every platform has passed testing. It is based on browser and assistive-technology source research and official documentation reviewed on 2026-09-05.

## Product scope

Secret Input supports configuration editing for non-login secrets such as API keys and tokens. Users can type, paste, edit, and inspect content on demand while reducing unrelated credential fills and suggestions and preventing browser or extension writes from silently replacing the value held by the application.

Avoiding unwanted browser autofill and password suggestions is the primary goal. Removing plaintext from DOM value is not a goal or security boundary. Native password inputs provide a reference for interaction capabilities. Acceptance depends on completing these tasks, without requiring identical password-field behavior on every platform. Form libraries integrate through the component's value, callbacks/model, and validation interfaces; raw-native-input compatibility with every form library is outside the scope. Continue using native password inputs for login passwords.

## Assessing support

Each capability has an ideal outcome, acceptable implementation differences, and minimum correctness and usability requirements. Supported, Best effort, and Unsupported in the comparison table describe the degree of support for that capability. They do not directly rank the overall approach and should not be added into a single score.

| Area                  | Ideal outcome                                                                                     | Acceptable differences or best effort                                                                                                           | Unacceptable failures                                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Autofill              | No unrelated fills or suggestions                                                                 | Suggestions cannot be fully suppressed, but unexpected writes never enter the authoritative value; users can still complete the task            | Autofill corrupts the actual value or submission, or suggestions persistently obstruct basic operations                   |
| IME                   | The same IME disabling effect as a native password input                                          | Correct composition handling when IME cannot be fully disabled                                                                                  | Drafts enter the authoritative value, characters are lost, commits are duplicated, or supported input cannot be completed |
| Undo/redo             | Common entry points work and restoration matches user expectations                                | Controller history works, with differences in grouping, restored selections, system menus, and gestures; available entry points are documented  | Supported operations restore incorrect content, corrupt history branches, or emit incorrect events                        |
| Assistive technology  | Users can complete the task with native password semantics and the platform's associated policies | Ordinary text-field semantics; clear purpose, hidden state, and errors; the stable current value appears as bullets; typing feedback may differ | Users cannot find or edit the field, cannot understand its state, or the component actively announces a hidden secret     |
| Selection and Unicode | Natural native operations and exact string preservation                                           | One bullet per grapheme, with differences in word operations and some selection behavior                                                        | Ordinary editing breaks Unicode characters, replaces the wrong range, or unexpectedly changes the string                  |
| Reveal and clipboard  | Clear, controllable visibility, allowing users to inspect content before copying it               | Copy, cut, and selection dragging are blocked while hidden and restored when revealed                                                           | Hidden fields export secrets or misleading bullets, or toggling corrupts the committed value or logical selection         |
| Forms and frameworks  | Correct submission, reset, and synchronization with clear integration                             | Read controller.value and validate the actual value; some native constraints cannot be used directly                                            | Submitting bullets, framework synchronization corrupting the secret, or resetting to the wrong value                      |

IME correctness is always required. Once that requirement is met, best effort is acceptable on some platforms. Missing native secure-field semantics must still be labeled unsupported; descriptive text cannot turn them into a supported capability. Products can choose this approach with an understanding of that difference.

Correct values alone are insufficient for acceptance: users must also be able to operate the field, understand its state, and submit. A difference from native behavior is not automatically a defect.

## Core experience

| User task                  | Expected outcome                                                                                                                                                                     | Implementation responsibility                                                                                                                        |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Understand what to enter   | A clear field purpose, description, and error relationship, such as "API key"; an understandable indication of whether content is hidden                                             | Core preserves native label, description, validation, and focus relationships; the application supplies specific wording and visibility descriptions |
| Enter or replace a secret  | Typing, paste, deletion, range replacement, and supported IME commits produce accurate results without loss, duplication, or silent rewriting                                        | Core maintains one authoritative value; unreliable browser paths must have a narrower, documented support scope                                      |
| Hide entered content       | In the stable hidden state, the page and presentation-value reading interfaces receive bullets; the component does not put the secret in names, descriptions, hints, or live regions | Core maintains the masked presentation; the application avoids copying the secret into other readable regions                                        |
| Inspect and verify content | Interfaces offering reveal have an operable, named button; toggling preserves the value and editing position, and revealed content is readable normally                              | Core provides revealed state; the application provides an explicit user action and synchronizes visible and accessible state                         |
| Avoid incorrect fills      | Unexpected browser/extension DOM writes cannot change the authoritative value or submission; unrelated suggestions are reduced where possible                                        | The controller rejects unwanted writes; suppressing browser and third-party suggestions is best effort                                               |
| Complete a form            | Keyboard and assistive-technology users can reach the field, edit, understand errors, and submit the correct value                                                                   | Core preserves the native input surface and form behavior; application validation must use the actual secret rather than bullets                     |

Hiding is a presentation capability that reduces exposure, not a security boundary against same-origin JavaScript. Revealing makes plaintext available to the DOM, assistive technology, and normal copy operations, and should be an explicit application feature offered to users.

## Typing feedback expectations

The component does not promise that actual characters will never be spoken while typing. The current text-input approach cannot establish native protected-field semantics or reliably control operating-system key echo, soft-keyboard exploration, or IME feedback. There is no single password-speaking policy across assistive technologies for the component to enforce.

The component should:

- Preserve ordinary text-input operability without hiding the field, changing focus, replacing its role, or disabling assistive technology to suppress speech.
- Avoid additional announcements of secrets and avoid implementing character-by-character speech through a live region.
- Name the field by its actual purpose and describe its hidden state. Descriptive text does not establish password-protection policies.
- Inform developers that ordinary text-field echo policies can differ from native password-field policies. Do not claim compliance with users' password-specific privacy settings.

Under this contract, differences in spoken letters, bullets, character counts, or editing feedback are not automatically defects. Assess whether they prevent the core task or violate the responsibility to avoid actively exposing content.

Products that require the platform's protected-typing policies should use native secure fields. That requirement is outside this component's scope.

## Editing, mobile, and history

Basic editing should produce accurate results with understandable operations and usable focus and selection. Word movement, double-click selection, undo grouping, and restored selections need not match every platform exactly. Do not rebuild a complete editor to pursue that parity.

Retain the current controller's undo/redo history as an enhancement. Standard shortcuts and history requests actually dispatched by the browser can use it. Native browser menus, iOS system gestures, and system undo buttons are not guaranteed to work. Internal history does not mean users can access it on every device.

If undo/redo later becomes a product guarantee across devices, expose public history operations and queryable availability so applications can provide buttons accessible by touch, keyboard, and screen reader. Do not add temporary browser-edit transactions or deprecated commands solely to emulate native history; assess the editing benefit and autofill consequences first. This is a future API direction, not an existing public capability.

Basic mobile typing, paste, selection, deletion, and reveal are part of the core experience and should be tested on actual devices before claiming support. An unavailable system undo entry point does not make all mobile use unsupported; desktop testing also does not establish mobile support.

## IME boundaries

Disabling IME is the ideal outcome for this capability, so the comparison table can retain Disables IME and its support levels. When disabling is unavailable, correct composition handling is acceptable best effort: drafts must not enter the authoritative value prematurely, and commits must not be duplicated.

Correct composition handling does not mean IME is disabled. It is a baseline requirement for every implementation. Explain both aspects in the same assessment without indefinitely adding browser-specific exceptions to reach the ideal outcome.

Non-cancelable edits in some browsers can briefly place composition plaintext in the DOM. Consequently, "the stable hidden state displays only bullets" must not become "plaintext never appears in the DOM at any time." Corruption or an inability to complete input on a particular IME path is a defect to fix or explicitly exclude from support. Transient presentation limits must be documented accurately.

## Acceptance testing

Test user tasks rather than counting replicated native password features.

1. Representative keyboard, touch, and screen-reader combinations can complete "find the field → type/paste → edit → understand errors → submit."
2. Refocusing a hidden field and reading its current content does not retrieve the secret from the stable presentation controlled by the component.
3. Reveal controls are operable and understandable, and toggling preserves the secret and editing position.
4. Unexpected DOM/autofill writes do not corrupt the authoritative value or submission.
5. Basic editing and IME commits do not lose, duplicate, or silently replace content.
6. Platform differences in typing echo, system menus, and gestures are recorded separately and assessed against this contract. A difference from native password behavior is not the sole failure criterion.

Choose coverage based on target users' platforms and record exact versions and unverified combinations. Source code and official documentation explain mechanisms but do not replace task-based acceptance testing. Expand verification when new findings affect core tasks; exhaustive coverage of every assistive device and behavior is not a release prerequisite.

## Current tradeoffs and future work

For non-login configuration involving API keys, tokens, and signing keys, retain the current approach: one authoritative value, a native text-input surface, and bullet presentation. The existing Safari comparison reports password suggestions for CSS masking and none for the controller approach. This observed autofill difference supports retaining the current controller; DOM plaintext isolation is not the reason. New evidence may justify a simpler editing implementation. Do not expand it into a general editor to match every native password feature.

Acceptable differences currently include best-effort IME support on some platforms, controller history differing from native history, ordinary text-field accessibility semantics, and editing masked content by grapheme. Document each separately. They do not offset one another, and a best-effort label does not remove the need for testing.

Future priorities:

1. Complete basic task verification on target mobile and screen-reader combinations, fixing content corruption or interaction barriers first.
2. Keep integration examples for reveal, state descriptions, actual-value validation, and submission clear and usable.
3. Design public history operations and availability only when a real product needs undo on devices without shortcuts; do not add UI to every field by default.
4. Recheck documented autofill, suggestion, and IME behavior when browsers and extensions change. Avoid adding further heuristics without new evidence of failure.

This decision is specific to the current use case, not a universal ranking of the four approaches. Products that prioritize full native editing and secure-field semantics and can accept password suggestions may choose native password inputs. Products requiring only visual concealment may choose CSS masking.

## Research references

- [NVDA protected-character echo handling](https://github.com/nvaccess/nvda/blob/f62c980589d1ac30babf68ad48177e9ad29a2e84/source/speech/speech.py): Password semantics can affect typing feedback as well as reading the existing value.
- [NVDA Windows character-message hook](https://github.com/nvaccess/nvda/blob/f62c980589d1ac30babf68ad48177e9ad29a2e84/nvdaHelper/remote/typedCharacter.cpp): DOM editing is not the only source of feedback.
- [Orca typing-echo decisions](https://github.com/GNOME/orca/blob/1b348713a518ee6910d64e6369288b5acdecdcdf/src/orca/typing_echo_presenter.py): Password-specific feedback decisions also exist outside NVDA.
- [Official Google TalkBack documentation](https://support.google.com/accessibility/android/answer/6007100?hl=en-GB) and [historical password-speaking policy](https://github.com/google/talkback/blob/26a27dc009d5b3605e744222541f045a3c24e038/talkback/src/main/java/com/google/android/accessibility/talkback/speech/SpeakPasswordsManager.java): Native password fields may speak letters according to software policy and user settings.
- [Chromium password-field accessibility decisions](https://github.com/chromium/chromium/blob/47dc1e96033ee37770a3e26390983b42c6a7e67f/third_party/blink/renderer/modules/accessibility/ax_object.cc): A text field's name and description do not establish the protected mapping of a native password type.
