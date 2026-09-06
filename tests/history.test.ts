import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { createSecretInput } from "../src/index.ts";
import type { SecretInputController } from "../src/index.ts";
import { beforeInput, composition } from "./edit.ts";

function createInput(value = ""): SecretInputController {
  const input = document.createElement("input");
  document.body.append(input);
  const masked = createSecretInput(input, { value });
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
  return masked;
}

function snapshot(field: SecretInputController) {
  const { input } = field;
  return {
    value: field.value,
    start: input.selectionStart,
    end: input.selectionEnd,
    direction: input.selectionDirection,
  };
}

describe("secret-state history", () => {
  beforeEach(() => document.body.replaceChildren());

  it("restores a backward selection and keeps redo independent of later navigation", () => {
    const field = createInput("abcd");
    const { input } = field;
    input.setSelectionRange(1, 3, "backward");
    const before = snapshot(field);
    beforeInput(input, "insertText", "x");
    const after = snapshot(field);

    for (let count = 0; count < 3; count += 1) {
      input.setSelectionRange(0, 0);
      beforeInput(input, "historyUndo");
      expect(snapshot(field)).toEqual(before);
      input.setSelectionRange(4, 4);
      beforeInput(input, "historyRedo");
      expect(snapshot(field)).toEqual(after);
    }
  });

  it.each(["deleteContentBackward", "deleteContentForward"])(
    "does not merge a selected deletion with adjacent %s",
    (inputType) => {
      const field = createInput("abcd");
      const { input } = field;
      const caret = inputType === "deleteContentBackward" ? 4 : 0;
      input.setSelectionRange(caret, caret);
      beforeInput(input, inputType);
      const intermediate = field.value;
      input.setSelectionRange(
        inputType === "deleteContentBackward" ? 1 : 0,
        inputType === "deleteContentBackward" ? 3 : 2,
        "backward",
      );
      const selected = snapshot(field);
      beforeInput(input, inputType);
      beforeInput(input, "historyUndo");
      expect(snapshot(field)).toEqual(selected);
      expect(field.value).toBe(intermediate);
      beforeInput(input, "historyUndo");
      expect(field.value).toBe("abcd");
    },
  );

  it.each(["historyUndo", "historyRedo"])("keeps %s out of an active composition", (inputType) => {
    const field = createInput("base");
    const { input } = field;
    beforeInput(input, "insertText", "x");
    if (inputType === "historyRedo") {
      beforeInput(input, "historyUndo");
    }
    const committed = field.value;
    input.setSelectionRange(input.value.length, input.value.length);
    composition(input, "compositionstart");
    beforeInput(input, "insertCompositionText", "draft");
    const presentation = input.value;
    const listener = vi.fn();
    input.addEventListener("input", listener);
    beforeInput(input, inputType);
    expect(field.value).toBe(committed);
    expect(input.value).toBe(presentation);
    expect(listener).not.toHaveBeenCalled();
    composition(input, "compositionend", "你");
    expect(field.value).toBe(`${committed}你`);
  });

  it.each(["historyUndo", "historyRedo"])(
    "repairs presentation when %s has no entry",
    (inputType) => {
      const field = createInput("kept");
      const { input } = field;
      const listener = vi.fn();
      input.addEventListener("input", listener);
      beforeInput(input, inputType, null, false);
      input.value = "browser-written";
      input.dispatchEvent(new InputEvent("input", { inputType }));
      expect(field.value).toBe("kept");
      expect(input.value).toBe("••••");
      expect(listener).not.toHaveBeenCalled();
    },
  );

  it("clears pending input metadata before keyboard undo", () => {
    const field = createInput();
    const { input } = field;
    beforeInput(input, "insertText", "a");
    beforeInput(input, "insertText", "stale", false);
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "z", ctrlKey: true, cancelable: true }),
    );
    input.value = "stale";
    input.dispatchEvent(new InputEvent("input", { inputType: "insertText" }));
    expect(field.value).toBe("");
    expect(input.value).toBe("");
  });
  it("invalidates redo only after a value-changing branch edit", () => {
    const field = createInput();
    const { input } = field;
    beforeInput(input, "insertText", "a");
    beforeInput(input, "insertFromPaste", "b");
    beforeInput(input, "historyUndo");
    field.update({ value: "a" });
    field.update({ defaultValue: "reset" });
    field.update({ revealed: true });
    beforeInput(input, "insertReplacementText", "rejected");
    beforeInput(input, "deleteContentForward");
    beforeInput(input, "historyRedo");
    expect(field.value).toBe("ab");

    beforeInput(input, "historyUndo");
    beforeInput(input, "insertText", "c");
    beforeInput(input, "historyRedo");
    expect(field.value).toBe("ac");
    beforeInput(input, "historyUndo");
    expect(field.value).toBe("a");
    beforeInput(input, "historyUndo");
    expect(field.value).toBe("");
  });

  it.each(["readOnly", "disabled"] as const)("does not consume history while %s", (property) => {
    const field = createInput("base");
    const { input } = field;
    beforeInput(input, "insertText", "x");
    input[property] = true;
    beforeInput(input, "historyUndo");
    expect(field.value).toBe("basex");
    input[property] = false;
    beforeInput(input, "historyUndo");
    expect(field.value).toBe("base");
    input[property] = true;
    beforeInput(input, "historyRedo");
    expect(field.value).toBe("base");
    input[property] = false;
    beforeInput(input, "historyRedo");
    expect(field.value).toBe("basex");
  });

  it("clears both history branches on an external replacement", () => {
    const field = createInput();
    const { input } = field;
    beforeInput(input, "insertText", "a");
    beforeInput(input, "insertFromPaste", "b");
    beforeInput(input, "historyUndo");
    field.update({ value: "external" });
    beforeInput(input, "historyUndo");
    beforeInput(input, "historyRedo");
    expect(field.value).toBe("external");
  });

  it.each(["a", "reset"])("clears both history branches when reset to %s", async (defaultValue) => {
    const field = createInput();
    const { input } = field;
    const form = document.createElement("form");
    document.body.append(form);
    form.append(input);
    field.update({});
    beforeInput(input, "insertText", "a");
    beforeInput(input, "insertFromPaste", "b");
    beforeInput(input, "historyUndo");
    field.update({ defaultValue: defaultValue });
    form.reset();
    await Promise.resolve();
    beforeInput(input, "historyUndo");
    beforeInput(input, "historyRedo");
    expect(field.value).toBe(defaultValue);
  });

  it("restores complete values after maxlength changes", () => {
    const field = createInput("a👩‍💻b");
    const { input } = field;
    input.select();
    beforeInput(input, "insertFromPaste", "🔐🔐");
    field.update({ maxLength: 1 });
    beforeInput(input, "historyUndo");
    expect(field.value).toBe("a👩‍💻b");
    beforeInput(input, "historyRedo");
    expect(field.value).toBe("🔐🔐");
  });

  it("preserves logical selections when history crosses reveal changes", () => {
    const field = createInput("a👩‍💻b");
    const { input } = field;
    input.setSelectionRange(1, 2, "backward");
    beforeInput(input, "insertText", "🔐");
    field.update({ revealed: true });
    beforeInput(input, "historyUndo");
    expect(snapshot(field)).toEqual({ value: "a👩‍💻b", start: 1, end: 6, direction: "backward" });
    beforeInput(input, "historyRedo");
    expect(input.value).toBe("a🔐b");
    expect(input.selectionStart).toBe(3);
    field.update({ revealed: false });
    beforeInput(input, "historyUndo");
    expect(snapshot(field)).toEqual({ value: "a👩‍💻b", start: 1, end: 2, direction: "backward" });
  });

  it("keeps canceled composition out of history and makes each commit one transaction", () => {
    const field = createInput();
    const { input } = field;
    beforeInput(input, "insertText", "a");
    composition(input, "compositionstart");
    beforeInput(input, "insertCompositionText", "draft");
    composition(input, "compositionend");
    beforeInput(input, "historyUndo");
    expect(field.value).toBe("");
    beforeInput(input, "historyRedo");
    expect(field.value).toBe("a");

    composition(input, "compositionstart");
    beforeInput(input, "insertCompositionText", "ni");
    beforeInput(input, "insertFromComposition", "你");
    composition(input, "compositionend", "你");
    beforeInput(input, "insertText", "x");
    for (const value of ["a你", "a", ""]) {
      beforeInput(input, "historyUndo");
      expect(field.value).toBe(value);
    }
    for (const value of ["a", "a你", "a你x"]) {
      beforeInput(input, "historyRedo");
      expect(field.value).toBe(value);
    }
  });

  it("does not intercept IME-owned keyboard shortcuts even without isComposing", () => {
    const field = createInput();
    const { input } = field;
    beforeInput(input, "insertText", "a");
    composition(input, "compositionstart");
    beforeInput(input, "insertCompositionText", "draft");
    const event = new KeyboardEvent("keydown", { key: "z", ctrlKey: true, cancelable: true });
    input.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(field.value).toBe("a");
  });

  it("starts a new group after selection moves away and returns", () => {
    const field = createInput();
    const { input } = field;
    beforeInput(input, "insertText", "a");
    input.setSelectionRange(0, 0);
    input.dispatchEvent(new Event("selectionchange"));
    input.setSelectionRange(1, 1);
    beforeInput(input, "insertText", "b");
    beforeInput(input, "historyUndo");
    expect(field.value).toBe("a");
  });

  it("does not emit change after undo returns to the focus value", () => {
    const field = createInput("base");
    const { input } = field;
    const listener = vi.fn();
    input.addEventListener("change", listener);
    beforeInput(input, "insertText", "x");
    beforeInput(input, "historyUndo");
    input.blur();
    expect(listener).not.toHaveBeenCalled();
    input.focus();
    beforeInput(input, "historyRedo");
    input.blur();
    expect(listener).toHaveBeenCalledOnce();
  });

  it("uses the reset value as the next focus-session baseline", async () => {
    const form = document.createElement("form");
    document.body.append(form);
    const field = createInput("old");
    const { input } = field;
    form.append(input);
    field.update({});
    input.focus();
    field.update({ defaultValue: "reset" });
    form.reset();
    await Promise.resolve();
    const listener = vi.fn();
    input.addEventListener("change", listener);
    beforeInput(input, "insertText", "x");
    beforeInput(input, "historyUndo");
    input.blur();
    expect(field.value).toBe("reset");
    expect(listener).not.toHaveBeenCalled();
  });

  it("commits the history transition before a reentrant input callback", () => {
    const field = createInput();
    const { input } = field;
    beforeInput(input, "insertText", "a");
    beforeInput(input, "insertFromPaste", "b");
    const seen: string[] = [];
    input.addEventListener("input", (event) => {
      seen.push(field.value);
      if ((event as InputEvent).inputType === "historyUndo") {
        beforeInput(input, "insertFromPaste", "x");
      }
    });
    beforeInput(input, "historyUndo");
    expect(seen).toEqual(["a", "ax"]);
    beforeInput(input, "historyRedo");
    expect(seen).toEqual(["a", "ax"]);
    expect(field.value).toBe("ax");
  });

  it.each([true, false])(
    "round-trips a sequence of independent Unicode edits (redacted=%s)",
    (redacted) => {
      const field = createInput("a👩‍💻b");
      const { input } = field;
      field.update({ revealed: !redacted });
      const entries: { before: ReturnType<typeof snapshot>; after: ReturnType<typeof snapshot> }[] =
        [];
      const texts = ["x", "\u0301", "🔐", "👩‍💻", "🇨🇳", "e\u0301"];
      for (let index = 0; index < 48; index += 1) {
        input.dispatchEvent(new Event("pointerdown"));
        const length = input.value.length;
        const action = index % 4;
        input.setSelectionRange(action === 2 ? 0 : length, length, "backward");
        const before = snapshot(field);
        beforeInput(
          input,
          action === 3 ? "deleteContentBackward" : action === 2 ? "insertFromPaste" : "insertText",
          action === 3 ? null : texts[index % texts.length]!,
        );
        const after = snapshot(field);
        if (after.value !== before.value) {
          entries.push({ before, after });
        }
      }
      for (const entry of [...entries].reverse()) {
        input.setSelectionRange(0, 0);
        beforeInput(input, "historyUndo");
        expect(snapshot(field)).toEqual(entry.before);
      }
      for (const entry of entries) {
        input.select();
        beforeInput(input, "historyRedo");
        expect(snapshot(field)).toEqual(entry.after);
      }
    },
  );
  it("starts a new group for a selection replacement and includes continued typing", () => {
    const field = createInput("abcd");
    const { input } = field;
    beforeInput(input, "insertText", "e");
    input.setSelectionRange(1, 3, "backward");
    const before = snapshot(field);
    beforeInput(input, "insertText", "x");
    beforeInput(input, "insertText", "y");
    const after = snapshot(field);
    expect(field.value).toBe("axyde");
    beforeInput(input, "historyUndo");
    expect(snapshot(field)).toEqual(before);
    beforeInput(input, "historyRedo");
    expect(snapshot(field)).toEqual(after);
  });
});
