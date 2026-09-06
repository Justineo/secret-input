# Practical secret-input research

**Date:** September 6, 2026\
**Audience:** Secret Input maintainers\
**Question:** Which available mechanisms can improve concealed secret entry enough to justify implementation work?

## Decision

**Corrected speech evidence:** the maintainer clarified that VoiceOver reads actual
characters for both CSS variants in Safari. The earlier claim of concealed CSS
content reading in all four browsers was incorrect. Chrome, Edge, and Firefox were
reported to speak bullets; Secret Input's reported content reading remains
concealed. Keep the AX API observations separate from speech evidence; see the
[accessibility record](agents/accessibility.md#voiceover-observations-reported-on-september-6-2026).

Keep the existing input controller as the leading implementation. This round found a concrete opportunity in its edit reconciliation: after an accepted deletion, an unexpected native mutation can leave the value correct but move the caret. A bounded transaction prototype corrected two simulated cases without changing the editing host.

EditContext deserves a focused feasibility experiment if reducing composition interference becomes necessary. A working prototype with plaintext in its EditContext buffer and bullets in its DOM passed the sampled accessible-value checks in Chrome and Edge, including additional macOS accessibility reads in Chrome. This materially improves its evidence beyond the earlier conceptual proposal. It does not establish screen-reader speech behavior, unrestricted Unicode editing, or absence of credential UI.

Two seemingly simpler routes produced counterexamples: IMask's tested concealed configuration corrupted an emoji during deletion, and allowing a native composition draft behind a masking font exposed that entire draft through the accessibility value. Neither is a ready replacement.

This report extends the [architecture survey](autofill-alternatives-research.md). Its requirements remain no unwanted autofill, no credential suggestion UI, and no reading of the actual concealed content through assistive technology. Basic accessible editing and string integrity are mandatory. Native password roles, IME suppression, and native history menus are negotiable. The research changed documentation and local experimental fixtures, not production code.

**Implementation follow-up:** the controller now retains the expected selection for a canceled edit's existing short input opportunity and restores it for a matching unexpected native input. It also preserves selected text when a replacement contributes no characters after sanitization or length enforcement. See [reconciliation regressions](../tests/edit-reconciliation.test.ts) and [browser regressions](../tests/browser/edit-reconciliation.test.ts). The research findings below describe the pre-fix baseline; real mobile-keyboard confirmation remains outstanding.

## 1. Improve the existing input's edit transactions

Maintained input libraries provide useful reports of actual keyboard behavior. Maskito documents an Android Chrome/SwiftKey sequence in which cancelling a deletion's `beforeinput` does not prevent a subsequent native deletion and `input`. It also documents Gboard's double-space punctuation sequence and a different macOS sequence. These are first-party implementation reports, not measurements on a phone during this investigation. Sources: [cancelled-edit workaround](https://raw.githubusercontent.com/taiga-family/maskito/e9fff593b459174b6ec773353ad176bf652a0b3a/projects/core/src/lib/plugins/broken-prevent-default.plugin.ts), [double-space handling](https://raw.githubusercontent.com/taiga-family/maskito/e9fff593b459174b6ec773353ad176bf652a0b3a/projects/core/src/lib/plugins/double-space.plugin.ts).

I replayed the first event shape against the current controller in Chrome 152.0.7977.77. The harness deliberately simulated the extra DOM mutation; this is not a reproduction with SwiftKey itself.

| Starting state and action          | Current controller after the extra mutation and typing `X` | Bounded transaction prototype |
| ---------------------------------- | ---------------------------------------------------------- | ----------------------------- |
| `abcd`, caret at end; Backspace    | `abXc`                                                     | `abcX`                        |
| `abcd`, caret after `b`; Backspace | `Xacd`                                                     | `aXcd`                        |

In both baseline cases the secret survived the extra mutation correctly, but the caret moved one position too far. The next character therefore entered the wrong location. The prototype retained the expected value, presentation, and selection after the accepted edit, then restored the complete state for the matching unexpected input.

**Practical implication:** treat reconciliation as an edit transaction rather than just value restoration. Integrate any production remedy inside the controller's event handling. The experimental hook has no completed expiry, focus-change, pointer-selection, or unrelated-input policy; it should not be copied into production as a permanent global listener. Verify these boundaries and the real keyboard sequence before shipping.

A second synthetic replay also identified a useful validation interaction: at a three-character limit, `abc` rejects an initial space; replaying a later double-space deletion and punctuation insertion leaves `ab`. The actual keyboard may track the rejected first space differently. This warrants a device test, not a rule that blindly rewrites every `. ` insertion.

This direction preserves current styling, sizing, integration, and host behavior. Its incremental benefit is demonstrated in the simulated sequence, unlike switching the same bullet controller to a textarea.

## 2. EditContext: an actual promising mechanism, with clear limits

The prototype attached an EditContext to an accessible DOM textbox. The EditContext contained actual text; its visible and accessible DOM text contained bullets. It synchronized selection, processed text updates, and supplied basic composition geometry. This is distinct from the previously proposed variant that would put bullets into the EditContext buffer itself.

The [EditContext draft](https://www.w3.org/TR/edit-context/) separates input-service text updates from automatic DOM editing, while leaving substantial rendering, clipboard, history, and browser-UI work to the author. That separation is the potential benefit: the browser can update its composition buffer without overwriting the displayed text control. The prototype establishes part of that mechanism, not a finished editor.

### Observed editing and accessibility

Chrome 152.0.7977.77 and Edge 152.0.4191.66 both produced the expected values for typing, replacing a selection, and Backspace: `orbit7` → `orbit7X` → `oYit7X` → `oit7X`. These used WebDriver keyboard actions. A separate Chromium DevTools composition sequence inserted draft `ni` over a range and committed `你`; both the current controller and EditContext produced `o你it7`. These composition operations exercised the browser engine, not an actual OS input method.

| Accessible-value observation                                             | Plain input | CSS-masked input             | Current controller | EditContext with bullet DOM |
| ------------------------------------------------------------------------ | ----------- | ---------------------------- | ------------------ | --------------------------- |
| Chrome/Edge DevTools accessibility value, sampled editing/refocus states | Actual text | Actual text                  | Bullets            | Bullets                     |
| Chrome macOS `AXValue`, after leaving/refocusing and selecting all       | Actual text | Actual text                  | Bullets            | Bullets                     |
| Chrome macOS selected text and parameterized text-range reads            | Actual text | Range reads returned bullets | Bullets            | Bullets                     |

The macOS inspection included `AXSelectedText`, `AXStringForRange`, and `AXAttributedStringForRange` on the lab controls. The CSS control is a useful negative control: a masked text-range result did not imply a concealed `AXValue`. Checking only one accessibility interface would have missed the disclosure.

The EditContext buffer temporarily contained `oniit7` during composition while the sampled accessible value remained bullets. Empty-field and replace-all composition probes likewise retained bullet accessibility values when the buffer contained the complete `quasar9` draft. This is evidence that plaintext in this input-service buffer did not automatically become accessible textbox content in these samples.

**Remaining gates:** no new saved-credential or suggestion-UI tests were conducted for this prototype; there was no VoiceOver speech session, real mobile keyboard, or test of every accessible command and transient state. The prototype used a simple UTF-16 bullet mapping, not a grapheme-safe editor, and omitted complete clipboard, history, form, and validation integration. Current [compatibility data](https://web-platform-dx.github.io/web-features-explorer/features/edit-context/) also limits its usefulness as a universal backend.

**Decision:** investigate EditContext ahead of another host-only bullet editor if composition problems justify the work. First test the missing gates and real input-method behavior; only then invest in its broader editor responsibilities. Do not introduce a multi-backend production architecture based solely on these successful samples.

## 3. Can an existing library replace the custom controller?

IMask 7.6.1 has a relevant feature: `displayChar` can put bullets in the real input while retaining separate actual text. Its [input controller](https://github.com/uNmAnNeR/imaskjs/blob/efdb8756442476290ccba93f812452821d8707da/packages/imask/src/controls/input.ts#L221) writes the display value, and its [pattern input definition](https://github.com/uNmAnNeR/imaskjs/blob/efdb8756442476290ccba93f812452821d8707da/packages/imask/src/masked/pattern/input-definition.ts#L98) generates that display. This is a relevant existing implementation, not just a visual CSS mask.

However, a browser counterexample failed the project's string-integrity requirement. With an indefinitely repeated `*` block and `displayChar: '•'`, initial `a💩b` displayed four bullets. Placing the caret before the last bullet and pressing Backspace produced `a\ud83db`, containing an unpaired surrogate. The same operation on the current controller displayed three bullets and produced `ab`, preserving a well-formed string. I verified both the model behavior and an actual WebDriver Backspace in Chrome. The library's [mask iteration](https://github.com/uNmAnNeR/imaskjs/blob/efdb8756442476290ccba93f812452821d8707da/packages/imask/src/masked/base.ts#L312) supports the diagnosis of UTF-16-unit handling in this configuration.

This does not claim that every IMask configuration corrupts strings. It establishes that this plausible concealed-input configuration cannot replace the controller unchanged. Repairing grapheme mapping and verifying the project's autofill, suggestion, accessibility, composition, and history requirements would remain our work.

Inputmask also has relevant `displayChar` work, but its pinned [changelog](https://github.com/RobinHerbots/Inputmask/blob/03baaf7670bc715d0998b1d6dc0b4305fb1ee450/Changelog.md) places that work under the unreleased 5.1 line. Its [event handlers](https://github.com/RobinHerbots/Inputmask/blob/03baaf7670bc715d0998b1d6dc0b4305fb1ee450/lib/eventhandlers.js#L732) include a `removeMaskOnSubmit` path that temporarily writes the actual value back into the control. That option is another boundary to inspect, not evidence of concealed-value acceptance.

**Decision:** borrow documented keyboard cases and individual techniques. No inspected package demonstrated enough replacement coverage to justify adopting it as the secret-input engine.

## 4. Let the browser compose plaintext temporarily, then remask

A hybrid could keep committed content as JS-managed bullets, permit a native composition draft in the input, conceal the draft with a font, and remask on commit. Its attraction is practical: fewer DOM rewrites during composition could reduce interference with the native editor.

I implemented this bounded experiment using the [text-security font](https://github.com/noppa/text-security), explicitly without CSS text-security. In Chrome the font loaded successfully, and the inspected screenshot showed seven dots for `quasar9`. During both empty-field and replace-all composition, however, `input.value` and the accessibility value exposed `quasar9`. On commit the experiment restored bullets and retained the correct actual value.

This is whole-draft readability during composition, not a measurement of immediate typing echo. The experiment therefore does not solve the concealed-content reading requirement. Keeping the old committed secret separately prevents one form of exposure but does not conceal the entire new draft from a current-content request.

The comparison is informative: the EditContext prototype kept its accessible DOM masked during the same engine composition probes. A different input model may provide an advantage that merely changing paint or remasking later does not.

## 5. Is a small native browser switch being overlooked?

The source review found internal mechanisms, but no reviewed public same-document switch that combines native protected text with a general opt-out from password management.

WebKit can treat a text input as secure when it is password-typed **or** `autofilledAndObscured`. However, the latter is exposed only to an `allowAutofill` world, whose permission defaults to false. Ordinary page code cannot activate the native behavior by assigning a similarly named property. Sources pinned to September 6 development code: [secure predicate](https://github.com/WebKit/WebKit/blob/6270255c36bd2919ef0eea13368231f488df509b/Source/WebCore/html/HTMLInputElement.h#L149), [restricted IDL](https://github.com/WebKit/WebKit/blob/6270255c36bd2919ef0eea13368231f488df509b/Source/WebCore/html/HTMLInputElement.idl#L112), [world permission](https://github.com/WebKit/WebKit/blob/6270255c36bd2919ef0eea13368231f488df509b/Source/WebCore/bindings/js/DOMWrapperWorld.h#L110).

Changing a password field's ARIA role is not a supported separation either. WebKit's [secure-field classification and accessible text implementation](https://github.com/WebKit/WebKit/blob/6270255c36bd2919ef0eea13368231f488df509b/Source/WebCore/accessibility/AccessibilityNodeObject.cpp#L1159) provides a source-level warning: an explicit recognized ARIA role can bypass secure classification. This was not reproduced in a current Safari speech session and must not be presented as a verified shipped-browser exploit or a viable workaround.

Form rearrangement supplies no reliable boundary. Chromium's [parser](https://github.com/chromium/chromium/blob/fb13d81be5125d0f845515455b229da97b4c760b/components/password_manager/core/browser/form_parsing/form_data_parser.cc#L269) handles a single password candidate. Gecko's [password-field collection](https://github.com/mozilla-firefox/firefox/blob/156018d359c66937b49d1794a8414f11c2f28cfd/toolkit/components/passwordmgr/LoginManagerChild.sys.mjs#L835) uses `hasBeenTypePassword`; briefly changing the type back to text does not erase that history. Its browser-controlled `notPasswordSelector` recipes are potentially useful for site-specific browser fixes, not a component API.

## Technical-space coverage and priorities

| Mechanism family                                                  | Practical disposition                                                                                                                                                      |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Native types, autocomplete hints, form topology, ARIA changes     | No reviewed public combination meets all gates; source review removes several plausible shortcuts.                                                                         |
| Paint: CSS, fonts, overlays; including composition-only plaintext | Painting does not by itself conceal accessible content; new hybrid experiment exposed the draft.                                                                           |
| JS-managed model on input, textarea, or contenteditable           | Keep input; transaction reconciliation has a concrete improvement target. Another host needs an input-specific benefit.                                                    |
| EditContext and custom rendering                                  | Real separation demonstrated in bounded probes; first verify missing gates and IME behavior.                                                                               |
| Existing masking libraries                                        | Relevant ideas and regressions; no verified drop-in replacement. IMask configuration failed Unicode deletion.                                                              |
| Shadow DOM, ordinary frames, custom elements, restricted frames   | Previous survey covers boundaries. Credentialless/sandbox restrictions remain distinct but carry integration and coverage costs; no new reason to make them the main path. |
| Reveal/replace, paste/import, external secret selection           | Can simplify particular workflows; changes the product interaction and does not independently solve concealed editing.                                                     |
| Browser cooperation or a controlled native host                   | Can change browser-level policy, but sits outside an ordinary reusable web component's authority.                                                                          |

The next implementation investment should be the existing input's complete edit-state reconciliation, preceded by real-device confirmation of the relevant sequence. The next architectural investigation should be the EditContext gate tests if composition remains costly. These choices preserve a concrete reason for every experiment.

The research stops here because the mechanism families have either primary-source support, an observed counterexample, or a named unresolved gate. Further broad searching is less likely to change the decision than testing those gates on the target devices. No candidate, including the current controller, gained universal acceptance from this investigation.
