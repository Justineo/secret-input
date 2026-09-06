import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { createSecretInput } from "../src/index.ts";
import { beforeInput, formDataFor } from "./edit.ts";

function setup(value = "abcd", revealed = false) {
  const form = document.createElement("form");
  const input = document.createElement("input");
  input.name = "secret";
  form.append(input);
  document.body.append(form);
  const field = createSecretInput(input, { value, revealed });
  input.focus();
  return { field, input, form };
}

function nativeMutation(input: HTMLInputElement, inputType: string, caret = 0): void {
  input.value = "unexpected";
  input.setSelectionRange(caret, caret);
  input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType }));
}

function selection(input: HTMLInputElement) {
  return [input.selectionStart, input.selectionEnd, input.selectionDirection];
}

describe("edit reconciliation", () => {
  beforeEach(() => document.body.replaceChildren());

  it.each([false, true])(
    "keeps deletion, subsequent typing, and submission aligned (revealed=%s)",
    (revealed) => {
      for (const [caret, result] of [
        [4, "abcX"],
        [2, "aXcd"],
      ] as const) {
        const { field, input, form } = setup("abcd", revealed);
        input.setSelectionRange(caret, caret);
        const listener = vi.fn();
        input.addEventListener("input", listener);
        expect(beforeInput(input, "deleteContentBackward").defaultPrevented).toBe(true);
        nativeMutation(input, "deleteContentBackward", caret - 2);
        expect(input.selectionStart).toBe(caret - 1);
        expect(listener).toHaveBeenCalledTimes(1);
        beforeInput(input, "insertText", "X");
        expect(field.value).toBe(result);
        expect(formDataFor(form).get("secret")).toBe(result);
        beforeInput(input, "historyUndo");
        beforeInput(input, "historyUndo");
        expect(field.value).toBe("abcd");
        expect(input.selectionStart).toBe(caret);
      }
    },
  );

  it.each([false, true])(
    "preserves Unicode edit boundaries and deletion grouping (revealed=%s)",
    (revealed) => {
      const { field, input } = setup("a👩‍💻e\u0301b", revealed);
      input.setSelectionRange(revealed ? 6 : 2, revealed ? 6 : 2);
      beforeInput(input, "deleteContentBackward");
      nativeMutation(input, "deleteContentBackward");
      expect(field.value).toBe("ae\u0301b");
      expect(input.selectionStart).toBe(1);
      beforeInput(input, "deleteContentForward");
      nativeMutation(input, "deleteContentForward");
      expect(field.value).toBe("ab");
      expect(input.selectionStart).toBe(1);
      beforeInput(input, "deleteContentForward");
      nativeMutation(input, "deleteContentForward");
      beforeInput(input, "historyUndo");
      expect(field.value).toBe("ae\u0301b");
    },
  );

  it("does not duplicate a replacement or lose its caret", () => {
    const { field, input } = setup();
    input.setSelectionRange(1, 3, "backward");
    beforeInput(input, "insertText", "你");
    nativeMutation(input, "insertText");
    expect(field.value).toBe("a你d");
    expect(input.selectionStart).toBe(2);
    beforeInput(input, "insertText", "X");
    expect(field.value).toBe("a你Xd");
    beforeInput(input, "historyUndo");
    expect(field.value).toBe("abcd");
    expect(selection(input)).toEqual([1, 3, "backward"]);
  });

  it.each([false, true])(
    "keeps a rejected replacement and its selection intact (revealed=%s)",
    (revealed) => {
      const { field, input, form } = setup("abc", revealed);
      field.update({ maxLength: 3 });
      input.setSelectionRange(1, 2, "backward");
      const listener = vi.fn();
      input.addEventListener("input", listener);
      beforeInput(input, "insertText", "👩‍💻");
      nativeMutation(input, "insertText");
      expect(field.value).toBe("abc");
      expect(selection(input)).toEqual([1, 2, "backward"]);
      expect(listener).not.toHaveBeenCalled();
      beforeInput(input, "insertText", "X");
      expect(field.value).toBe("aXc");
      expect(formDataFor(form).get("secret")).toBe("aXc");
      beforeInput(input, "historyUndo");
      expect(field.value).toBe("abc");
      expect(selection(input)).toEqual([1, 2, "backward"]);
    },
  );

  it.each(["insertText", "insertFromPaste"])(
    "does not treat sanitized-away %s as deletion",
    (inputType) => {
      const { field, input } = setup();
      input.setSelectionRange(1, 3, "backward");
      beforeInput(input, inputType, "\r\n");
      expect(field.value).toBe("abcd");
      expect(selection(input)).toEqual([1, 3, "backward"]);
      beforeInput(input, "insertText", "X");
      expect(field.value).toBe("aXd");
    },
  );

  it("preserves the redo branch after an entirely rejected insertion", () => {
    const { field, input } = setup("abc");
    beforeInput(input, "insertText", "d");
    beforeInput(input, "historyUndo");
    field.update({ maxLength: 3 });
    input.setSelectionRange(1, 2);
    beforeInput(input, "insertText", "🔐");
    beforeInput(input, "historyRedo");
    expect(field.value).toBe("abcd");
  });

  it("keeps the non-cancelable fallback at its original replacement range", () => {
    const { field, input } = setup("abc");
    field.update({ maxLength: 3 });
    input.setSelectionRange(1, 2, "backward");
    beforeInput(input, "insertText", "🔐", false);
    nativeMutation(input, "insertText");
    expect(field.value).toBe("abc");
    expect(selection(input)).toEqual([1, 2, "backward"]);
  });

  it("honors reentrant application value and selection updates", () => {
    const { field, input } = setup();
    input.setSelectionRange(2, 2);
    input.addEventListener(
      "input",
      () => {
        field.update({ value: "replacement" });
        input.setSelectionRange(3, 3);
      },
      { once: true },
    );
    beforeInput(input, "deleteContentBackward");
    input.dispatchEvent(new InputEvent("input", { inputType: "deleteContentBackward" }));
    expect(field.value).toBe("replacement");
    expect(input.selectionStart).toBe(3);
  });

  it("uses the latest nested edit instead of an outer edit's selection", () => {
    const { field, input } = setup();
    input.setSelectionRange(2, 2);
    let nested = false;
    input.addEventListener("input", () => {
      if (nested) return;
      nested = true;
      beforeInput(input, "insertText", "XY");
    });
    beforeInput(input, "deleteContentBackward");
    nativeMutation(input, "insertText");
    expect(field.value).toBe("aXYcd");
    expect(input.selectionStart).toBe(3);
  });

  it.each(["pointer", "keyboard", "selection", "blur", "update", "reveal", "expiry", "mismatch"])(
    "does not reuse an edit selection after %s",
    async (boundary) => {
      const { field, input } = setup();
      input.setSelectionRange(4, 4);
      beforeInput(input, "deleteContentBackward");
      if (boundary === "pointer") input.dispatchEvent(new Event("pointerdown"));
      if (boundary === "keyboard")
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft" }));
      if (boundary === "blur") {
        input.blur();
        input.focus();
      }
      if (boundary === "update") field.update({ value: "fresh" });
      if (boundary === "reveal") field.update({ revealed: true });
      if (boundary === "expiry") await Promise.resolve();
      if (boundary === "mismatch")
        input.dispatchEvent(new InputEvent("input", { inputType: "insertReplacementText" }));
      input.setSelectionRange(1, 1);
      if (boundary === "selection") input.dispatchEvent(new Event("select"));
      input.dispatchEvent(new InputEvent("input", { inputType: "deleteContentBackward" }));
      expect(input.selectionStart).toBe(1);
      beforeInput(input, "insertText", "X");
      expect(field.value).toBe(boundary === "update" ? "fXresh" : "aXbc");
    },
  );
});
