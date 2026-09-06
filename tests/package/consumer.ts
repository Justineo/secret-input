import { createElement } from "react";
import { SecretInput } from "secret-input/react";
createElement(SecretInput, {
  value: "",
  onChange: (value: string) => {
    void value;
  },
});
createElement(SecretInput, { defaultValue: "", customValidity: "Server error" });
// @ts-expect-error Controlled and uncontrolled values cannot be combined.
createElement(SecretInput, { value: "", defaultValue: "", onChange: () => {} });
createElement(SecretInput, { value: "", readOnly: true });
createElement(SecretInput, { value: "", disabled: true });

// @ts-expect-error onChange receives a value, not a DOM event.
createElement(SecretInput, { value: "", onChange: (_event: Event) => {} });

createElement(SecretInput, { revealed: true });
createElement(SecretInput, { pattern: "[A-Z]+", minLength: 3, maxLength: 8, required: true });
// @ts-expect-error The component owns its text-input type.
createElement(SecretInput, { type: "password" });
// @ts-expect-error The visibility API is revealed, defaulting to false.
createElement(SecretInput, { redacted: false });

import { SecretInput as VueSecretInput } from "secret-input/vue";
// @ts-expect-error Vue does not declare a configurable type prop.
const vueProps: InstanceType<typeof VueSecretInput>["$props"] = { type: "password" };
void vueProps;

import { createSecretInput } from "secret-input";
import type { SecretInputController, SecretInputOptions } from "secret-input";
const element = document.createElement("input");
const options: SecretInputOptions = { value: "AB", pattern: "[A-Z]+", minLength: 2 };
const controller: SecretInputController = createSecretInput(element, options);
controller.update({
  value: "ABC",
  defaultValue: "",
  pattern: undefined,
  maxLength: 8,
  required: true,
});
controller.input.focus();
controller.update({ customValidity: "Server error" });
controller.update({ customValidity: undefined });
controller.input.reportValidity();
// @ts-expect-error Application validity is a message, not a validation callback.
controller.update({ customValidity: () => "Error" });
// @ts-expect-error Application validity is a message, not a validity flag.
createElement(SecretInput, { customValidity: false });
const actual: string = controller.value;
void actual;
// @ts-expect-error Controller state is changed through update, not property assignment.
controller.value = "next";
// @ts-expect-error A controller is distinct from the native input.
const input: HTMLInputElement = controller;
void input;
// @ts-expect-error Native inputs have no secret-state extension.
element.secretValue = "next";
// @ts-expect-error DOM settings stay on the native input.
controller.update({ disabled: true });
