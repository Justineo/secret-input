# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and releases follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

### Changed

- Simplified undo/redo to explicit before/after transactions, preserving original selections and final carets across traversal and reveal changes. Selected edits start a new group while allowing continued typing or deletion to join it.

- Replaced the Symbol-keyed state namespace with `secretValue`, `defaultSecretValue`, and `redacted` input properties.
- Unified React and Vue adapters around immediate `input(value, event)` and blur-time `change(value, event)` callbacks.

### Fixed

- Isolated history from IME drafts and pending native edits, restored masks for empty-stack requests, and preserved redo across no-op edits and controlled synchronization.
- Suppressed blur-time change events when undo returns to the focus/reset value.

- Corrected caret placement when edits join adjacent Unicode graphemes and preserved selection direction across reveal changes.
- Prevented canceled, stale, mismatched, and data-less input events from overwriting secret state, including events dispatched inside callbacks.
- Preserved composition drafts during unchanged controlled-value synchronization and discarded drafts on reset or disabled/readonly commit.
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
