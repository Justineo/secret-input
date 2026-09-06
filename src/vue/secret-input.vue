<script setup lang="ts">
import { nextTick, shallowRef, watch } from "vue";

import { createSecretInput, redact } from "../secret-input.ts";
import type { SecretInputController, SecretInputOptions } from "../secret-input.ts";
import type { ValidationMessages } from "../validation.ts";
import { passwordManagerAttributes } from "../password-manager.ts";

defineOptions({
  inheritAttrs: false,
  name: "SecretInput",
});

const props = defineProps<{
  revealed?: boolean;
  pattern?: string;
  minlength?: number | string;
  maxlength?: number | string;
  required?: boolean;
  readonly?: boolean;
  customValidity?: string | undefined;
  validationMessages?: ValidationMessages | undefined;
  value?: never;
  defaultValue?: never;
}>();

const model = defineModel<string>();
const emit = defineEmits<{
  change: [event: Event];
  input: [event: InputEvent];
}>();
const initialPresentation = redact(model.value ?? "");
const controller = shallowRef<SecretInputController>();

defineExpose({
  get input() {
    return controller.value?.input;
  },
});

function getOptions(): SecretInputOptions {
  return {
    value: model.value ?? "",
    defaultValue: model.value ?? "",
    revealed: props.revealed,
    pattern: props.pattern,
    minLength: props.minlength === undefined ? undefined : Number(props.minlength),
    maxLength: props.maxlength === undefined ? undefined : Number(props.maxlength),
    required: props.required,
    customValidity: props.customValidity,
    validationMessages: props.validationMessages && { ...props.validationMessages },
  };
}

function sync(): void {
  controller.value?.update(getOptions());
}

function setInput(element: unknown): void {
  controller.value?.input.removeEventListener("change", handleChange);
  controller.value?.input.removeEventListener("input", handleInput);
  if (!(element instanceof HTMLInputElement)) {
    controller.value = undefined;
    return;
  }

  controller.value = createSecretInput(element, getOptions());
  element.readOnly = props.readonly;
  sync();
  element.addEventListener("change", handleChange);
  element.addEventListener("input", handleInput);
}

function handleChange(event: Event): void {
  emit("change", event);
}

function handleInput(event: InputEvent): void {
  if (!controller.value) {
    return;
  }

  model.value = controller.value.value;
  emit("input", event);
  void nextTick(sync);
}

watch(getOptions, sync, { flush: "post" });
</script>

<template>
  <input
    :ref="setInput"
    autocapitalize="off"
    autocorrect="off"
    spellcheck="false"
    v-bind="{ ...$attrs, ...passwordManagerAttributes }"
    :readonly="!controller || props.readonly"
    :required="props.required"
    :value.attr="initialPresentation"
    type="text"
    autocomplete="off"
  />
</template>
