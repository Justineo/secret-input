import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser/context";

import { createSecretInput } from "../../src/index.ts";
import type { SecretInputController } from "../../src/index.ts";
import { beforeInput } from "../edit.ts";

let field: SecretInputController;
let input: HTMLInputElement;
let form: HTMLFormElement;

describe("edit reconciliation in browsers", () => {
  beforeEach(() => {
    form = document.createElement("form");
    input = document.createElement("input");
    input.name = "secret";
    form.append(input);
    document.body.append(form);
    field = createSecretInput(input, { value: "a👩‍💻bc" });
    input.focus();
  });

  afterEach(() => document.body.replaceChildren());

  it.each([false, true])(
    "restores an extra deletion before real typing and form submission (revealed=%s)",
    async (revealed) => {
      field.update({ revealed });
      input.setSelectionRange(revealed ? 6 : 2, revealed ? 6 : 2);
      const received: string[] = [];
      input.addEventListener("input", () => received.push(field.value));
      // Replay the broken-keyboard event shape during real beforeinput dispatch,
      // after the controller has accepted and canceled the user's Backspace.
      input.addEventListener("beforeinput", (event) => {
        if (event.inputType !== "deleteContentBackward" || !event.defaultPrevented) return;
        input.value = input.value.slice(1);
        input.setSelectionRange(0, 0);
        input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: event.inputType }));
      });
      await userEvent.keyboard("{Backspace}");
      expect(field.value).toBe("abc");
      expect(input.selectionStart).toBe(1);
      await userEvent.keyboard("X");
      expect(field.value).toBe("aXbc");
      expect(new FormData(form).get("secret")).toBe("aXbc");
      expect(received).toEqual(["abc", "aXbc"]);
      await userEvent.keyboard("{Ctrl>}z{/Ctrl}");
      expect(field.value).toBe("abc");
      await userEvent.keyboard("{Ctrl>}z{/Ctrl}");
      expect(field.value).toBe("a👩‍💻bc");
      expect(input.selectionStart).toBe(revealed ? 6 : 2);
    },
  );

  it.each([false, true])(
    "preserves a rejected range for the next real character (revealed=%s)",
    async (revealed) => {
      field.update({ value: "abc", maxLength: 3, revealed });
      input.setSelectionRange(1, 2, "backward");
      beforeInput(input, "insertText", "🔐");
      expect(field.value).toBe("abc");
      expect([input.selectionStart, input.selectionEnd, input.selectionDirection]).toEqual([
        1,
        2,
        "backward",
      ]);
      await userEvent.keyboard("X");
      expect(field.value).toBe("aXc");
      expect(new FormData(form).get("secret")).toBe("aXc");
      await userEvent.keyboard("{Ctrl>}z{/Ctrl}");
      expect(field.value).toBe("abc");
      expect([input.selectionStart, input.selectionEnd, input.selectionDirection]).toEqual([
        1,
        2,
        "backward",
      ]);
    },
  );

  it("does not override selection moved by an input callback", () => {
    input.setSelectionRange(4, 4);
    input.addEventListener("input", () => input.setSelectionRange(1, 1), { once: true });
    beforeInput(input, "deleteContentBackward");
    input.value = "";
    input.dispatchEvent(new InputEvent("input", { inputType: "deleteContentBackward" }));
    expect(field.value).toBe("a👩‍💻b");
    expect(input.selectionStart).toBe(1);
    beforeInput(input, "insertText", "X");
    expect(field.value).toBe("aX👩‍💻b");
  });

  it("does not override later native navigation", async () => {
    input.setSelectionRange(4, 4);
    await userEvent.keyboard("{Backspace}{ArrowLeft}X");
    expect(field.value).toBe("a👩‍💻Xb");
    expect(new FormData(form).get("secret")).toBe(field.value);
  });
});
