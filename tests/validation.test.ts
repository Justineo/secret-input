import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { createSecretInput } from "../src/index.ts";
import type { SecretInputOptions, ValidationMessageContext } from "../src/index.ts";
import { beforeInput } from "./edit.ts";

function createField(options: SecretInputOptions = {}) {
  const form = document.createElement("form");
  const input = document.createElement("input");
  form.append(input);
  document.body.append(form);
  return { form, input, field: createSecretInput(input, options) };
}

describe("controller validation", () => {
  beforeEach(() => document.body.replaceChildren());

  it("rejects invalid length configuration before changing state or presentation", () => {
    const input = document.createElement("input");
    input.type = "password";
    expect(() => createSecretInput(input, { minLength: -1 })).toThrow(RangeError);
    expect(input.type).toBe("password");
    const field = createSecretInput(input, { value: "AB", customValidity: "Server error" });
    beforeInput(input, "insertText", "C");
    input.setSelectionRange(1, 2);
    for (const maxLength of [-1, 1.5, NaN, Infinity, 2 ** 31]) {
      expect(() =>
        field.update({
          value: "other",
          revealed: true,
          required: true,
          customValidity: "",
          maxLength,
        }),
      ).toThrow(RangeError);
      expect(field.value).toBe("ABC");
      expect(input.value).toBe("•••");
      expect(field.revealed).toBe(false);
      expect(input.required).toBe(false);
      expect(input.validationMessage).toBe("Server error");
      expect([input.selectionStart, input.selectionEnd]).toEqual([1, 2]);
    }
    beforeInput(input, "historyUndo");
    expect(field.value).toBe("AB");
  });

  it("takes rules from options and leaves native methods intact", () => {
    const input = document.createElement("input");
    input.pattern = "[0-9]+";
    input.minLength = 20;
    input.maxLength = 1;
    const nativeMethod = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "setCustomValidity",
    );
    const field = createSecretInput(input, {
      value: "AB",
      pattern: "[A-F0-9]+",
      minLength: 3,
      maxLength: 5,
      required: true,
    });
    expect(input.validity.customError).toBe(true);
    expect(input.required).toBe(true);
    for (const name of [
      "pattern",
      "minlength",
      "maxlength",
      "data-secret-pattern",
      "data-secret-minlength",
    ]) {
      expect(input.hasAttribute(name)).toBe(false);
    }
    expect(
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "setCustomValidity"),
    ).toEqual(nativeMethod);
    expect(Object.hasOwn(input, "setCustomValidity")).toBe(false);
    beforeInput(input, "insertText", "C");
    expect(field.value).toBe("ABC");
    expect(input.checkValidity()).toBe(true);
    field.update({ revealed: true });
    expect(input.checkValidity()).toBe(true);
    field.update({ revealed: false });
    expect(input.value).toBe("•••");
    expect(input.checkValidity()).toBe(true);
  });

  it("updates and removes rules synchronously without changing selection, events, or history", () => {
    const { field, input } = createField({ value: "A" });
    input.focus();
    beforeInput(input, "insertText", "B");
    input.setSelectionRange(0, 1, "backward");
    const listener = vi.fn();
    input.addEventListener("input", listener);
    input.addEventListener("change", listener);
    field.update({ pattern: "[0-9]+", minLength: 3 });
    expect(input.checkValidity()).toBe(false);
    field.update({ pattern: undefined });
    expect(input.checkValidity()).toBe(false);
    field.update({});
    expect(input.checkValidity()).toBe(false);
    field.update({ minLength: undefined, maxLength: 4, required: true });
    expect(input.checkValidity()).toBe(true);
    expect(field.value).toBe("AB");
    expect(document.activeElement).toBe(input);
    expect([input.selectionStart, input.selectionEnd, input.selectionDirection]).toEqual([
      0,
      1,
      "backward",
    ]);
    expect(listener).not.toHaveBeenCalled();
    beforeInput(input, "historyUndo");
    expect(field.value).toBe("A");
    expect(input.checkValidity()).toBe(true);
    field.update({ required: undefined, maxLength: undefined });
    expect(input.required).toBe(false);
    field.update({ value: "A long programmatic value" });
    expect(input.checkValidity()).toBe(true);
  });

  it("applies value, presentation, and rule patches together before returning", () => {
    const { field, input } = createField({ value: "AB", pattern: "[A-Z]+", minLength: 3 });
    const listener = vi.fn();
    input.addEventListener("input", listener);
    field.update({ value: "1234", pattern: "[0-9]+", minLength: 4, maxLength: 4, revealed: true });
    expect(field.value).toBe("1234");
    expect(input.value).toBe("1234");
    expect(input.checkValidity()).toBe(true);
    expect(listener).not.toHaveBeenCalled();
    field.update({
      value: undefined,
      defaultValue: undefined,
      revealed: undefined,
      pattern: undefined,
      minLength: undefined,
      maxLength: undefined,
    });
    expect(field.value).toBe("");
    expect(field.defaultValue).toBe("");
    expect(field.revealed).toBe(false);
    expect(input.checkValidity()).toBe(true);
  });

  it("does not read delegated attributes or native length properties as rules", async () => {
    const { field, input } = createField({ value: "AB", maxLength: 3 });
    input.dataset.secretPattern = "[0-9]+";
    input.dataset.secretMinlength = "20";
    input.maxLength = 1;
    await Promise.resolve();
    beforeInput(input, "insertText", "C");
    expect(field.value).toBe("ABC");
    expect(input.validity.customError).toBe(false);
    beforeInput(input, "insertText", "D");
    expect(field.value).toBe("ABC");
    field.update({ value: "ABCD" });
    expect(input.validity.customError).toBe(true);
    field.update({ maxLength: undefined });
    expect(input.validity.customError).toBe(false);
  });

  it("uses UTF-16 for both bounds, including quiet programmatic values", () => {
    const { field, input } = createField({ value: "🔐", minLength: 3, maxLength: 3 });
    expect(input.checkValidity()).toBe(false);
    beforeInput(input, "insertText", "a");
    expect(field.value).toBe("🔐a");
    expect(input.value).toBe("••");
    expect(input.checkValidity()).toBe(true);
    field.update({ value: "👩‍💻" });
    expect(field.value.length).toBe(5);
    expect(input.value).toBe("•");
    expect(input.checkValidity()).toBe(false);
    field.update({ minLength: 5, maxLength: 5 });
    expect(input.checkValidity()).toBe(true);
    field.update({ value: "" });
    expect(input.checkValidity()).toBe(true);
    field.update({ required: true });
    expect(input.validity.valueMissing).toBe(true);
    expect(input.validity.customError).toBe(false);
    const native = document.createElement("input");
    native.required = true;
    expect(input.validationMessage).toBe(native.validationMessage);
  });

  it("owns the application message separately and exposes remaining rules when cleared", () => {
    const { field, input } = createField({
      value: "AB",
      pattern: "[A-Z]+",
      customValidity: "The server rejected this key.",
    });
    expect(input.validationMessage).toBe("The server rejected this key.");
    expect(input.checkValidity()).toBe(false);
    field.update({ value: "ABC" });
    expect(input.validationMessage).toBe("The server rejected this key.");
    field.update({ minLength: 8 });
    expect(input.validationMessage).toBe("The server rejected this key.");
    field.update({ customValidity: "" });
    expect(input.validationMessage).not.toBe("The server rejected this key.");
    expect(input.validationMessage).not.toBe("");
    field.update({});
    expect(input.checkValidity()).toBe(false);
    field.update({ minLength: undefined });
    expect(input.checkValidity()).toBe(true);
    field.update({ customValidity: "Another error" });
    field.update({ customValidity: undefined });
    expect(input.checkValidity()).toBe(true);
  });

  it.each([
    ["minLength", "tooShort", 6, "The value is too short."],
    ["maxLength", "tooLong", 4, "The value is too long."],
  ] as const)(
    "customizes %s messages without changing rules or editing state",
    (rule, option, limit, fallback) => {
      const { field, input, form } = createField({
        value: "👩‍💻",
        [rule]: limit,
        validationMessages: { [option]: "Initial length message" },
      });
      input.setSelectionRange(0, 1, "backward");
      const listener = vi.fn();
      input.addEventListener("input", listener);
      expect(input.validationMessage).toBe("Initial length message");
      field.update({ validationMessages: { [option]: "本地化长度提示" } });
      expect(input.validationMessage).toBe("本地化长度提示");
      expect(field.value).toBe("👩‍💻");
      expect(input.value).toBe("•");
      expect([input.selectionStart, input.selectionEnd, input.selectionDirection]).toEqual([
        0,
        1,
        "backward",
      ]);
      expect(listener).not.toHaveBeenCalled();
      field.update({ revealed: true });
      expect(input.validationMessage).toBe("本地化长度提示");
      field.update({ [rule]: 5 });
      expect(input.checkValidity()).toBe(true);
      field.update({ [rule]: limit, customValidity: "Server error" });
      expect(input.validationMessage).toBe("Server error");
      field.update({ validationMessages: { [option]: "Updated length message" } });
      expect(input.validationMessage).toBe("Server error");
      field.update({ customValidity: "" });
      expect(input.validationMessage).toBe("Updated length message");
      for (const message of ["", undefined]) {
        field.update({ validationMessages: { [option]: message } });
        expect(input.validationMessage).toBe(fallback);
        expect(form.checkValidity()).toBe(false);
      }
      field.update({ [rule]: undefined });
      expect(input.checkValidity()).toBe(true);
    },
  );

  it("keeps native required and pattern messages ahead of length messages", () => {
    const { field, input } = createField({
      required: true,
      pattern: "[0-9]+",
      minLength: 4,
      validationMessages: { tooShort: "Too short" },
    });
    const native = document.createElement("input");
    native.type = "password";
    native.required = true;
    native.pattern = "[0-9]+";
    expect(input.validationMessage).toBe(native.validationMessage);
    expect(input.validity.valueMissing).toBe(true);
    expect(input.validity.customError).toBe(false);
    field.update({ value: "AB" });
    native.value = "AB";
    expect(input.validationMessage).toBe(native.validationMessage);
    field.update({ value: "12" });
    expect(input.validationMessage).toBe("Too short");
    field.update({ value: "1234" });
    expect(input.validationMessage).toBe("");
  });

  it.each<{ type: ValidationMessageContext["type"]; options: SecretInputOptions }>([
    { type: "valueMissing", options: { required: true } },
    { type: "patternMismatch", options: { value: "AB", pattern: "[0-9]+" } },
    { type: "tooShort", options: { value: "🔐", minLength: 3 } },
    { type: "tooLong", options: { value: "👩‍💻", maxLength: 4 } },
  ])("supports strings, formatters, and fallback for $type", ({ type, options }) => {
    const { field, input } = createField(options);
    const defaultMessage = input.validationMessage;
    expect(defaultMessage).not.toBe("");
    field.update({ validationMessages: { [type]: "Custom message" } });
    expect(input.validationMessage).toBe("Custom message");
    let label = "First";
    const formatter = vi.fn(
      (context: ValidationMessageContext) => `${label}: ${context.defaultMessage}`,
    );
    field.update({ validationMessages: { [type]: formatter } });
    expect(formatter).toHaveBeenLastCalledWith({
      type,
      defaultMessage,
      valueLength: field.value.length,
      minLength: options.minLength ?? 0,
      maxLength: options.maxLength,
      pattern: options.pattern,
    });
    expect(input.validationMessage).toBe(`First: ${defaultMessage}`);
    label = "Second";
    field.update({});
    expect(input.validationMessage).toBe(`Second: ${defaultMessage}`);
    field.update({ customValidity: "Server error" });
    formatter.mockClear();
    field.update({});
    expect(formatter).not.toHaveBeenCalled();
    expect(input.validationMessage).toBe("Server error");
    field.update({ customValidity: undefined });
    expect(input.validationMessage).toBe(`Second: ${defaultMessage}`);
    for (const override of ["", undefined, () => "", () => undefined]) {
      field.update({ validationMessages: { [type]: override } });
      expect(input.validationMessage).toBe(defaultMessage);
      expect(input.checkValidity()).toBe(false);
      if (type === "valueMissing") {
        expect(input.validity.valueMissing).toBe(true);
        expect(input.validity.customError).toBe(false);
      }
    }
    field.update({ validationMessages: { [type]: "Custom message" } });
    field.update({ validationMessages: {} });
    expect(input.validationMessage).toBe(defaultMessage);
    field.update({ validationMessages: { [type]: "Custom message" } });
    field.update({ validationMessages: undefined });
    expect(input.validationMessage).toBe(defaultMessage);
    field.update({
      required: false,
      pattern: undefined,
      minLength: undefined,
      maxLength: undefined,
      validationMessages: { [type]: formatter },
    });
    formatter.mockClear();
    field.update({});
    expect(formatter).not.toHaveBeenCalled();
    expect(input.checkValidity()).toBe(true);
  });

  it("preserves application errors through updates, edits, history, and reset", async () => {
    const { field, input, form } = createField({
      value: "AB",
      pattern: "[A-Z]+",
      customValidity: "Server error",
    });
    input.focus();
    input.setSelectionRange(0, 1);
    beforeInput(input, "insertReplacementText", "unwanted");
    input.blur();
    expect(input.validationMessage).toBe("Server error");
    for (const patch of [{}, { value: "AB" }, { revealed: true }, { defaultValue: "reset" }]) {
      field.update(patch);
      expect(input.validationMessage).toBe("Server error");
    }
    input.setSelectionRange(2, 2);
    beforeInput(input, "insertText", "C");
    expect(field.value).toBe("ABC");
    expect(input.validationMessage).toBe("Server error");
    beforeInput(input, "historyUndo");
    expect(field.value).toBe("AB");
    expect(input.validationMessage).toBe("Server error");
    beforeInput(input, "historyRedo");
    expect(field.value).toBe("ABC");
    expect(input.validationMessage).toBe("Server error");
    form.reset();
    await Promise.resolve();
    expect(field.value).toBe("reset");
    expect(input.validationMessage).toBe("Server error");
    field.update({ customValidity: undefined });
    expect(input.checkValidity()).toBe(false);
    field.update({ value: "RESET" });
    expect(input.checkValidity()).toBe(true);
  });

  it.each<{ type: ValidationMessageContext["type"]; options: SecretInputOptions }>([
    { type: "valueMissing", options: { required: true } },
    { type: "patternMismatch", options: { value: "AB", pattern: "[0-9]+" } },
    { type: "tooShort", options: { value: "AB", minLength: 3 } },
    { type: "tooLong", options: { value: "AB", maxLength: 1 } },
  ])("falls back to the default when a $type formatter throws", ({ type, options }) => {
    const baseline = createField(options).input.validationMessage;
    const { field, input } = createField({
      ...options,
      validationMessages: {
        [type]: () => {
          throw new Error("Message formatting failed");
        },
      },
    });
    expect(input.checkValidity()).toBe(false);
    expect(input.validationMessage).toBe(baseline);
    field.update({});
    expect(input.validationMessage).toBe(baseline);
    field.update({ customValidity: "Server error" });
    expect(input.validationMessage).toBe("Server error");
    field.update({ customValidity: undefined });
    expect(input.validationMessage).toBe(baseline);
  });

  it("finishes updates, edits, history, and reset when a formatter throws", async () => {
    const { field, input, form } = createField({
      value: "ABC",
      defaultValue: "123",
      pattern: "[A-Z]+",
      validationMessages: {
        patternMismatch: () => {
          throw new Error("Message formatting failed");
        },
      },
    });
    const changes: string[] = [];
    input.addEventListener("input", () => {
      expect(input.checkValidity()).toBe(false);
      changes.push(field.value);
    });
    field.update({ value: "123" });
    expect(input.checkValidity()).toBe(false);
    expect(input.validationMessage).not.toBe("");
    beforeInput(input, "insertText", "4");
    beforeInput(input, "historyUndo");
    beforeInput(input, "historyRedo");
    expect(changes).toEqual(["1234", "123", "1234"]);
    field.update({ value: "ABC" });
    expect(input.checkValidity()).toBe(true);
    form.reset();
    await Promise.resolve();
    expect(field.value).toBe("123");
    expect(input.checkValidity()).toBe(false);
  });

  it("preserves stored errors when native validation messages are unavailable", () => {
    const { field, input } = createField({ value: "AB", customValidity: "Server error" });
    input.disabled = true;
    expect(input.checkValidity()).toBe(true);
    field.update({ value: "ABC", revealed: true });
    input.disabled = false;
    expect(input.validationMessage).toBe("Server error");
    expect(input.checkValidity()).toBe(false);
    input.readOnly = true;
    field.update({ customValidity: "Replacement error" });
    expect(input.checkValidity()).toBe(true);
    input.readOnly = false;
    expect(input.validationMessage).toBe("Replacement error");
    field.update({ customValidity: undefined });
    expect(input.checkValidity()).toBe(true);
  });

  it("keeps native methods unmodified and restores owned validity on explicit synchronization", () => {
    const { field, input } = createField({ value: "AB", customValidity: "Owned error" });
    input.setCustomValidity("");
    expect(input.checkValidity()).toBe(true);
    field.update({});
    expect(input.validationMessage).toBe("Owned error");
    expect(Object.hasOwn(input, "setCustomValidity")).toBe(false);
  });

  it("revalidates reset values under the latest rules and preserves native exemptions", async () => {
    const { field, input, form } = createField({ value: "AB", minLength: 3 });
    beforeInput(input, "insertText", "C");
    expect(input.checkValidity()).toBe(true);
    form.reset();
    await Promise.resolve();
    expect(field.value).toBe("AB");
    expect(input.checkValidity()).toBe(false);
    input.readOnly = true;
    expect(input.checkValidity()).toBe(true);
    input.readOnly = false;
    input.disabled = true;
    expect(input.checkValidity()).toBe(true);
    input.disabled = false;
    expect(input.checkValidity()).toBe(false);
  });

  it("keeps one lazy detached validator and clears its plaintext between checks", () => {
    const { field } = createField({ value: "AB" });
    const createElement = vi.spyOn(document, "createElement");
    try {
      field.update({ required: true });
      expect(createElement).not.toHaveBeenCalled();
      field.update({ minLength: 4, validationMessages: { tooShort: "Too short" } });
      expect(field.input.validationMessage).toBe("Too short");
      field.update({ validationMessages: undefined });
      expect(field.input.validationMessage).toBe("The value is too short.");
      expect(createElement).not.toHaveBeenCalled();
      field.update({ pattern: "[A-Z]+" });
      const probe = createElement.mock.results[0]?.value as HTMLInputElement;
      expect(probe.type).toBe("password");
      expect(probe.isConnected).toBe(false);
      expect(probe.name).toBe("");
      expect(probe.value).toBe("");
      field.update({ value: "ABC", minLength: 4 });
      expect(createElement).toHaveBeenCalledOnce();
      expect(probe.value).toBe("");
    } finally {
      createElement.mockRestore();
    }
  });

  it("rejects nonempty values for contradictory bounds and preserves optional emptiness", () => {
    const { field, input } = createField({ value: "ABC", minLength: 5, maxLength: 2 });
    expect(input.checkValidity()).toBe(false);
    field.update({ value: "" });
    expect(input.checkValidity()).toBe(true);
    field.update({ minLength: undefined, maxLength: 0, value: "A" });
    expect(input.checkValidity()).toBe(false);
    field.update({ maxLength: undefined });
    expect(input.checkValidity()).toBe(true);
  });

  it("avoids rewriting probe plaintext on unrelated updates and refreshes its document and message context", () => {
    const { field, input } = createField({ value: "AB" });
    const createElement = vi.spyOn(document, "createElement");
    try {
      field.update({ pattern: "[0-9]+" });
      const probe = createElement.mock.results[0]?.value as HTMLInputElement;
      const writes = vi.spyOn(probe, "value", "set");
      try {
        field.update({});
        field.update({ value: "AB", revealed: true, defaultValue: "reset" });
        input.focus();
        input.blur();
        expect(writes).not.toHaveBeenCalled();
        expect(input.checkValidity()).toBe(false);
        const format = vi.fn(
          ({ defaultMessage }: ValidationMessageContext) => `Custom: ${defaultMessage}`,
        );
        field.update({ validationMessages: { patternMismatch: format } });
        field.update({});
        expect(format).toHaveBeenCalledTimes(2);
        expect(input.validationMessage).toMatch(/^Custom: /);
        expect(writes).not.toHaveBeenCalled();
        input.title = "Use digits";
        input.lang = "fr";
        field.update({});
        expect(writes).toHaveBeenCalled();
        expect(probe.title).toBe("Use digits");
        expect(probe.lang).toBe("fr");
        expect(probe.value).toBe("");
      } finally {
        writes.mockRestore();
      }
      const otherDocument = document.implementation.createHTMLDocument("Other document");
      otherDocument.adoptNode(input);
      const createOtherElement = vi.spyOn(otherDocument, "createElement");
      try {
        field.update({});
        const otherProbe = createOtherElement.mock.results[0]?.value as HTMLInputElement;
        expect(otherProbe.ownerDocument).toBe(otherDocument);
        expect(otherProbe.value).toBe("");
        expect(otherProbe.isConnected).toBe(false);
        expect(input.checkValidity()).toBe(false);
      } finally {
        createOtherElement.mockRestore();
      }
    } finally {
      createElement.mockRestore();
    }
  });

  it("clears temporary plaintext after a failed native check and retries without a stale cache", () => {
    const { field, input } = createField({ value: "AB" });
    const createElement = vi.spyOn(document, "createElement");
    try {
      field.update({ pattern: "[A-Z]+" });
      const probe = createElement.mock.results[0]?.value as HTMLInputElement;
      const readMessage = vi.spyOn(probe, "validationMessage", "get");
      readMessage.mockImplementationOnce(() => {
        throw new Error("Native check failed");
      });
      try {
        expect(() => field.update({ value: "123" })).toThrow("Native check failed");
        expect(probe.value).toBe("");
        field.update({});
        expect(input.checkValidity()).toBe(false);
        expect(probe.value).toBe("");
      } finally {
        readMessage.mockRestore();
      }
    } finally {
      createElement.mockRestore();
    }
  });
});
