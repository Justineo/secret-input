# Alternatives for non-login secret entry

**Research date:** September 6, 2026\
**Audience:** Secret Input maintainers\
**Decision:** Which additional architectures deserve prototypes beyond the existing input controller and single-line textarea experiment?

## Decision

**Corrected VoiceOver evidence:** the maintainer clarified that both CSS variants
read actual characters in Safari. The earlier claim of concealed CSS content reading
in all four browsers was incorrect. Chrome, Edge, and Firefox were reported to speak
bullets. Secret Input's reported content reading remains concealed, with an
Safari typing-announcement discrepancy, now reproduced in system speech synthesis
with multi-bullet strings; see the [investigation](voiceover-typing-investigation.md). Accessible-value plaintext
observations remain separate API evidence. The public matrix marks both Safari CSS
variants Unsupported for hiding the actual value from assistive technology and
identifies VoiceOver as the tested assistive technology in a small note.

**Reassessed against the latest September 6 capability tiers:** retain the existing JS bullet controller as the leading implementation, subject to completing gate verification. Native password semantics, IME suppression, and native history entry points no longer count as mandatory advantages. A candidate with more native features cannot offset autofill, unwanted suggestion UI, inaccessible basic editing, corrupted data, or disclosure of the concealed stored value.

**Do not pursue a JS bullet textarea without a concrete input-specific failure.** The current JS bullet input already avoids credential UI in the recorded observations. Changing its host to textarea supplies no demonstrated additional benefit, retains the same custom secret-editing/history responsibilities, and adds single-line adaptation work. The earlier recommendation to prioritize this experiment is withdrawn.

The subsequent [practical research and browser probes](practical-secret-input-research.md) identify edit-transaction reconciliation as a concrete improvement to the current input and establish bounded EditContext accessibility evidence. Consult that report for the current experiment priority and limitations.

Native password inputs in restricted frame contexts remain a structurally different research path. Their potential benefit is native editing plus browser-enforced filling restrictions; native password roles alone are no longer sufficient reason to pay their integration cost. Credentialless is currently a Chromium-specific candidate. Neither that mechanism nor opaque-origin sandboxing has established all three gates across the target platforms.

No reviewed alternative is a verified cross-browser replacement. The conclusions below distinguish recorded results, source-supported mechanisms, and proposed architectures. This reassessment changed research documentation, not production code or the public comparison matrix.

### Comparison against the actual acceptance dimensions

G1 means no unwanted autofill; G2 means no credential suggestion UI; G3 means concealed stored-value reading does not expose the actual secret. “Unverified” cannot be counted as a pass. Existing browser observations below come from the [comparison data](../src/comparison.ts) and the [textarea experiment record](textarea-experiment.md); they are limited to those observations, not universal platform guarantees.

| Architecture                                  | G1: autofill                                                                   | G2: suggestions                                                  | G3: concealed-value reading                                                                                | Basic operation, integrity, and compromises                                                       | Decision                                                |
| --------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Native password + `autocomplete=off`          | Recorded failure in Chrome/Edge/Firefox                                        | Recorded failure in all four browsers                            | Native protection mechanism; full speech flows still need verification                                     | Best native editing baseline, low integration cost                                                | Ineligible as tested                                    |
| Native password + `new-password`              | No automatic fill in recorded observations                                     | Recorded password/generation suggestions                         | Same native protection mechanism                                                                           | Native editing, but requests an unwanted kind of assistance                                       | Ineligible as tested                                    |
| Text input + CSS masking                      | No automatic fill in recorded observations                                     | Recorded Safari failure                                          | Safari VoiceOver reads actual characters; accessible-value plaintext observed                              | Native editing does not repair either failed gate                                                 | Ineligible as a complete solution                       |
| Plaintext textarea + CSS masking              | No automatic fill; maintainer confirms parity with input + CSS                 | No UI in all four browsers; Safari is the additional coverage    | Safari VoiceOver reads actual characters; Safari AX plaintext remains exposed                              | Native typing history verified; single-line adaptation still necessary                            | Fails concealed-value accessibility in Safari           |
| Plaintext input/textarea + masking font       | Unverified                                                                     | Unverified                                                       | No mechanism to conceal accessible plaintext                                                               | Native editing possible; font fallback and Unicode risks                                          | Diagnostic research only unless G3 is separately solved |
| Existing JS bullet input                      | No automatic fill in recorded observations                                     | No suggestions in recorded observations                          | Sampled Chrome/Edge and Chrome macOS AX reads masked; VoiceOver current-content reading reported concealed | Most existing component integration; custom editing/history need platform checks                  | Leading implementation, provisional acceptance          |
| JS bullet textarea                            | Unverified; host-change hypothesis only                                        | Unverified                                                       | Same proposed mask mechanism; speech and transient exposure unverified                                     | Reuses controller concepts; adds newline/Enter/selection adaptation; native history not recovered | Do not pursue: no demonstrated incremental benefit      |
| JS bullet contenteditable                     | Unverified                                                                     | Unverified                                                       | Can expose bullets rather than plaintext; unverified in practice                                           | More work for selection, focus, mobile input, forms, and history                                  | Reserve if native hosts show a specific blocker         |
| Native password in credentialless frame       | Chromium source-supported restriction; product flow unverified                 | Native driver restrictions are promising; complete UI unverified | Native protection mechanism; actual flows unverified                                                       | Native editor, substantial frame bridge; no Safari/Firefox coverage                               | Distinct research candidate, not a general fallback     |
| Native password in opaque-origin sandbox      | Relevant Chromium filling guard; other engines and shipped coverage unverified | Unverified                                                       | Native protection mechanism; actual flows unverified                                                       | Frame bridge and opaque-origin messaging; native editing potential                                | Secondary context experiment                            |
| EditContext/custom editor                     | Unverified                                                                     | Unverified                                                       | Plaintext-buffer/bullet-DOM prototype masked sampled AX reads; speech unverified                           | Largest editor responsibilities; limited platform availability                                    | Focused gate experiment; see practical report           |
| Concealed summary + explicit plaintext editor | Unverified while editing                                                       | Unverified while editing                                         | Stored summary can conceal; active editor deliberately reveals                                             | Changes interaction and removes concealed editing if used alone                                   | Optional reveal workflow, not a replacement             |

The two foundations are not optional columns to average into a score. A new host must preserve accepted strings and accessible basic operation before convenience and implementation cost can decide between candidates. Likewise, the existing comparison's broad accessibility “Supported” cells do not establish the complete refocus/readback speech requirement.

## Scope and requirements

The goal is to prevent unrelated login credentials from replacing API keys, tokens, and other configuration secrets, to eliminate unwanted credential suggestions, and to prevent complete concealed-value disclosure through assistive technology. Plaintext in a DOM value is permitted only when it does not cause the prohibited accessibility exposure. Useful editing, validation, form submission, and accessibility capabilities matter; exact native-input equivalence is not required.

Evaluate these outcomes separately:

| Outcome                       | What must be observed                                                                                   |
| ----------------------------- | ------------------------------------------------------------------------------------------------------- |
| Automatic fill                | Whether stored credentials appear without an explicit fill action, including in neighboring fields      |
| Suggestions                   | Focus menus, password-generation offers, mobile keyboard accessories, and extension overlays            |
| Accepted value                | Whether unwanted browser or extension writes become the value submitted by the component                |
| Editing                       | Selection, undo/redo, IME, paste, deletion, horizontal scrolling, and submission                        |
| Concealment and accessibility | Visual masking, accessible value rereading, typing echo, and secure-field semantics as separate results |

The current controller has an explicit authoritative-value boundary. A native-value candidate does not inherit that boundary merely because it paints bullets. Likewise, permitting DOM plaintext does not automatically waive the project's separate expectation that concealed value rereading exposes masks. See the existing [behavior expectations](behavior-expectations.md) and [accessibility boundary](agents/accessibility.md).

## Additional possibilities exposed by the revised priorities

### A. Rejected priority: JS bullet textarea

A JS bullet textarea could keep the secret in a controller and put bullets into `textarea.value`. That is technically possible, but the existing JS bullet input already uses this concealment mechanism and has favorable recorded autofill/suggestion observations. No input-specific failure was identified that the textarea variant would fix.

The maintainer subsequently confirmed that textarea + CSS avoids Safari's autofill UI. Safari is its incremental browser coverage over input text + CSS, which already avoided that UI in the recorded Chrome, Edge, and Firefox observations. The separate Safari plaintext API observation remains; the corrected VoiceOver report also says actual characters are read out.

The earlier plaintext-plus-CSS textarea experiment had a distinct rationale: retain native actual-value editing while investigating whether a different host avoids the password UI observed with CSS-masked input. Replacing that real textarea value with JS-managed bullets removes the native-editing advantage. It leaves the application responsible for secret-value range mapping and history, just as with the existing input, and adds textarea-specific newline, Enter, and single-line presentation work. The plaintext experiment's API exposure and corrected Safari VoiceOver speech failure are separate findings, both relevant to the accessibility gate.

Chromium's [`FormFieldData::IsTextInputElement()`](https://github.com/chromium/chromium/blob/7f5b078934b4388cf51dbd8fe2da39453a56348f/components/autofill/core/common/form_field_data.cc#L286) excludes textarea. This describes an implementation distinction; it does not establish an improvement over a JS bullet input or justify a prototype by itself. Lack of complete acceptance testing for the current input is a reason to complete that testing, not evidence that another host is better.

**Decision:** Remove JS bullet textarea from the proposed experiment sequence. Reconsider only if a reproducible input-specific problem and evidence of a textarea remedy emerge. More generally, a new host must address a concrete gap or recover a useful capability before its implementation cost is justified.

### B. Keep the model, use a bullet contenteditable host

A contenteditable element can contain bullets while JS holds the secret. This differs from the plaintext-plus-font option below: the accessible text itself is intended to be concealed. Native password roles are not necessary under the revised requirements, so this is eligible for investigation in principle.

However, changing host supplies no documented no-autofill contract. It also introduces DOM selection/range mapping, editing-host focus, accessible naming, mobile selection, and form bridging. The author must preserve basic editing and concealment through composition and browser-generated mutations. Use this only to address a demonstrated input/textarea limitation; there is no current evidence of a benefit sufficient to justify its larger editor surface.

### C. Treat EditContext as a masked presentation buffer

**Subsequent evidence:** the [practical prototype](practical-secret-input-research.md#2-editcontext-an-actual-promising-mechanism-with-clear-limits) tested the simpler plaintext EditContext buffer with a bullet DOM and found masked accessible values in the sampled Chrome/Edge and Chrome macOS interfaces. Actual speech, credential UI, platform coverage, and full editing remain unverified. The masked-buffer variant below is an untested alternative, not a prerequisite established by this research.

The earlier proposal put plaintext in EditContext and painted bullets. A different research design could retain the actual secret only in the application model, keep already-committed text masked in EditContext, and translate incoming text updates into edits. This would investigate whether the input-service buffer can follow the same stored-value boundary as the existing controller.

It is not a solved design: composition ranges, transient new text, reconversion, selection, accessibility, and update timing must remain coherent. The [current EditContext draft](https://www.w3.org/TR/edit-context/) models interaction with OS text services; it does not establish a protected-password mode. A repository [design document](https://raw.githubusercontent.com/w3c/edit-context/gh-pages/dev-design.md) mentions a password input mode, but that API shape is absent from both the current draft and the pinned [Chromium IDL](https://github.com/chromium/chromium/blob/7f5b078934b4388cf51dbd8fe2da39453a56348f/third_party/blink/renderer/core/editing/ime/edit_context.idl). Do not treat the design-document enum as an available privacy switch.

This variant is now conceptually eligible because custom history and non-native roles are acceptable. Its compatibility and editing cost keep it below completing current-controller verification and investigating restricted native password contexts.

### D. Compose verified backends behind the component contract

The component API need not require the same internal element on every platform. A future implementation could use a restricted-frame password editor where verified and a JS masked editor elsewhere. This is an architectural option, not a recommendation to add browser branching now.

Each backend must independently pass the same gates and foundations. API feature detection cannot detect the absence of password-manager UI, and an ordinary iframe is not a safe substitute for unsupported credentialless behavior. Shared validation, values, reset, reveal, and errors would also need parity at the component boundary. Adopt multiple backends only when measured improvements justify their ongoing testing and maintenance costs.

### Why a small accessibility patch does not rescue visual-only masking

[`aria-valuetext`](https://www.w3.org/TR/wai-aria-1.2/#aria-valuetext) describes the human-readable alternative for a range widget's numeric value. It is not a standardized replacement for an editable textbox's current text. An accessible name or hidden-state description identifies the control; it does not redact its editable content. No general ARIA-only repair for a plaintext CSS/font editor was established by the sources reviewed.

Hiding a focused plaintext editor with `aria-hidden`, or redirecting assistive-technology users to a non-editable summary, does not satisfy basic operation. A genuinely operable second masked editor would be a separate controller architecture with synchronization and focus obligations, losing much of the proposed simplicity. Temporarily switching to plaintext on focus similarly makes ordinary focus an implicit reveal and is incompatible with the agreement.

The [Permissions Policy feature registry](https://raw.githubusercontent.com/w3c/webappsec-permissions-policy/main/features.md) also supplies no general autofill/password-suggestion opt-out feature. Adding an invented `allow` token is not a substitute for the specific credentialless or sandbox behavior under investigation.

## 1. Change the painting mechanism: font-only masking

The [text-security font project](https://github.com/noppa/text-security) provides fonts that map text to disc, circle, or square glyphs. A native `input[type=text]` could retain its real value and browser editing operations while a font supplies the concealed appearance. Its README demonstrates the mechanism, but does not establish today's autofill behavior in our target browsers.

**The decisive experimental detail is to omit `-webkit-text-security`.** The project's example combines the font with that property; copying the example would confound the comparison. Chromium's current [`LayoutText::SecureText()`](https://github.com/chromium/chromium/blob/7f5b078934b4388cf51dbd8fe2da39453a56348f/third_party/blink/renderer/core/layout/layout_text.cc#L922) records a CSS custom-password classification when processing non-empty masked text. This is evidence that the rendering property can have effects beyond its pixels. It does **not** prove that this flag drives Safari's password UI or Chromium's credential parser.

The hypothesis is that font-only rendering might preserve concealed entry without taking that CSS-specific path. It could recover single-line behavior, native history, and IME handling without the textarea's newline adapter. Autofill reduction remains unverified: a password manager can still inspect input type, labels, names, context, and values.

The main unresolved issues are concrete:

- **Unicode and caret geometry.** OpenType [cmap format 13](https://learn.microsoft.com/en-us/typography/opentype/spec/cmap#format-13-many-to-one-range-mappings) maps character-code ranges to glyphs; it does not promise one glyph per grapheme. Test combining marks, emoji sequences, variation selectors, RTL text, default-ignorable characters, and unpaired surrogates without changing the source string.
- **Font compatibility.** The project's [stylesheet template](https://raw.githubusercontent.com/noppa/text-security/master/src/style-template.css) routes Safari to compatibility fonts using older CSS feature detection. Do not treat the compact font or that detection logic as validated on current Safari.
- **Rendering failure.** Delayed, blocked, or failed font loading could expose ordinary text if the fallback is readable. An implementation needs an explicit concealed loading/failure state; `readonly` alone does not conceal an existing value.
- **Editing and accessibility.** The project's [caret issue](https://github.com/noppa/text-security/issues/17) and [screen-reader issue](https://github.com/noppa/text-security/issues/11) are historical reports worth reproducing, not proof of current behavior everywhere. Font masking does not change the underlying accessible text value into bullets or create a secure text-field role.

**Eligibility:** Font-only masking is not sufficient for this product because it does not conceal the accessible value. A host/painting experiment can still explain browser heuristics, but is diagnostic research rather than a proposed replacement. Do not prioritize it for production without a separately verified solution to the accessibility gate.

## 2. Change the context: credentialless iframe with a real password input

The WICG [credentialless iframe draft](https://wicg.github.io/anonymous-iframe/#spec-autofill) explicitly addresses password management. Its explainer recommends making browser autofill/password managers unavailable in credentialless frames. The draft's specific autofill requirement is narrower: disable filling features when their data is both user-specific and website-specific. It is not a universal promise that every suggestion menu or extension will disappear.

There is corresponding implementation evidence, not just a proposal:

- Chromium's [`ContentPasswordManagerDriver::IsRenderFrameHostSupported()`](https://github.com/chromium/chromium/blob/7f5b078934b4388cf51dbd8fe2da39453a56348f/components/password_manager/content/browser/content_password_manager_driver.cc#L140) rejects committed credentialless frames. Related binding and navigation paths use this check. A pending-commit exception means initial navigation timing should be part of the experiment.
- [`ChromePasswordManagerClient::BindPasswordGenerationDriver()`](https://github.com/chromium/chromium/blob/7f5b078934b4388cf51dbd8fe2da39453a56348f/chrome/browser/password_manager/chrome_password_manager_client.cc#L256) also returns for credentialless frames.

This suggests a different component: retain an ordinary password editor inside a small embedded document and bridge its value and lifecycle to the parent. Native password masking and native password semantics remain available within that document. The benefit of avoiding credential UI in the complete product flow still needs observation.

**Compatibility limits:** [Chrome shipped the feature in version 110](https://developer.chrome.com/blog/iframe-credentialless/). Current [browser compatibility source data](https://raw.githubusercontent.com/mdn/browser-compat-data/main/html/elements/iframe.json) records no Firefox or Safari support. A local API probe independently confirmed support in Chrome 152 and Edge 152, and absence in Firefox 155. Ordinary iframe fallback is not equivalent. The similarly named `COEP: credentialless` response header is a different mechanism.

**Integration costs:** the editor is in another document. Plan an explicit bridge for focus, parent validation, form value, reset, disabled state, sizing, and theme. The parent form does not automatically own a child-frame input. Labels and errors must also work within the embedded document. Credentialless storage is temporary, so use a self-contained editor rather than depending on the surrounding authenticated application session. These are architectural consequences, not measured defects in a prototype. Use an editor controlled by the application; credentialless is not a confidentiality boundary for text deliberately entered into it.

**Priority:** First experiment within the context-based family. Justify it by a demonstrated improvement in the gates or usable editing, not by native password semantics alone. Treat it as a Chromium candidate, with extension and mobile UI behavior still unknown.

## 3. Related context experiment: an opaque-origin sandbox

A sandboxed iframe without `allow-same-origin` is another candidate. Chromium's [June 24, 2026 change](https://chromium.googlesource.com/codesearch/chromium/src/+/94f0fa3e71959adb800b79bbc5b93efbc9faa3cd) specifically prevents credential filling in same-site sandboxed frames with opaque origins. The current client contains the corresponding origin check behind `kPasswordBlockOpaqueOrigins`.

This is meaningful evidence for a filling restriction. It does not establish equivalent Safari/Firefox behavior, shipped feature-flag coverage everywhere, or the absence of suggestions. The widespread availability of the sandbox attribute must not be confused with a cross-browser password-manager contract.

An experiment could use a small `sandbox="allow-scripts"` editor and a message bridge. Do not add `allow-same-origin` merely to simplify integration: that changes the condition being tested. Use a bound message channel or validate the sending window and message shape; an opaque origin cannot be authenticated by a normal origin string alone.

**Priority:** Secondary context experiment. Measure separately from credentialless so that the cause of any improvement remains identifiable.

## 4. Change the editing host: plaintext-only contenteditable

[`contenteditable="plaintext-only"`](https://web.dev/blog/contenteditable-plaintext-only-baseline) became available across the major engines in March 2025. It offers a native pure-text editing surface on a regular element without rich-text formatting. A font-only version would separate both the host and painting mechanism from password-like form controls.

Changing the host may help investigate credential heuristics, but a plaintext editing host with only visual masking does not meet the accessibility gate. The standard does not promise that an editing host is exempt from autofill or extension inspection. Plaintext-only also does not mean single-line.

Compared with a textarea, the component must supply more of its own contract: accessible naming and role, value extraction, constraints, reset, submission, and newline behavior. Native editing should be left intact where possible; rewriting `textContent` after each input would undermine the reason to choose this architecture. The [Input Events draft](https://www.w3.org/TR/input-events-2/) exposes editing operations and ranges for contenteditable, but also documents composition and platform-dependent editing behavior.

**Eligibility:** Not a complete candidate with visual masking alone. Further work must demonstrate both an autofill advantage and concealed, operable accessibility before its integration costs are justified.

## 5. Change the input model: EditContext or a custom-drawn editor

The [EditContext API](https://www.w3.org/TR/edit-context/) provides text and selection updates from operating-system input services independently of automatic DOM editing. An editor could keep actual text in its input model and render a concealed view.

However, the current draft explicitly leaves undo, clipboard/drag-and-drop, and browser-UI-dependent operations to the author. Rendering, offset mapping, selection synchronization, and IME geometry also need implementation. This is a substantial editing architecture, not a shortcut to native undo. A canvas version adds further selection and caret work, as the [Chrome introduction](https://developer.chrome.com/blog/introducing-editcontext-api) explains.

The [compatibility overview](https://web-platform-dx.github.io/web-features-explorer/features/edit-context/) reports limited availability. Our local probe found EditContext in Chrome/Edge 152 and not Firefox 155; Safari support is not established by that local test.

**Updated priority:** A focused gate experiment, supported by the [subsequent practical probes](practical-secret-input-research.md#2-editcontext-an-actual-promising-mechanism-with-clear-limits). Sampled accessible-value reads stayed masked with a plaintext EditContext buffer, including during engine-driven composition. This does not establish actual screen-reader speech or the autofill/suggestion gates. Its substantial editing responsibilities are justified only if those gates and useful input-method behavior can be verified.

## 6. Change the interaction instead of imitating a password field

These are product-design alternatives, not browser guarantees:

**Concealed summary plus explicit edit.** Show a non-editable concealed summary at rest. An explicit “Edit secret” or “Replace secret” action opens an ordinary, unmasked text editor, with clear confirmation and cancellation. This removes the need to conceal the active editor and retains native editing. Ordinary text fields can still be classified as credential fields, so saved-credential testing remains necessary. The tradeoff is visible text during an intentional edit.

**Import-first entry.** Offer paste/import as an explicit action and display a concealed result, with a manual editing fallback. Machine-generated tokens often do not need character-by-character entry. Clipboard reading has its own permission and activation requirements under the [Clipboard API](https://www.w3.org/TR/clipboard-apis/); it should never be an automatic background read. This approach cannot replace general text editing when that capability is required.

**Eligibility:** Explicit plaintext editing belongs to reveal mode and is not a concealed-entry fallback. An import workflow may be considered if the imported result is not exposed through accessible values or speech. Neither may silently relax a gate or remove accessible operation.

## 7. Supporting techniques and paths to deprioritize

| Direction                                                    | Evidence and decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vendor ignore attributes                                     | Useful cooperation signals on any candidate. [1Password](https://www.1password.dev/web/compatible-website-design) documents field and whole-page ignore attributes for offers to save/fill; [Dashlane](https://support.dashlane.com/hc/en-us/articles/4420122792594-Optimize-your-web-forms-for-Dashlane-autofill) documents `data-form-type="other"` for autofill. These are vendor-specific contracts with different scopes, not one universal opt-out.                                                         |
| Closed Shadow DOM                                            | Not a reliable extension barrier. [Bitwarden's architecture](https://contributing.bitwarden.com/architecture/deep-dives/autofill/shadow-dom/) explicitly traverses closed roots through privileged Chrome/Firefox APIs. Its Safari fallback differs; that is not a browser-level guarantee.                                                                                                                                                                                                                       |
| Form-associated custom elements                              | Useful for bridging a custom editor to a form. The [HTML standard](https://html.spec.whatwg.org/dev/custom-elements.html) explicitly permits `formStateRestoreCallback(state, "autocomplete")`. A component can choose how to process that callback, but FACE does not make inner native editors immune to filling or suggestions.                                                                                                                                                                                |
| Ordinary cross-origin iframe                                 | Not equivalent to credentialless. [Bitwarden's iframe documentation](https://bitwarden.com/help/auto-fill-browser/#autofill-in-iframes) distinguishes blocked automatic filling from manual filling that can proceed after a warning.                                                                                                                                                                                                                                                                             |
| `type=search`, `tel`, `url`, etc.                            | These are not structural escapes from Chromium's text-input class: [`FormFieldData::IsTextInputElement()`](https://github.com/chromium/chromium/blob/7f5b078934b4388cf51dbd8fe2da39453a56348f/components/autofill/core/common/form_field_data.cc#L286) includes them. This does not mean all types receive identical heuristics, but a type change alone is weak evidence. Some types also constrain values or alter keyboard/selection behavior.                                                                 |
| Fake autocomplete tokens, `new-password`, or `one-time-code` | The [HTML autocomplete model](https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#autofilling-form-controls:-the-autocomplete-attribute) provides hints, including `off`, but no standardized API-key token in its current token set. Apple's [HTML AutoFill guidance](https://developer.apple.com/documentation/security/enabling-password-autofill-on-an-html-input-element) uses new-password and one-time-code to request their respective assistance. They do not mean “no suggestions.” |
| Readonly-until-focus, random names, dummy login fields       | These target heuristics or scan timing, rather than an explicit durable contract. Retain readonly for initialization correctness, but do not call it an autofill solution. Dummy credential fields can redirect the very fill behavior the product wants to avoid.                                                                                                                                                                                                                                                |
| Hide a native autofill button with CSS                       | Hiding one visual affordance does not establish that filling, keyboard suggestions, or extension UI have stopped. Evaluate the underlying outcomes, not a screenshot alone.                                                                                                                                                                                                                                                                                                                                       |
| Transparent editor plus a separate bullet overlay            | A visual overlay does not conceal the underlying editor's accessible value. It also adds caret, selection, bidi, scrolling, and mobile geometry work. No validated prototype was found that satisfies the clarified accessibility gate and those obligations.                                                                                                                                                                                                                                                     |

The standardized-looking `input-security` property is not a new general-purpose escape. The current [CSS Forms draft](https://drafts.csswg.org/css-forms-1/#input-security) applies it to sensitive inputs such as HTML password controls, with `auto` and `none` values. It also records an intention to move the reveal behavior into the browser/HTML interaction model. It does not provide a standard way to turn any textarea into a non-login secure field.

## 8. A value guard is a separate design problem

Even an editor that rarely attracts autofill may receive unsolicited writes. Font-only input and native textarea use real DOM values; adopting every `input` event would accept such writes unless another policy exists.

There is no reliable cross-browser provenance test based only on `event.isTrusted` or `inputType` in the sources reviewed. The [DOM standard](https://dom.spec.whatwg.org/#dom-event-istrusted) defines trusted events by user-agent dispatch, not by proof of typing intent. The open [Firefox issue on non-cancelable autofill](https://bugzilla.mozilla.org/show_bug.cgi?id=1673558) and [WebKit issue on missing beforeinput](https://bugs.webkit.org/show_bug.cgi?id=217692) document why a universal cancel-before-write strategy cannot be assumed. These are issue records, not new measurements of every current browser.

A native editing experiment should therefore report both suggestion behavior and whether unwanted writes are accepted. If preserving an authoritative application value remains mandatory, specify how edits are committed and evaluate the effect of that policy on native undo and IME. A draft/commit interaction can make changes explicit, but does not itself identify autofill correctly.

## 9. Gate verification precedes mechanism comparisons

First verify the current controller's accessible value/text APIs and actual screen-reader speech, alongside normal-profile saved-credential autofill and suggestion behavior. Include initial values, refocus, select-all, word/line reading, editing, composition, and return from reveal. Passing requires both concealed value reading and an operable editor; hiding the editor from assistive technology is not a solution.

Investigate native password controls in credentialless and opaque-origin sandbox contexts as the distinct architectural experiment. Do not add a JS textarea comparison without evidence of an input-specific problem it can solve. A context's filling guard does not establish the absence of all suggestions or complete accessibility behavior. A candidate must pass all three gates before editing convenience influences selection.

### Painting and host experiment

This is now an optional diagnostic experiment, not the first production-candidate experiment. Visual-only candidates remain ineligible without a separate accessibility solution.

Keep identical labels, surrounding fields, saved-login state, and vendor hints within each run:

| Host              | CSS text-security only       | Masking font only |
| ----------------- | ---------------------------- | ----------------- |
| Native text input | Existing positive comparison | New candidate A   |
| Native textarea   | Existing mobile prototype    | New candidate B   |

Test the no-vendor-hint condition first to identify the browser mechanism, then add identical supported hints to measure the combined product behavior. A later contenteditable row is warranted only if it answers a remaining host-specific question.

### Context experiment

Use the same native password control in the top-level page, a normal iframe, a credentialless iframe, and an opaque-origin sandbox iframe. The top-level and normal-frame controls establish whether the saved credential and UI are available at all. Do not combine credentialless and sandbox in the first run.

### Observe complete user flows

1. Save a disposable same-site login in a normal browser profile. Verify the positive control actually offers it.
2. Test initial loading, delayed mounting, focus on the secret and neighboring fields, typing, clearing, reload, and reveal/hide transitions.
3. Record automatic fill, saved-password suggestions, generation, manual fill, and save/update prompts separately. Repeat with extensions individually and on actual iOS/Android keyboards.
4. Exercise native undo/redo, real IME, selection replacement, single/multiline paste, Unicode, validation, reset, and submitted values.
5. For fonts, add loading failure and glyph/caret checks. For frames, add keyboard traversal, accessible labels/errors, parent submission, and frame reload behavior.

Do not infer a missing save prompt from an automated profile. Chromium's [client code](https://github.com/chromium/chromium/blob/7f5b078934b4388cf51dbd8fe2da39453a56348f/chrome/browser/password_manager/chrome_password_manager_client.cc#L278) explicitly suppresses password-saving UI under `--enable-automation`. API and editing probes are useful, but they do not establish saved-credential UX.

## Verification and remaining uncertainty

Research combined browser and vendor source inspection, current standards/drafts, first-party compatibility data, and the repository's existing experiment records. Broad discovery covered masking, native and custom editing hosts, form/context boundaries, opt-out hints, and event provenance. Follow-up focused on disconfirming the strongest candidates and separating proposed behavior from implemented behavior.

A fresh-profile API probe on the local site returned:

| Browser              | `iframe.credentialless` | `EditContext` | CSS `input-security: auto` | CSS `-webkit-text-security: disc` |
| -------------------- | ----------------------- | ------------- | -------------------------- | --------------------------------- |
| Chrome 152.0.7977.77 | Present                 | Present       | Unsupported                | Supported                         |
| Edge 152.0.4191.66   | Present                 | Present       | Unsupported                | Supported                         |
| Firefox 155.0        | Absent                  | Absent        | Unsupported                | Supported                         |

These results establish API exposure/CSS parsing only. They do not verify rendering correctness, password UI, or real OS input. No new Safari or mobile experiment was run during this research. The prior [textarea report](textarea-experiment.md) remains the source of that candidate's desktop evidence and explicit mobile gaps.

Chromium source was pinned to commit `7f5b078934b4388cf51dbd8fe2da39453a56348f`; it is development-source evidence, not a claim that each installed release has identical behavior. Living standards, compatibility datasets, and vendor documentation were accessed on September 6, 2026. Historical project issues are labeled as such.

Research stopped after the main decision-changing claims had primary support or an explicit evidence gap. Following the latest capability agreement, the recommendation is **verify the current controller first; investigate native password controls in restricted frames as the distinct alternative; avoid host substitutions without a demonstrated benefit**. Font-only and CSS-only plaintext editors are not complete solutions to this contract. No candidate may be accepted by trading a failed gate for better editing behavior.

The latest reassessment also checked ARIA value semantics, EditContext's current API versus a repository design document, the Permissions Policy feature registry, and the current comparison's evidence boundaries. It added architectural hypotheses, not new saved-credential, screen-reader, or mobile results. Further literature search is unlikely to decide between the leading candidates: refocus/readback speech and normal-profile password-manager tests are the next decisive evidence.
