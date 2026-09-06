import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser/context";

import { createSecretInput } from "../../src/index.ts";
import type { SecretInputController } from "../../src/index.ts";
import { beforeInput, composition } from "../edit.ts";

let input: HTMLInputElement;
let field: SecretInputController;

async function undo(): Promise<void> {
  await userEvent.keyboard("{Ctrl>}z{/Ctrl}");
}

async function redo(): Promise<void> {
  await userEvent.keyboard("{Ctrl>}{Shift>}z{/Shift}{/Ctrl}");
}

describe("history browser contract", () => {
  beforeEach(() => {
    const element = document.createElement("input");
    document.body.append(element);
    field = createSecretInput(element);
    input = field.input;
    input.focus();
  });

  afterEach(() => document.body.replaceChildren());

  it("groups real typing and separates navigation and redo branches", async () => {
    await userEvent.type(input, "abc", { skipClick: true });
    await userEvent.keyboard("{ArrowLeft}{ArrowRight}d");
    await undo();
    expect(field.value).toBe("abc");
    await undo();
    expect(field.value).toBe("");
    await redo();
    expect(field.value).toBe("abc");
    await userEvent.keyboard("x");
    await redo();
    expect(field.value).toBe("abcx");
    await undo();
    expect(field.value).toBe("abc");
  });

  it.each(["backward", "forward"])(
    "round-trips grouped %s deletion and its carets",
    async (direction) => {
      field.update({ value: "a👩‍💻bc" });
      const caret = direction === "backward" ? 4 : 0;
      input.setSelectionRange(caret, caret);
      await userEvent.keyboard(
        direction === "backward" ? "{Backspace}{Backspace}" : "{Delete}{Delete}",
      );
      const value = field.value;
      const editedCaret = input.selectionStart;
      input.setSelectionRange(1, 1);
      await undo();
      expect(field.value).toBe("a👩‍💻bc");
      expect(input.selectionStart).toBe(caret);
      expect(input.selectionEnd).toBe(caret);
      input.select();
      await redo();
      expect(field.value).toBe(value);
      expect(input.selectionStart).toBe(editedCaret);
      expect(input.selectionEnd).toBe(editedCaret);
    },
  );

  it("preserves backward replacement selections across reveal and repeated traversal", async () => {
    field.update({ value: "a👩‍💻b" });
    input.setSelectionRange(1, 2, "backward");
    await userEvent.keyboard("xy");
    field.update({ revealed: true });
    for (let index = 0; index < 3; index += 1) {
      input.setSelectionRange(0, 0);
      await undo();
      expect(input.value).toBe("a👩‍💻b");
      expect(input.selectionStart).toBe(1);
      expect(input.selectionEnd).toBe(6);
      expect(input.selectionDirection).toBe("backward");
      input.select();
      await redo();
      expect(input.value).toBe("axyb");
      expect(input.selectionStart).toBe(3);
      expect(input.selectionEnd).toBe(3);
    }
  });

  it("ends a typing group for a native select event but not its own rendering", async () => {
    await userEvent.type(input, "ab", { skipClick: true });
    const selected = new Promise<void>((resolve) => {
      input.addEventListener("select", () => resolve(), { once: true });
    });
    input.setSelectionRange(0, 1);
    await selected;
    input.setSelectionRange(2, 2);
    await userEvent.keyboard("x");
    await undo();
    expect(field.value).toBe("ab");
    await undo();
    expect(field.value).toBe("");
  });

  it("uses beforeinput selections for non-cancelable edits and history", () => {
    field.update({ value: "abcd" });
    input.setSelectionRange(1, 3, "backward");
    beforeInput(input, "insertText", "x", false);
    input.value = "browser-mutated";
    input.dispatchEvent(new InputEvent("input", { inputType: "insertText", data: "x" }));
    expect(field.value).toBe("axd");
    beforeInput(input, "historyUndo", null, false);
    input.value = "another-mutation";
    input.dispatchEvent(new InputEvent("input", { inputType: "historyUndo" }));
    expect(field.value).toBe("abcd");
    expect(input.value).toBe("••••");
    expect(input.selectionStart).toBe(1);
    expect(input.selectionEnd).toBe(3);
    expect(input.selectionDirection).toBe("backward");
    beforeInput(input, "historyRedo");
    expect(field.value).toBe("axd");
    expect(input.selectionStart).toBe(2);
  });

  it("keeps composition drafts outside history and commits one transaction", () => {
    beforeInput(input, "insertText", "a");
    composition(input, "compositionstart");
    beforeInput(input, "insertCompositionText", "ni");
    beforeInput(input, "historyUndo");
    expect(field.value).toBe("a");
    expect(input.value).toBe("•");
    composition(input, "compositionend", "你");
    beforeInput(input, "insertFromComposition", "你");
    beforeInput(input, "historyUndo");
    expect(field.value).toBe("a");
    beforeInput(input, "historyUndo");
    expect(field.value).toBe("");
    beforeInput(input, "historyRedo");
    beforeInput(input, "historyRedo");
    expect(field.value).toBe("a你");
  });

  it("emits one input per transition and no change when undo returns to the focus value", async () => {
    const events: { type: string; data: string | null; value: string; composing: boolean }[] = [];
    let changes = 0;
    input.addEventListener("input", (event) => {
      const edit = event as InputEvent;
      events.push({
        type: edit.inputType,
        data: edit.data,
        value: input.value,
        composing: edit.isComposing,
      });
    });
    input.addEventListener("change", () => (changes += 1));
    await userEvent.keyboard("x");
    await undo();
    await undo();
    input.blur();
    expect(events).toEqual([
      { type: "insertText", data: "x", value: "•", composing: false },
      { type: "historyUndo", data: null, value: "", composing: false },
    ]);
    expect(changes).toBe(0);
    input.focus();
    await redo();
    input.blur();
    expect(changes).toBe(1);
  });
});
