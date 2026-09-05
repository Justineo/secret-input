# Secret Input

- `mask(input)` returns the same native input with `secretValue`, `defaultSecretValue`, and `redacted` accessors.
- Keep the authoritative value in `input.secretValue`; `input.value` is presentation only.
- `input.value` contains bullets while redacted and plaintext only after an explicit `redacted = false`.
- Browser DOM/autofill mutations never implicitly become secret state.
- Apply standard and known vendor ignore attributes to deter native and third-party autofill.
- Preserve Unicode strings exactly. Use graphemes only for masked editing; keep native UTF-16 length semantics.
- SSR emits the same grapheme-length bullets as hydration, never a temporary password input or plaintext.
- Do not use CSS-based masking in the library; keep it comparison-only. Document that revealed state exposes plaintext through DOM and accessibility APIs.
- Preserve native styling, accessibility, focus, selection, and form behavior where possible.
- Keep the controller framework-independent; React and Vue adapters reuse it.
- Prefer strict, explicit TypeScript, minimal abstractions, and observable-behavior tests in unit tests and real target browsers.
- Read `docs/agents/` for architecture, accessibility, platform, input-method, integration, and test details.
