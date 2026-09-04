# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and releases follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

## 0.1.0 - 2026-09-04

### Added

- Framework-independent `mask()` controller for native text inputs with Symbol-keyed secret state.
- Bullet presentation, explicit reveal state, Unicode-aware editing, IME buffering, and secret-state undo and redo.
- Native form participation, reset behavior, and actual-value `FormData` submission.
- Browser and third-party password-manager opt-out hints, with unexpected DOM writes kept out of secret state.
- React 19 and Vue 3 adapters with SSR-safe output.
- Interactive comparison page for native and masked approaches.
- Unit and browser coverage for Chrome, Edge, Firefox, and Safari, enforced before deployment and release.
