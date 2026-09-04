import { createElement, useCallback, useLayoutEffect, useRef } from "react";
import type { ComponentPropsWithoutRef, InputEvent, Ref } from "react";

import { mask, secretInput } from "./secret-input.ts";
import type { MaskOptions, SecretInputState } from "./secret-input.ts";

export interface SecretInputProps extends Omit<
  ComponentPropsWithoutRef<"input">,
  "children" | "defaultValue" | "onChange" | "type" | "value"
> {
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  redacted?: boolean;
  ref?: Ref<HTMLInputElement>;
  value?: string;
}

export function SecretInput({
  defaultValue,
  onInput,
  onValueChange,
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
  const state = useRef<SecretInputState | null>(null);
  const controlledValue = useRef(value);
  controlledValue.current = value;

  const setInput = useCallback(
    (input: HTMLInputElement | null) => {
      if (!input) {
        state.current = null;
        if (typeof ref === "function") {
          ref(null);
        } else if (ref) {
          ref.current = null;
        }
        return;
      }

      state.current = mask(input, initial.current)[secretInput];
      const cleanup = typeof ref === "function" ? ref(input) : undefined;
      if (ref && typeof ref !== "function") {
        ref.current = input;
      }

      return () => {
        state.current = null;
        if (cleanup) {
          cleanup();
        } else if (typeof ref === "function") {
          ref(null);
        } else if (ref) {
          ref.current = null;
        }
      };
    },
    [ref],
  );

  useLayoutEffect(() => {
    if (!state.current) {
      return;
    }
    if (value !== undefined) {
      state.current.value = value;
    }
    if (defaultValue !== undefined) {
      state.current.defaultValue = defaultValue;
    }
    state.current.redacted = redacted;
  }, [defaultValue, redacted, value]);

  const handleInput = useCallback(
    (event: InputEvent<HTMLInputElement>) => {
      onInput?.(event);
      if (!state.current) {
        return;
      }

      onValueChange?.(state.current.value);
      queueMicrotask(() => {
        if (state.current && controlledValue.current !== undefined) {
          state.current.value = controlledValue.current;
        }
      });
    },
    [onInput, onValueChange],
  );

  return createElement("input", {
    ...props,
    onInput: handleInput,
    ref: setInput,
    type: "text",
  });
}
