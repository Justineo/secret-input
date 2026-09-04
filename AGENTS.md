# Secret Input

- `mask(input)` returns the same native input; its stable state is exposed only at the exported `secretInput` Symbol.
- Keep the authoritative value in `input[secretInput].value`; `redacted` defaults to `true`.
- `input.value` contains bullets while redacted and plaintext only after an explicit `redacted = false`.
- Browser DOM/autofill mutations never implicitly become secret state.
- Do not use CSS-based masking in the library; keep it comparison-only. Document that revealed state exposes plaintext through DOM and accessibility APIs.
- Preserve native styling, accessibility, focus, selection, and form behavior where possible.
- Keep the controller framework-independent; React and Vue adapters reuse it.
- Prefer strict, explicit TypeScript, minimal abstractions, and observable-behavior tests.
- Read `docs/agents/` for architecture, accessibility, platform, input-method, integration, and test details.
