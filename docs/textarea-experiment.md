# Single-line textarea experiment

The comparison page now includes **Textarea + CSS** between the CSS-masked input and
Secret Input. It tests whether changing the native element avoids unwanted password
suggestions while retaining native value, editing history, and form submission. The
package controller and React/Vue adapters are unchanged.

## Prototype behavior

- `textarea.value` contains the actual text. CSS `-webkit-text-security: disc` masks
  painting after a support check; unsupported browsers leave the field read-only.
- One visible row, wrapping disabled, resizing disabled, and horizontal caret scrolling.
- Cancelable line-break edits and multiline paste/drop are rejected. Rejection leaves
  the selection and native history intact; it does not remove line breaks and insert
  a modified value. Ordinary single-line editing uses the browser's default behavior.
- Plain Enter requests submission of this comparison form, subject to native validation.
  The textarea requests a Go key on mobile keyboards. Cancelable line-break `beforeinput`
  also requests submission when a software keyboard sends no preceding `keydown`.
  Modified Enter does not submit. Composition confirmation is left to the browser.
  Successful test submission displays a confirmation; the comparison page sends no data.
- The comparison page cancels navigation for every candidate. All comparison fields
  omit `name` to preserve the existing autofill experiment conditions. Separate submission
  fixtures assign names and use actual native HTTP submissions.
- Copying exports the real text. This experiment does not implement the controller's
  redacted clipboard policy or reject browser-written values.

This is a bounded prototype, not a replacement public component. Non-cancelable edits,
programmatically assigned newlines, composition commit ordering, mobile keyboards,
and single-line paste normalization remain open implementation questions. The adapter
does not rewrite values after input, so it does not claim to guarantee the absence of
newlines from every possible mutation. No native password/IME priming is applied.

## Verification on September 6, 2026

Chrome 152.0.7977.77, Edge 152.0.4191.62, and Firefox 155 each passed the initial six browser
tests in `tests/browser/textarea-experiment.test.ts`:

- CSS masking is active while selection replacement, Unicode form values, and reset work.
- Native typing undo/redo works with the platform's keyboard shortcuts.
- Enter uses native required validation and submission without inserting a newline.
- Simulated composition confirmation does not trigger submission. This is not an OS IME test.
- Synthetic multiline paste/drop are rejected without changing selection or losing undo.
- Cancelable line-break events are blocked; long text scrolls horizontally within one row.

A separate local HTTP receiver verified five native submission paths in each browser:
GET, URL-encoded POST, multipart POST, `requestSubmit(button)`, and `form.submit()`.
All 15 requests delivered `Sëcret+&=🔐` unchanged alongside an ordinary same-name input,
preserving entry order and submitter inclusion. No `formdata` replacement, client-side
serialization, or fetch-based submission was used.

Safari WebDriver could not create a session because **Allow remote automation** is
disabled. The subsequent desktop accessibility checks below cover a limited set of Safari behaviors.
Automated WebDriver profiles have no saved credentials, so the Chrome, Edge, and Firefox
autofill and password-suggestion results remain untested.

## Manual autofill comparison

1. Open the local comparison site in the target browser, with password-manager extensions
   disabled for this test. Save a disposable login through the existing setup step.
2. Compare CSS masking, Textarea + CSS, and Secret Input. Observe automatic values before
   focus, then focus both the Webhook URL and Signing secret fields in each case.
3. In Safari, check whether the textarea's mask triggers the password picker either on the
   secret or its neighboring URL field. Repeat empty, after typing, and after clearing.
4. Exercise real IME confirmation, single-line paste, rejected multiline paste, undo/redo,
   and long text. Check assistive-technology reading separately from visual masking.
5. Record browser version, automatic-fill behavior, and focus-triggered UI separately.
   Revisit a saved setup to check the initial comparison-loading path as well.

Successful saved-credential tests, particularly Safari's focus-triggered password UI,
are the decision point for considering a controller migration. The existing input's
CSS-mask results do not establish the textarea's behavior.

## Safari desktop accessibility follow-up

Safari 26.4 was operated through macOS System Events using native accessibility actions
and keyboard input, without enabling WebDriver remote automation or injecting page scripts.
A disposable login (`textarea-cua-20260906`) was entered through the setup form, and Safari's
**Save Password** sheet was accepted. That test credential remains saved in Safari.

Observed results:

- The CSS-masked **input** exposes a native `password AutoFill` button on focus. This
  serves as the positive control for detecting Safari's native autofill affordance.
- The **textarea** and its neighboring Webhook URL field had empty values before focus,
  including after reloading with the saved credential. No automatic fill was observed.
- Neither textarea-case field exposed a native `password AutoFill` control during the
  focus checks. The textarea was also checked after typing, clearing, and reloading.
  Every recorded focus observation verified `AXFocused=true`; an initial offscreen click
  did not focus the textarea and was excluded from the results.
- The accessibility interface returned the exact disposable text typed into the textarea.
  It reports `AXTextArea` / `text entry area` with no secure subrole. The native password
  input reports `secure text field` / `AXSecureTextField`. Thus Safari's textarea candidate
  does not hide its actual value from accessibility clients or provide the native secure
  text-field semantics. This is an API observation, not a full VoiceOver speech test.
- Command-Z removed the typed value and Command-Shift-Z restored it exactly.

Both display and window capture failed in this environment. These checks establish the
native accessibility observations above, but do not provide screenshot confirmation of
all visible popup UI. The matrix therefore leaves Safari's **Avoids autofill UI** result
Not tested with the partial evidence in its detail. Real OS IME behavior, actual VoiceOver
speech, and the remaining Safari editing cases are still pending.

## Mobile testing version

The mobile candidate is available in the same five-way comparison; no package API has been
replaced. After saving a disposable login, scroll to **Textarea + CSS**. Check automatic values
before focus, focus both fields, then type, paste, select, undo, clear, and use the software
keyboard's Go/Return action. The page acknowledges submission without sending the test value.
Repeat with the CSS input and Secret Input for comparison. Record the device, OS/browser version,
and whether any password suggestions appear; the desktop matrix does not establish mobile support.

A seventh browser regression covers software-keyboard-shaped `beforeinput` submission without
`keydown`, native required validation, the visible confirmation, and composition exclusion.
Actual iOS and Android keyboard behavior remains subject to device testing.

The Safari CI runner did not translate WebdriverIO's `Ctrl` alias into the native macOS
shortcut for these textarea tests. The regression uses explicit `Command` on macOS and
`Control` elsewhere, matching the successful desktop accessibility check. This changes
the test driver input, not the prototype's editing implementation.
