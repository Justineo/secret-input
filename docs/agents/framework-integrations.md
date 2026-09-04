# React and Vue integrations

Framework integrations call `mask()` on a real input and reuse the same controller. They must not duplicate masking or editing behavior. The package publishes them from `@justineo/secret-input/react` and `@justineo/secret-input/vue`; the root entry has no framework dependency.

The React 19 component renders one native input and gives callers that node through `ref`. Its `value`, `defaultValue`, and `redacted` props synchronize controller state. Accepting the current controlled value preserves controller history. `onValueChange` reports the actual value after explicit edits; `onInput` remains the native event whose target contains presentation state. Do not add React's `onChange` prop or pass the actual value through the native `value` prop, because either would falsely imply that `event.currentTarget.value` is authoritative.

The Vue adapter is an SFC written with `<script setup>`. It implements `modelValue` / `update:modelValue`, plus `defaultValue` and `redacted`; accepting the current model value preserves controller history. It renders one native input and forwards undeclared attributes and listeners; declared `type` and `value` props are consumed rather than forwarded because those remain controller-owned presentation details. Native `input` and `change` are re-emitted from listeners installed after `mask()`, so rejected browser mutations cannot reach Vue callbacks first.

Both adapters preserve native name-based form participation, attributes, events, classes, and styles. React and Vue remain optional peers. Keep the Symbol-keyed three-property `SecretInputState` contract, native events, and `mask()` stable; add adapter API only when it provides concrete framework value.

Vite+ packages the SFC through tsdown and `unplugin-vue`. Run `vpr check` so the normal Vite+ checks and `vue-tsc --noEmit` both execute. The pinned `typescript-native-bridge` package preserves the TypeScript API required by Vue tooling while running the TypeScript 7 tsgo checker. Keep its exact version and the pnpm workspace `typescript` override aligned; this is a development-tool dependency, not part of the published runtime.
