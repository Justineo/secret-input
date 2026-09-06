# Secret Input

- Write all design documentation in English.
- The product goal is to avoid unwanted browser autofill and password suggestions for non-login secrets. Removing plaintext from DOM value is not a product goal or security boundary.
- Cover useful input capabilities through the component contract; do not pursue drop-in native-input or arbitrary form-library compatibility.
- `createSecretInput(input, options)` returns an explicit controller with read-only state and synchronous `update(options)` patches. Do not add secret-state properties to native inputs.
- Keep the authoritative value in `controller.value`; `input.value` is presentation only. Validation rules belong to controller options, not DOM attributes or observers.
- Own application errors through `customValidity` options/props until explicitly cleared, including across edits and reset. Core is the sole native `setCustomValidity()` writer; never override it or emulate native validity flags.
- `input.value` contains bullets while redacted and plaintext only after an explicit `revealed = true`.
- Browser DOM/autofill mutations never implicitly become secret state.
- Apply standard and known vendor ignore attributes to deter native and third-party autofill.
- Use explicit English defaults for length errors. validationMessages maps valueMissing/patternMismatch/tooShort/tooLong to strings or synchronous formatters; empty/undefined results and formatter exceptions preserve default errors. Cache native checks, but reevaluate formatters on synchronization. Use the detached input for native patterns and required default wording requested by a formatter.
- Preserve Unicode strings exactly. Use graphemes only for masked editing; keep native UTF-16 length semantics.
- SSR emits a text input with initial bullets and readonly until its controller attaches. Restore the author's readonly state after attachment; a failed JS load must leave the pending field uneditable.
- Retain the current bullet controller because the existing Safari comparison reports password suggestions with CSS masking. Evaluate future masking choices by autofill and editing behavior, not DOM plaintext isolation.
- Preserve native styling, accessibility, focus, selection, and form behavior where possible.
- Keep the controller framework-independent; React and Vue adapters reuse it.
- Prefer strict, explicit TypeScript, minimal abstractions, and observable-behavior tests in unit tests and real target browsers.
- Read `docs/agents/` for architecture, accessibility, platform, input-method, integration, and test details.
