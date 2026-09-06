import { createElement, useCallback, useLayoutEffect, useRef, useState } from "react";
import type { ComponentPropsWithoutRef, InputEvent, Ref } from "react";

import { createSecretInput, redact } from "./secret-input.ts";
import type { SecretInputController } from "./secret-input.ts";
import type { ValidationMessages } from "./validation.ts";
import { passwordManagerAttributes } from "./password-manager.ts";

type ValueProps =
  | { value: string; defaultValue?: never }
  | { value?: never; defaultValue?: string };

export type SecretInputProps = Omit<
  ComponentPropsWithoutRef<"input">,
  "children" | "defaultValue" | "onChange" | "onChangeCapture" | "type" | "value"
> &
  ValueProps & {
    onChange?: (value: string) => void;
    revealed?: boolean;
    customValidity?: string | undefined;
    validationMessages?: ValidationMessages | undefined;
    ref?: Ref<HTMLInputElement>;
  };

export function SecretInput({
  customValidity,
  defaultValue,
  minLength,
  maxLength,
  validationMessages,
  required,
  onChange,
  onInput,
  pattern,
  revealed = false,
  ref,
  value,
  ...props
}: SecretInputProps) {
  const [initial] = useState(() => {
    const initialValue = value ?? defaultValue ?? "";
    return {
      controlled: value !== undefined,
      options: {
        value: initialValue,
        revealed,
        minLength,
        maxLength,
        validationMessages,
        pattern,
        required,
        customValidity,
      },
      presentation: redact(initialValue),
    };
  });
  const controller = useRef<SecretInputController | null>(null);
  const [ready, setReady] = useState(false);
  const controlledValue = useRef(value);

  const setInput = useCallback(
    (element: HTMLInputElement | null) => {
      if (!element) {
        return;
      }

      controller.current = createSecretInput(element, initial.options);
      setReady(true);
      const cleanup = typeof ref === "function" ? ref(element) : undefined;
      if (ref && typeof ref !== "function") {
        ref.current = element;
      }

      return () => {
        controller.current = null;
        if (cleanup) {
          cleanup();
        } else if (typeof ref === "function") {
          ref(null);
        } else if (ref) {
          ref.current = null;
        }
      };
    },
    [initial, ref],
  );

  useLayoutEffect(() => {
    controlledValue.current = value;
    const field = controller.current;
    if (!field) return;
    field.update({
      ...(initial.controlled ? { value: value ?? "" } : {}),
      defaultValue: initial.controlled ? (value ?? "") : (defaultValue ?? ""),
      revealed,
      pattern,
      minLength,
      maxLength,
      validationMessages,
      required,
      customValidity,
    });
  });

  const handleInput = (event: InputEvent<HTMLInputElement>): void => {
    const field = controller.current;
    if (!field) return;
    try {
      onChange?.(field.value);
      onInput?.(event);
    } finally {
      queueMicrotask(() => {
        if (initial.controlled && controller.current === field) {
          field.update({
            value: controlledValue.current ?? "",
            defaultValue: controlledValue.current ?? "",
          });
        }
      });
    }
  };

  return createElement("input", {
    autoCapitalize: "off",
    autoCorrect: "off",
    spellCheck: false,
    ...props,
    readOnly: !ready || props.readOnly,
    required,
    ...passwordManagerAttributes,
    autoComplete: "off",
    defaultValue: initial.presentation,
    onInput: handleInput,
    ref: setInput,
    type: "text",
  });
}
