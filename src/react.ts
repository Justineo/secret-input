import { createElement, useCallback, useLayoutEffect, useRef, useState } from "react";
import type { ComponentPropsWithoutRef, InputEvent, Ref } from "react";

import { mask, redact } from "./secret-input.ts";
import type { MaskOptions, SecretInput as SecretInputElement } from "./secret-input.ts";
import { passwordManagerAttributes } from "./password-manager.ts";

export interface SecretInputProps extends Omit<
  ComponentPropsWithoutRef<"input">,
  "children" | "defaultValue" | "onChange" | "onInput" | "type" | "value"
> {
  defaultValue?: string;
  onChange?: (value: string, event: Event) => void;
  onInput?: (value: string, event: InputEvent<SecretInputElement>) => void;
  redacted?: boolean;
  ref?: Ref<SecretInputElement>;
  value?: string;
}

export function SecretInput({
  defaultValue,
  onChange,
  onInput,
  redacted = true,
  ref,
  value,
  ...props
}: SecretInputProps) {
  const initial = useRef<Required<MaskOptions>>({
    defaultValue: defaultValue ?? value ?? "",
    redacted,
    value: value ?? defaultValue ?? "",
  });
  const [initialPresentation] = useState(() => redact(initial.current.value));
  const input = useRef<SecretInputElement | null>(null);
  const changeHandler = useRef(onChange);
  const controlledValue = useRef(value);
  changeHandler.current = onChange;
  controlledValue.current = value;

  const handleChange = useCallback((event: Event) => {
    if (input.current) {
      changeHandler.current?.(input.current.secretValue, event);
    }
  }, []);

  const setInput = useCallback(
    (element: HTMLInputElement | null) => {
      if (!element) {
        input.current = null;
        if (typeof ref === "function") {
          ref(null);
        } else if (ref) {
          ref.current = null;
        }
        return;
      }

      const masked = mask(element, initial.current);
      masked.addEventListener("change", handleChange);
      input.current = masked;
      const cleanup = typeof ref === "function" ? ref(masked) : undefined;
      if (ref && typeof ref !== "function") {
        ref.current = masked;
      }

      return () => {
        masked.removeEventListener("change", handleChange);
        input.current = null;
        if (cleanup) {
          cleanup();
        } else if (typeof ref === "function") {
          ref(null);
        } else if (ref) {
          ref.current = null;
        }
      };
    },
    [handleChange, ref],
  );

  useLayoutEffect(() => {
    if (!input.current) {
      return;
    }
    if (value !== undefined) {
      input.current.secretValue = value;
    }
    if (defaultValue !== undefined) {
      input.current.defaultSecretValue = defaultValue;
    }
    input.current.redacted = redacted;
  }, [defaultValue, redacted, value]);

  const handleInput = useCallback(
    (event: InputEvent<SecretInputElement>) => {
      if (!input.current) {
        return;
      }

      onInput?.(input.current.secretValue, event);
      queueMicrotask(() => {
        if (input.current && controlledValue.current !== undefined) {
          input.current.secretValue = controlledValue.current;
        }
      });
    },
    [onInput],
  );

  return createElement("input", {
    autoCapitalize: "off",
    autoCorrect: "off",
    spellCheck: false,
    ...props,
    ...passwordManagerAttributes,
    autoComplete: "off",
    defaultValue: initialPresentation,
    onInput: handleInput,
    ref: setInput,
    type: "text",
  });
}
