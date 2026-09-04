<script setup lang="ts">
import { nextTick, watch } from "vue";

import { mask, redact, secretInput } from "../secret-input.ts";
import type { SecretInput } from "../secret-input.ts";

defineOptions({
  inheritAttrs: false,
  name: "SecretInput",
});

const props = withDefaults(
  defineProps<{
    defaultValue?: string;
    modelValue?: string;
    redacted?: boolean;
    type?: string;
    value?: string;
  }>(),
  { redacted: true },
);

const emit = defineEmits<{
  change: [event: Event];
  input: [event: InputEvent];
  "update:modelValue": [value: string];
}>();
const initialPresentation = redact(props.modelValue ?? props.defaultValue ?? "");

let input: SecretInput | undefined;

function sync(): void {
  const state = input?.[secretInput];
  if (!state) {
    return;
  }
  if (props.modelValue !== undefined) {
    state.value = props.modelValue;
  }
  if (props.defaultValue !== undefined) {
    state.defaultValue = props.defaultValue;
  }
  state.redacted = props.redacted;
}

function setInput(element: unknown): void {
  input?.removeEventListener("change", handleChange);
  input?.removeEventListener("input", handleInput);
  if (!(element instanceof HTMLInputElement)) {
    input = undefined;
    return;
  }

  const value = props.modelValue ?? props.defaultValue ?? "";
  input = mask(element, {
    defaultValue: props.defaultValue ?? value,
    redacted: props.redacted,
    value,
  });
  input.addEventListener("change", handleChange);
  input.addEventListener("input", handleInput);
}

function handleChange(event: Event): void {
  emit("change", event);
}

function handleInput(event: InputEvent): void {
  const state = input?.[secretInput];
  if (!state) {
    return;
  }

  emit("update:modelValue", state.value);
  emit("input", event);
  void nextTick(sync);
}

watch(() => [props.defaultValue, props.modelValue, props.redacted], sync, { flush: "post" });
</script>

<template>
  <input
    :ref="setInput"
    autocapitalize="off"
    autocorrect="off"
    spellcheck="false"
    v-bind="$attrs"
    :value="initialPresentation"
    type="text"
    autocomplete="off"
    data-1p-ignore
    data-bwignore="true"
    data-form-type="other"
    data-lpignore="true"
    data-protonpass-ignore="true"
  />
</template>
