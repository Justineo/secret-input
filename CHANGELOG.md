# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and releases follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 0.1.0 - 2026-09-07

### Added

- Framework-independent `createSecretInput(input, options)` for non-login secrets, returning an explicit controller with read-only state and synchronous `update()` patches.
- Bullet presentation by default, explicit `revealed` state, and browser and password-manager opt-out hints. Unexpected DOM writes do not become secret state.
- Unicode-aware editing and selection, buffered IME composition, and secret-state undo/redo with preserved selections.
- Native form participation with actual-value `FormData` submission, reset defaults, Enter confirmation, and implicit submission.
- Validation against the actual value using `required`, `pattern`, and UTF-16 length rules. `customValidity` preserves application errors until cleared; `validationMessages` supports strings and synchronous formatters with defaults when formatting fails.
- React 19 support with controlled `value` / `onChange(value)` and uncontrolled `defaultValue` modes, plus a native input ref.
- Vue 3.5.13+ support with `v-model` and an exposed native input ref. Controlled React values and Vue models remain owned by the parent across native form reset.
- SSR-safe React and Vue output with initial bullets and a readonly guard until the controller attaches.
- An interactive comparison page for browser autofill, password suggestions, masking, and editing behavior.
- Unit tests, strict package-consumer type checks including the minimum supported Vue version, and browser coverage for Chrome, Edge, Firefox, and Safari.
