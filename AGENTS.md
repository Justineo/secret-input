# Secret Input

- Write all design documentation in English.
- `createSecretInput(input, options)` returns an explicit controller with read-only state and synchronous `update(options)` patches. Do not add secret-state properties to native inputs.
- Keep the authoritative value in `controller.value`; `input.value` is presentation only. Validation rules belong to controller options, not DOM attributes or observers.
- Own application errors through `customValidity` options/props until explicitly cleared, including across edits and reset. Core is the sole native `setCustomValidity()` writer; never override it or emulate native validity flags.
- `input.value` contains bullets while redacted and plaintext only after an explicit `revealed = true`.
- Browser DOM/autofill mutations never implicitly become secret state.
- Apply standard and known vendor ignore attributes to deter native and third-party autofill.
- Preserve Unicode strings exactly. Use graphemes only for masked editing; keep native UTF-16 length semantics.
- SSR emits the same grapheme-length bullets as hydration, never a temporary password input or plaintext.
- Do not use CSS-based masking in the library; keep it comparison-only. Document that revealed state exposes plaintext through DOM and accessibility APIs.
- Preserve native styling, accessibility, focus, selection, and form behavior where possible.
- Keep the controller framework-independent; React and Vue adapters reuse it.
- Prefer strict, explicit TypeScript, minimal abstractions, and observable-behavior tests in unit tests and real target browsers.
- Read `docs/agents/` for architecture, accessibility, platform, input-method, integration, and test details.
