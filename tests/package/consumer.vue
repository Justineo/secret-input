<script setup lang="ts">
import { ref } from "vue";
import { SecretInput } from "secret-input/vue";
const value = ref("");
const pattern = ref("[A-Z]+");
const minimum = ref(3);
const error = ref<string>();
const field = ref<InstanceType<typeof SecretInput>>();
function focus() {
  field.value?.input?.focus();
}
</script>
<template>
  <SecretInput
    v-model="value"
    ref="field"
    name="token"
    :pattern="pattern"
    :minlength="minimum"
    :maxlength="8"
    :custom-validity="error"
    required
  />
  <button @click="focus">Focus</button>
</template>
