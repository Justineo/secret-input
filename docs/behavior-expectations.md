# Secret Input experience goals and expected behavior

This document defines the target contract; it does not claim that every platform has passed testing. The non-negotiable requirements were clarified on 2026-09-06, following the browser and assistive-technology research.

## Product scope

Secret Input supports configuration editing for non-login secrets such as API keys and tokens. Users can type, paste, edit, and inspect content on demand without unwanted credential fills, credential suggestions, or disclosure of a concealed secret to assistive technology.

Avoiding unwanted browser autofill and password suggestions is the primary goal. Removing plaintext from DOM value is not a goal or security boundary. Native password inputs provide a reference for interaction capabilities. Acceptance depends on completing these tasks, without requiring identical password-field behavior on every platform. Form libraries integrate through the component's value, callbacks/model, and validation interfaces; raw-native-input compatibility with every form library is outside the scope. Continue using native password inputs for login passwords.

## Non-negotiable acceptance gates

Every accepted implementation must satisfy all three gates on each combination it claims to support:

1. **No unwanted autofill.** Stored credentials must not be filled into the secret or unrelated neighboring configuration fields. Restoring the field afterward or rejecting the value at submission does not make an observed fill acceptable.
2. **No autofill or password suggestion UI.** Focus, typing, clearing, and related interactions must not produce irrelevant dropdowns, generation offers, keyboard suggestions, or extension overlays. A suggestion is a failure even if users can dismiss it or still complete the task.
3. **No disclosure of the concealed current value through assistive-technology reading.** The decisive scenario is: initialize or enter a secret, leave the field, then refocus it with a screen reader or request its current content. The concealed secret must not be read out. Accessible value/text interfaces must not expose the complete plaintext value for that reading. Initial focus, select-all, word/line traversal of existing content, and return from reveal need the same protection. Visual masking alone is insufficient. Feedback for newly typed characters and IME composition is assessed separately below.

These gates cannot be traded for native undo, simpler code, better IME behavior, or exact native-password fidelity. The existing explicit reveal feature remains a deliberate disclosure state; focus or ordinary editing must not silently act as reveal. Hiding the editor from assistive technology or preventing accessible editing is not an acceptable way to pass the third gate.

Record the browser, OS, password manager, assistive technology, versions, and tested settings. An unverified gate is unverified, not a best-effort pass. The current controller is subject to these requirements too.

## Required foundations and negotiable capabilities

The three gates define the product's distinctive requirements. Two ordinary quality requirements are also mandatory:

- **Basic operation and accessibility:** users can locate and understand the field, focus it, type, paste, select, replace, delete, understand errors, and complete the form using the supported keyboard, touch, and assistive-technology paths. The hidden state is visually concealed. Explicit reveal, if offered, remains operable and understandable.
- **Data integrity:** accepted input is preserved without unintended loss, duplication, normalization, or replacement. Supported validation, framework synchronization, reset, reveal, history, and submission operate on the correct actual value. Reject unsupported input explicitly instead of silently changing the secret.

The remaining capabilities can use different implementations or narrower, documented support:

| Capability                         | Acceptable compromise                                                                                                                                 | Boundary that still applies                                                                                                                                        |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Native password accessibility role | An ordinary text-field role is acceptable; explain purpose and hidden state and provide explicit actions where useful                                 | Basic operation and concealed current-value reading must pass; a descriptive label is not proof of protection                                                      |
| Password-specific commands         | No requirement to reproduce platform commands such as repeat/read password; an explicit accessible reveal/hide action can cover inspection            | Ordinary focus or reading must not reveal the secret without an explicit disclosure action                                                                         |
| IME suppression                    | Allow composition instead of disabling or switching the input method                                                                                  | Supported input must commit correctly and must not expose the stored concealed value through reading; lack of suppression is not a product failure                 |
| Immediate typing feedback          | Character echo, new-input feedback, and composition feedback need not reproduce native password behavior                                              | Record actual behavior separately; do not equate new-input feedback with rereading an existing secret or excuse replaying the stored value                         |
| Undo/redo                          | Controller history and explicit controls may replace native history; grouping, menus, gestures, and availability can differ                           | Available operations must restore correct values; a missing entry point must be documented. Adding buttons would require API work, not an assumed existing feature |
| Selection and mask details         | Word movement, double-click selection, mask count, and caret behavior need not match every native password implementation                             | Basic selection/replacement must remain usable and accepted Unicode strings must not be corrupted                                                                  |
| Clipboard operations               | Paste is foundational; concealed copy/cut/drag may be blocked, with copying available after explicit reveal or a clearly identified disclosure action | No silent export of the hidden secret or misleading substitution of bullets for copied content                                                                     |
| Forms and frameworks               | A component API, value bridge, and component-owned validation are acceptable; raw-input compatibility with every form library is unnecessary          | Supported submission and state transitions must use the actual value and correct validation results                                                                |
| DOM and architecture               | Plaintext may exist in DOM storage; input, textarea, custom hosts, wrappers, and frame-based approaches are implementation choices                    | Each complete implementation still has to pass the three gates and the foundations; visual masking alone does not establish this                                   |
| Styling and platform details       | Internal markup, layout constraints, system-menu integration, and exact native appearance may differ                                                  | Labels, focus visibility, errors, and basic interaction must remain usable                                                                                         |

Do not remove working capabilities merely because they are negotiable. A compromise needs a concrete benefit or a demonstrated conflict, and its effect on users must be recorded. Supported, Best effort, Unsupported, and Not tested in the comparison matrix describe individual observations, not an overall score. Native password semantics and IME suppression can be absent without failing the product; a failed or unverified gate cannot be offset by other features.

## Core experience

| User task                  | Expected outcome                                                                                                                                                                     | Implementation responsibility                                                                                                                        |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Understand what to enter   | A clear field purpose, description, and error relationship, such as "API key"; an understandable indication of whether content is hidden                                             | Core preserves native label, description, validation, and focus relationships; the application supplies specific wording and visibility descriptions |
| Enter or replace a secret  | Typing, paste, deletion, range replacement, and supported IME commits produce accurate results without loss, duplication, or silent rewriting                                        | Core maintains one authoritative value; unreliable browser paths must have a narrower, documented support scope                                      |
| Hide entered content       | In the stable hidden state, the page and presentation-value reading interfaces receive bullets; the component does not put the secret in names, descriptions, hints, or live regions | Core maintains the masked presentation; the application avoids copying the secret into other readable regions                                        |
| Inspect and verify content | Interfaces offering reveal have an operable, named button; toggling preserves the value and editing position, and revealed content is readable normally                              | Core provides revealed state; the application provides an explicit user action and synchronizes visible and accessible state                         |
| Avoid incorrect fills      | No unwanted filling or suggestion UI, and no unwanted writes accepted as application state                                                                                           | Verify both browser/extension behavior and the authoritative-value boundary; restoring a value does not excuse a failed gate                         |
| Complete a form            | Keyboard and assistive-technology users can reach the field, edit, understand errors, and submit the correct value                                                                   | Core preserves the native input surface and form behavior; application validation must use the actual secret rather than bullets                     |

Hiding is a presentation capability that reduces exposure, not a security boundary against same-origin JavaScript. Revealing makes plaintext available to the DOM, assistive technology, and normal copy operations, and should be an explicit application feature offered to users.

## Typing feedback expectations

The current text-input approach does not establish native protected-field semantics. Operating-system key echo, soft-keyboard exploration, and IME feedback therefore require actual assistive-technology tests. Distinguish immediate feedback about newly entered input from refocusing or reading the stored value. The latter must not disclose the concealed secret, including through word/line traversal or select-all reading.

The component should:

- Preserve ordinary text-input operability without hiding the field, changing focus, replacing its role, or disabling assistive technology to suppress speech.
- Avoid additional announcements of secrets and avoid implementing character-by-character speech through a live region.
- Name the field by its actual purpose and describe its hidden state. Descriptive text does not establish password-protection policies.
- Inform developers that ordinary text-field echo policies can differ from native password-field policies. Do not claim compliance with users' password-specific privacy settings.

Record character echo and composition feedback separately from current-value reading; do not infer speech behavior from an accessibility-role identifier or from bullets in `input.value`. Different new-input feedback is not automatically a failure or a promise of password-equivalent protection. Reading or replaying the stored concealed value remains a failure even when the browser or screen reader, rather than component code, produces it.

## Editing, mobile, and history

Basic editing should produce accurate results with understandable operations and usable focus and selection. Word movement, double-click selection, undo grouping, and restored selections need not match every platform exactly. Do not rebuild a complete editor to pursue that parity.

Retain the current controller's undo/redo history as an enhancement. Standard shortcuts and history requests actually dispatched by the browser can use it. Native browser menus, iOS system gestures, and system undo buttons are not guaranteed to work. Internal history does not mean users can access it on every device.

If undo/redo later becomes a product guarantee across devices, expose public history operations and queryable availability so applications can provide buttons accessible by touch, keyboard, and screen reader. Do not add temporary browser-edit transactions or deprecated commands solely to emulate native history; assess the editing benefit and autofill consequences first. This is a future API direction, not an existing public capability.

Basic mobile typing, paste, selection, deletion, and reveal are part of the core experience and should be tested on actual devices before claiming support. An unavailable system undo entry point does not make all mobile use unsupported; desktop testing also does not establish mobile support.

## IME boundaries

Disabling IME is one implementation strategy, not a product requirement or an inherently superior result. The comparison table may retain Disables IME as a reference capability, but its absence does not reduce acceptance if composition works correctly and the three gates pass. The current controller keeps composition drafts outside its committed value; another architecture may use a different internal editing model without changing the user-facing requirements.

Whenever composition is supported, its correctness is mandatory. Report whether IME remains available and whether editing works correctly as separate observations; do not mark a correct implementation deficient simply because it permits an input method.

Non-cancelable edits in some browsers can briefly place composition plaintext in the DOM. DOM plaintext is not prohibited by itself, but a transient value that exposes the complete concealed secret through accessibility or speech fails the gate; restoring bullets afterward does not excuse it. Corruption or an inability to complete input on a particular IME path is also a defect to fix or explicitly exclude from support.

## Acceptance testing

Test user tasks rather than counting replicated native password features.

1. Representative keyboard, touch, and screen-reader combinations can complete "find the field → type/paste → edit → understand errors → submit."
2. Accessible value/text inspection and real screen-reader tests cannot retrieve or read the complete concealed secret on initial load, focus, refocus, select-all, value rereading, edits, composition, or return from reveal. Labels, errors, and the editor remain usable.
3. Reveal controls are operable and understandable, and toggling preserves the secret and editing position.
4. A normal profile with a saved disposable login shows no unwanted filling or suggestion UI, including on neighboring fields. Separately verify that unexpected writes do not corrupt the authoritative value or submission.
5. Basic editing and IME commits do not lose, duplicate, or silently replace content.
6. Platform differences in typing echo, system menus, and gestures are recorded separately and assessed against this contract. A difference from native password behavior is not the sole failure criterion.

Choose coverage based on target users' platforms and record exact versions and unverified combinations. Source code and official documentation explain mechanisms but do not replace task-based acceptance testing. Claim acceptance only for combinations with evidence for all three gates; leave missing results unverified rather than weakening the requirements.

## Current tradeoffs and future work

For non-login configuration involving API keys, tokens, and signing keys, retain the current approach: one authoritative value, a native text-input surface, and bullet presentation. The existing Safari comparison reports password suggestions for CSS masking and none for the controller approach. This observed autofill difference supports retaining the current controller; DOM plaintext isolation is not the reason. New evidence may justify a simpler editing implementation. Do not expand it into a general editor to match every native password feature.

Acceptable differences include permitting IME with correct composition handling, controller history differing from native history, ordinary text-field accessibility semantics, and editing masked content by grapheme. Document each separately. A best-effort label does not excuse input corruption or remove the need to verify the three gates.

Future priorities:

1. Verify the three gates on target mobile, password-manager, and screen-reader combinations before claiming acceptance, then address other usability differences.
2. Keep integration examples for reveal, state descriptions, actual-value validation, and submission clear and usable.
3. Design public history operations and availability only when a real product needs undo on devices without shortcuts; do not add UI to every field by default.
4. Recheck documented autofill, suggestion, and IME behavior when browsers and extensions change. Avoid adding further heuristics without new evidence of failure.

This decision is specific to the current use case. An alternative that permits password suggestions or provides only visual concealment does not satisfy this product's contract, even if it is appropriate for another product.

## Research references

- [NVDA protected-character echo handling](https://github.com/nvaccess/nvda/blob/f62c980589d1ac30babf68ad48177e9ad29a2e84/source/speech/speech.py): Password semantics can affect typing feedback as well as reading the existing value.
- [NVDA Windows character-message hook](https://github.com/nvaccess/nvda/blob/f62c980589d1ac30babf68ad48177e9ad29a2e84/nvdaHelper/remote/typedCharacter.cpp): DOM editing is not the only source of feedback.
- [Orca typing-echo decisions](https://github.com/GNOME/orca/blob/1b348713a518ee6910d64e6369288b5acdecdcdf/src/orca/typing_echo_presenter.py): Password-specific feedback decisions also exist outside NVDA.
- [Official Google TalkBack documentation](https://support.google.com/accessibility/android/answer/6007100?hl=en-GB) and [historical password-speaking policy](https://github.com/google/talkback/blob/26a27dc009d5b3605e744222541f045a3c24e038/talkback/src/main/java/com/google/android/accessibility/talkback/speech/SpeakPasswordsManager.java): Native password fields may speak letters according to software policy and user settings.
- [Chromium password-field accessibility decisions](https://github.com/chromium/chromium/blob/47dc1e96033ee37770a3e26390983b42c6a7e67f/third_party/blink/renderer/modules/accessibility/ax_object.cc): A text field's name and description do not establish the protected mapping of a native password type.
