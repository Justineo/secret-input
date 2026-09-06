# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and releases follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

### Changed

- Replaced the element-augmentation API with `createSecretInput(input, options)`, returning an explicit controller with read-only state and synchronous `update()` patches. Values, reveal state, reset defaults, and validation rules share this update path.
- Removed validation attribute migration, attribute observers, and the `setCustomValidity()` override. Core calls the native method to preserve messages, invalid styling, and submission blocking. React and Vue pass rule props directly to the controller and expose plain native input refs.

- Keep composition drafts out of both hidden and revealed presentation, restoring the committed value and replacement range until confirmation.

- Replaced `redacted` with `revealed`, defaulting to `false`, across the core and framework adapters. Removed the Vue `type` prop; both components own their fixed text-input surface.

- Simplified undo/redo to explicit before/after transactions, preserving original selections and final carets across traversal and reveal changes. Selected edits start a new group while allowing continued typing or deletion to join it.

- Changed React to immediate `onChange(value: string)` with explicit controlled `value` and uncontrolled `defaultValue` modes. The callback receives the actual secret directly; `onInput` remains a standard React event observer. Removed the confirmation-time React callback.
- Rebuilt Vue with `defineModel<string>()`, using only `modelValue` / `update:modelValue` for values. Removed Vue `defaultValue`; native `input` / `change` observers now receive only the event. Component refs expose the native `input`.

### Fixed

- Keep application errors in a `customValidity` option/prop across core updates, edits, reset, and unrelated React/Vue renders. Clearing it exposes any remaining rule error. Cache derived validation and compare UTF-16 lengths directly, using a fixed non-secret probe for localized format messages.

- Preserve pending edit metadata through native-event microtask checkpoints. Accept interrupted composition confirmation at its original selection without duplicate edits or stale draft presentation.

- Published Vue declarations through the public `vue` peer and added strict package-consumer type checks.

- Kept React controlled values and Vue models synchronized across native form reset; parent state owns model resets.

- Preserved Enter confirmation and implicit form submission, updating change-driven validity before submission and avoiding duplicate change events on a later blur.
- Kept Vue attribute updates from rewriting the initial presentation and losing the user's selection.

- Wait for native reset-button dispatch to finish before restoring secrets, so later cancellation preserves the value and history and the browser cannot clear the restored presentation.

- Isolated history from IME drafts and pending native edits, restored masks for empty-stack requests, and preserved redo across no-op edits and controlled synchronization.
- Suppressed blur-time change events when undo returns to the focus/reset value.

- Corrected caret placement when edits join adjacent Unicode graphemes and preserved selection direction across reveal changes.
- Prevented canceled, stale, mismatched, and data-less input events from overwriting secret state, including events dispatched inside callbacks.
- Preserved composition replacement ranges during unchanged controlled-value synchronization and discarded drafts on reset or disabled/readonly commit.
- Restored actual-value submission and reset for detached, shadow-root, and same-origin iframe forms.

### Performance

- Reused authoritative grapheme segmentation across selection and rendering and initialized React's SSR presentation lazily.

## 0.1.0 - 2026-09-04

### Added

- Framework-independent `mask()` controller for native text inputs with Symbol-keyed secret state.
- Bullet presentation, explicit reveal state, Unicode-aware editing, IME buffering, and secret-state undo and redo.
- Native form participation, reset behavior, and actual-value `FormData` submission.
- Browser and third-party password-manager opt-out hints, with unexpected DOM writes kept out of secret state.
- React 19 and Vue 3 adapters with SSR-safe output.
- Interactive comparison page for native and masked approaches.
- Unit and browser coverage for Chrome, Edge, Firefox, and Safari, enforced before deployment and release.
