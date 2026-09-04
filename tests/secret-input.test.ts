import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { mask, secretInput } from "../src/index.ts";
import type { SecretInput, SecretInputState } from "../src/index.ts";
import { beforeInput, formDataFor } from "./edit.ts";

function createInput(value = ""): SecretInput {
  const input = document.createElement("input");
  document.body.append(input);
  return mask(input, { value });
}

function state(input: SecretInput): SecretInputState {
  return input[secretInput];
}

function createFormInput(name = ""): { form: HTMLFormElement; input: HTMLInputElement } {
  const form = document.createElement("form");
  const input = document.createElement("input");
  input.name = name;
  form.append(input);
  document.body.append(form);
  return { form, input };
}

function dispatchTransfer(input: HTMLInputElement, type: "drop" | "paste", data: string): void {
  const event = new Event(type, { bubbles: true });
  Object.defineProperty(event, type === "paste" ? "clipboardData" : "dataTransfer", {
    value: { getData: () => data },
  });
  input.dispatchEvent(event);
}

function keyDown(
  input: HTMLInputElement,
  key: string,
  modifiers: KeyboardEventInit = {},
): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    key,
    ...modifiers,
  });
  input.dispatchEvent(event);
  return event;
}

describe("mask", () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it("keeps the secret separate from the native value", () => {
    const input = createInput("secret🔐");

    expect(input.type).toBe("text");
    expect(state(input).redacted).toBe(true);
    expect(state(input).value).toBe("secret🔐");
    expect(input.value).toBe("•••••••");
    expect(input.getAttribute("value")).toBeNull();
    expect(input.value).not.toContain("secret");
  });

  it("normalizes the editing surface to a text input", () => {
    const input = document.createElement("input");
    input.type = "password";

    mask(input);

    expect(input.type).toBe("text");
  });

  it("asks native and third-party password managers to ignore the input", () => {
    const input = document.createElement("input");
    input.autocomplete = "current-password";
    input.setAttribute("data-form-type", "password");

    mask(input);

    expect(input.autocomplete).toBe("off");
    expect(input.getAttribute("data-1p-ignore")).toBe("");
    expect(input.getAttribute("data-bwignore")).toBe("true");
    expect(input.getAttribute("data-form-type")).toBe("other");
    expect(input.getAttribute("data-lpignore")).toBe("true");
    expect(input.getAttribute("data-protonpass-ignore")).toBe("true");
  });

  it("reveals and redacts without changing the secret or emitting input", () => {
    const input = createInput("a👩‍💻b");
    const listener = vi.fn();
    input.addEventListener("input", listener);
    input.focus();
    input.setSelectionRange(1, 2);

    state(input).redacted = false;

    expect(input.value).toBe("a👩‍💻b");
    expect(state(input).value).toBe("a👩‍💻b");
    expect(input.selectionStart).toBe(1);
    expect(input.selectionEnd).toBe(6);
    expect(listener).not.toHaveBeenCalled();

    state(input).redacted = true;

    expect(input.value).toBe("•••");
    expect(input.selectionStart).toBe(1);
    expect(input.selectionEnd).toBe(2);
    expect(listener).not.toHaveBeenCalled();
  });

  it("accepts an initial revealed state", () => {
    const input = document.createElement("input");
    document.body.append(input);

    const revealed = mask(input, { redacted: false, value: "secret" })[secretInput];

    expect(revealed.redacted).toBe(false);
    expect(revealed.value).toBe("secret");
    expect(input.value).toBe("secret");
  });

  it("uses defaultValue as the initial value when value is omitted", () => {
    const input = document.createElement("input");

    const currentState = mask(input, { defaultValue: "initial" })[secretInput];

    expect(currentState.value).toBe("initial");
    expect(currentState.defaultValue).toBe("initial");
    expect(input.value).toBe("•••••••");
  });

  it("returns the native input and exposes state through one symbol", () => {
    const input = document.createElement("input");

    const masked = mask(input, { redacted: false, value: "secret" });

    expect(masked).toBe(input);
    expect(masked[secretInput]).toEqual({
      defaultValue: "secret",
      redacted: false,
      value: "secret",
    });
    expect("secretValue" in input).toBe(false);
    expect("redacted" in input).toBe(false);
    expect(Object.getOwnPropertyDescriptor(input, secretInput)).toMatchObject({
      configurable: false,
      enumerable: false,
      writable: false,
    });
  });

  it("preserves an unfocused selection across presentation changes", () => {
    const input = createInput("a👩‍💻b");
    input.setSelectionRange(1, 2);

    state(input).redacted = false;

    expect(input.selectionStart).toBe(1);
    expect(input.selectionEnd).toBe(6);
  });

  it("maps revealed UTF-16 selections back to grapheme edits", () => {
    const input = createInput("a👩‍💻b");
    state(input).redacted = false;
    input.focus();
    input.setSelectionRange(1, 6);

    beforeInput(input, "insertText", "x");

    expect(state(input).value).toBe("axb");
    expect(input.value).toBe("axb");
    expect(input.selectionStart).toBe(2);
    expect(input.selectionEnd).toBe(2);
  });

  it("rejects unexpected DOM mutations while revealed", () => {
    const input = createInput("kept");
    state(input).redacted = false;

    input.value = "browser-filled";
    input.dispatchEvent(new InputEvent("input", { bubbles: true }));

    expect(state(input).value).toBe("kept");
    expect(input.value).toBe("kept");
  });

  it("restores presentation when the current redacted state is reaffirmed", () => {
    const input = createInput("kept");
    input.value = "browser-filled";

    state(input).redacted = true;

    expect(state(input).value).toBe("kept");
    expect(input.value).toBe("••••");
  });

  it("allows exporting and cutting a revealed selection", () => {
    const input = createInput("secret");
    state(input).redacted = false;
    input.focus();
    input.select();
    const copy = new Event("copy", { bubbles: true, cancelable: true });

    input.dispatchEvent(copy);
    beforeInput(input, "deleteByCut");

    expect(copy.defaultPrevented).toBe(false);
    expect(state(input).value).toBe("");
    expect(input.value).toBe("");
  });

  it("requests password-style IME handling where supported", () => {
    const setProperty = vi.spyOn(CSSStyleDeclaration.prototype, "setProperty");

    try {
      createInput();

      expect(setProperty).toHaveBeenCalledWith("ime-mode", "disabled");
    } finally {
      setProperty.mockRestore();
    }
  });

  it("primes masked-field heuristics without changing the presentation", () => {
    const valueSetter = vi.spyOn(HTMLInputElement.prototype, "value", "set");

    try {
      const input = createInput();

      expect(valueSetter.mock.calls).toEqual([["••"], [""]]);
      expect(state(input).value).toBe("");
      expect(input.value).toBe("");
    } finally {
      valueSetter.mockRestore();
    }
  });

  it("uses password-like text service defaults without overriding attributes", () => {
    const input = document.createElement("input");
    const configured = document.createElement("input");
    configured.setAttribute("autocapitalize", "words");
    configured.setAttribute("autocorrect", "on");
    configured.setAttribute("spellcheck", "true");

    mask(input);
    mask(configured);

    expect(input.getAttribute("autocapitalize")).toBe("off");
    expect(input.getAttribute("autocorrect")).toBe("off");
    expect(input.getAttribute("spellcheck")).toBe("false");
    expect(configured.getAttribute("autocapitalize")).toBe("words");
    expect(configured.getAttribute("autocorrect")).toBe("on");
    expect(configured.getAttribute("spellcheck")).toBe("true");
  });

  it("cancels composition when the browser permits it", () => {
    const input = createInput();
    const event = new CompositionEvent("compositionstart", {
      bubbles: true,
      cancelable: true,
    });

    input.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it("masks each input only once", () => {
    const input = createInput("first");
    const originalState = state(input);

    expect(mask(input, { value: "ignored" })).toBe(input);
    expect(mask(input)[secretInput]).toBe(originalState);
    expect(originalState.value).toBe("first");
  });

  it("updates the secret from explicit edits while inserting only masks", () => {
    const input = createInput();
    input.focus();

    const event = beforeInput(input, "insertText", "🔐");

    expect(event.defaultPrevented).toBe(true);
    expect(state(input).value).toBe("🔐");
    expect(input.value).toBe("•");
    expect(input.selectionStart).toBe(1);
  });

  it.each(["insertFromPasteAsQuotation", "insertFromYank"])("handles %s", (inputType) => {
    const input = createInput();
    input.focus();

    beforeInput(input, inputType, "inserted");

    expect(state(input).value).toBe("inserted");
    expect(input.value).toBe("••••••••");
  });

  it("edits selections using grapheme positions", () => {
    const input = createInput("a👩‍💻b");
    input.focus();
    input.setSelectionRange(1, 2);

    beforeInput(input, "insertText", "é");

    expect(state(input).value).toBe("aéb");
    expect(input.value).toBe("•••");
  });

  it.each([
    { inputType: "deleteContentBackward", start: 2, end: 2, expected: "a cd" },
    { inputType: "deleteContentForward", start: 2, end: 2, expected: "abcd" },
    { inputType: "deleteWordBackward", start: 5, end: 5, expected: "ab " },
    { inputType: "deleteWordForward", start: 0, end: 0, expected: " cd" },
    { inputType: "deleteContent", start: 1, end: 4, expected: "ad" },
    { inputType: "deleteByDrag", start: 1, end: 4, expected: "ad" },
    { inputType: "deleteHardLineBackward", start: 3, end: 3, expected: "cd" },
    { inputType: "deleteSoftLineBackward", start: 3, end: 3, expected: "cd" },
    { inputType: "deleteHardLineForward", start: 2, end: 2, expected: "ab" },
    { inputType: "deleteSoftLineForward", start: 2, end: 2, expected: "ab" },
    { inputType: "deleteEntireSoftLine", start: 2, end: 2, expected: "" },
  ])("handles $inputType", ({ end, expected, inputType, start }) => {
    const input = createInput("ab cd");
    input.focus();
    input.setSelectionRange(start, end);

    beforeInput(input, inputType);

    expect(state(input).value).toBe(expected);
    expect(input.value).toBe("•".repeat(Array.from(expected).length));
  });

  it.each(["copy", "cut", "dragstart"])("cancels %s like a concealed password field", (type) => {
    const input = createInput("secret");
    input.focus();
    input.select();
    const event = new Event(type, { bubbles: true, cancelable: true });

    input.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(state(input).value).toBe("secret");
    expect(input.value).toBe("••••••");
  });

  it("leaves the native context menu available", () => {
    const input = createInput("secret");
    const event = new Event("contextmenu", { bubbles: true, cancelable: true });

    input.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
  });

  it("does not honor a cut mutation after canceling clipboard export", () => {
    const input = createInput("secret");
    input.focus();
    input.select();

    beforeInput(input, "deleteByCut");

    expect(state(input).value).toBe("secret");
    expect(input.value).toBe("••••••");
  });

  it.each([
    { eventType: "paste", inputType: "insertFromPaste" },
    { eventType: "drop", inputType: "insertFromDrop" },
  ] as const)("uses $eventType data when beforeinput has none", ({ eventType, inputType }) => {
    const input = createInput();
    input.focus();

    dispatchTransfer(input, eventType, "pasted");
    beforeInput(input, inputType);

    expect(state(input).value).toBe("pasted");
    expect(input.value).toBe("••••••");
  });

  it("uses transfer data when input arrives without beforeinput", () => {
    const input = createInput();
    input.focus();

    dispatchTransfer(input, "paste", "pasted");
    input.value = "pasted";
    input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertFromPaste" }));

    expect(state(input).value).toBe("pasted");
    expect(input.value).toBe("••••••");
  });

  it("does not reuse transfer data after its edit opportunity expires", async () => {
    const input = createInput();
    input.focus();

    dispatchTransfer(input, "paste", "stale");
    await Promise.resolve();
    beforeInput(input, "insertFromPaste");

    expect(state(input).value).toBe("");
    expect(input.value).toBe("");
  });

  it("applies a non-cancelable edit from its beforeinput metadata", () => {
    const input = createInput();
    input.focus();

    beforeInput(input, "insertText", "x", false);
    input.value = "x";
    input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText" }));

    expect(state(input).value).toBe("x");
    expect(input.value).toBe("•");
  });

  it("does not reuse a non-cancelable edit after its input opportunity expires", async () => {
    const input = createInput();
    input.focus();

    beforeInput(input, "insertText", "stale", false);
    await Promise.resolve();
    input.value = "browser-filled";
    input.dispatchEvent(new InputEvent("input", { bubbles: true }));

    expect(state(input).value).toBe("");
    expect(input.value).toBe("");
  });

  it("keeps composition drafts out of the secret until commit", () => {
    const input = createInput();
    input.focus();

    input.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    beforeInput(input, "insertCompositionText", "n");
    expect(state(input).value).toBe("");
    expect(input.value).toBe("•");

    beforeInput(input, "insertCompositionText", "ni");
    expect(state(input).value).toBe("");
    expect(input.value).toBe("••");

    const compositionEnd = new CompositionEvent("compositionend", { bubbles: true });
    Object.defineProperty(compositionEnd, "data", { value: "你" });
    input.dispatchEvent(compositionEnd);
    beforeInput(input, "insertFromComposition", "你");

    expect(state(input).value).toBe("你");
    expect(input.value).toBe("•");
  });

  it("shows composition drafts without committing them while revealed", () => {
    const input = createInput();
    state(input).redacted = false;
    input.focus();

    input.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    beforeInput(input, "insertCompositionText", "ni");

    expect(state(input).value).toBe("");
    expect(input.value).toBe("ni");

    const compositionEnd = new CompositionEvent("compositionend", { bubbles: true });
    Object.defineProperty(compositionEnd, "data", { value: "你" });
    input.dispatchEvent(compositionEnd);

    expect(state(input).value).toBe("你");
    expect(input.value).toBe("你");
  });

  it("restores the selected text when composition is canceled", () => {
    const input = createInput("ab");
    const listener = vi.fn();
    input.addEventListener("input", listener);
    input.focus();
    input.setSelectionRange(1, 2);

    input.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    beforeInput(input, "insertCompositionText", "x");
    input.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true }));

    expect(state(input).value).toBe("ab");
    expect(input.value).toBe("••");
    expect(listener).not.toHaveBeenCalled();
  });

  it("commits composition once when insertFromComposition precedes compositionend", () => {
    const input = createInput("ab");
    const listener = vi.fn();
    input.addEventListener("input", listener);
    input.focus();
    input.setSelectionRange(1, 2);

    input.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    beforeInput(input, "insertCompositionText", "ni");
    beforeInput(input, "insertFromComposition", "你");
    const compositionEnd = new CompositionEvent("compositionend", { bubbles: true });
    Object.defineProperty(compositionEnd, "data", { value: "你" });
    input.dispatchEvent(compositionEnd);

    expect(state(input).value).toBe("a你");
    expect(input.value).toBe("••");
    expect(listener).toHaveBeenCalledOnce();
  });

  it("restores masks after a non-cancelable composition mutation without committing it", () => {
    const input = createInput();
    input.focus();

    input.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    beforeInput(input, "insertCompositionText", "密", false);
    input.value = "密";
    input.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        data: "密",
        inputType: "insertCompositionText",
      }),
    );

    expect(state(input).value).toBe("");
    expect(input.value).toBe("•");

    const compositionEnd = new CompositionEvent("compositionend", { bubbles: true });
    Object.defineProperty(compositionEnd, "data", { value: "密" });
    input.dispatchEvent(compositionEnd);

    expect(state(input).value).toBe("密");
    expect(input.value).toBe("•");
  });

  it("never adopts an uncommitted composition and discards it on blur", () => {
    const input = createInput("kept");
    input.focus();
    input.setSelectionRange(4, 4);
    input.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));

    for (const draft of ["h", "hha", "hhaha", "hhaha'hha'hha"]) {
      beforeInput(input, "insertCompositionText", draft, false);
      input.value = draft;
      input.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          data: draft,
          inputType: "insertCompositionText",
          isComposing: true,
        }),
      );

      expect(state(input).value).toBe("kept");
    }

    expect(input.value).toBe("•".repeat(17));
    input.blur();
    expect(state(input).value).toBe("kept");
    expect(input.value).toBe("••••");
  });

  it.each(["change", "input"])("does not adopt unexpected value mutations on %s", (type) => {
    const input = createInput();
    input.focus();
    beforeInput(input, "insertText", "a");
    const listener = vi.fn();
    input.addEventListener(type, listener);

    input.value = "browser-filled";
    input.dispatchEvent(
      type === "input"
        ? new InputEvent(type, { bubbles: true })
        : new Event(type, { bubbles: true }),
    );

    expect(state(input).value).toBe("a");
    expect(input.value).toBe("•");
    expect(listener).not.toHaveBeenCalled();
    input.removeEventListener(type, listener);

    beforeInput(input, "insertText", "b");
    beforeInput(input, "historyUndo");
    expect(state(input).value).toBe("a");
  });

  it("rejects browser-managed replacement input", () => {
    const input = createInput("kept");
    input.focus();
    input.select();

    beforeInput(input, "insertReplacementText", "autofilled");

    expect(state(input).value).toBe("kept");
    expect(input.value).toBe("••••");
  });

  it("ignores edits while readonly or disabled", () => {
    for (const property of ["readOnly", "disabled"] as const) {
      const input = createInput("kept");
      input[property] = true;
      input.focus();
      input.select();

      beforeInput(input, "insertText", "changed");

      expect(state(input).value).toBe("kept");
      expect(input.value).toBe("••••");
    }
  });

  it("limits edits by grapheme count", () => {
    const input = createInput();
    input.maxLength = 2;
    input.focus();

    beforeInput(input, "insertText", "a👩‍💻b");

    expect(state(input).value).toBe("a👩‍💻");
    expect(input.value).toBe("••");

    input.setSelectionRange(1, 2);
    beforeInput(input, "insertText", "bc");
    expect(state(input).value).toBe("ab");
    expect(input.value).toBe("••");
  });

  it("provides actual values to FormData", () => {
    const { form, input } = createFormInput("token");
    const masked = mask(input, { value: "submitted" });

    const formData = formDataFor(form);

    expect(masked[secretInput].value).toBe("submitted");
    expect(input.value).toBe("•••••••••");
    expect(formData.get("token")).toBe("submitted");
  });

  it("preserves duplicate names when every matching input is masked", () => {
    const form = document.createElement("form");
    const first = document.createElement("input");
    const second = document.createElement("input");
    first.name = "token";
    second.name = "token";
    form.append(first, second);
    document.body.append(form);
    mask(first, { value: "one" });
    mask(second, { value: "two" });

    expect(formDataFor(form).getAll("token")).toEqual(["one", "two"]);
  });

  it("omits disabled inputs from FormData", () => {
    const { form, input } = createFormInput("token");
    input.disabled = true;
    mask(input, { value: "secret" });

    expect(formDataFor(form).has("token")).toBe(false);
  });

  it("resets to the current default value without emitting input", async () => {
    const { form, input } = createFormInput();
    const currentState = mask(input, {
      defaultValue: "initial",
      value: "initial",
    })[secretInput];
    const listener = vi.fn();
    input.addEventListener("input", listener);
    currentState.defaultValue = "reset";
    currentState.value = "changed";

    form.reset();
    await Promise.resolve();

    expect(currentState.value).toBe("reset");
    expect(input.value).toBe("•••••");
    expect(listener).not.toHaveBeenCalled();
  });

  it("keeps the current value when form reset is canceled", async () => {
    const { form, input } = createFormInput();
    const currentState = mask(input, {
      defaultValue: "initial",
      value: "changed",
    })[secretInput];
    form.addEventListener("reset", (event) => event.preventDefault());

    form.dispatchEvent(new Event("reset", { bubbles: true, cancelable: true }));
    await Promise.resolve();

    expect(currentState.value).toBe("changed");
    expect(input.value).toBe("•••••••");
  });

  it("emits input for user edits but not property writes", () => {
    const input = createInput();
    const listener = vi.fn();
    input.addEventListener("input", listener);

    state(input).value = "quiet";
    expect(listener).not.toHaveBeenCalled();

    input.focus();
    beforeInput(input, "insertText", "!");
    expect(listener).toHaveBeenCalledOnce();
    expect(listener.mock.calls[0]?.[0]).toBeInstanceOf(InputEvent);
  });

  it("emits change on blur after a user edit", () => {
    const input = createInput();
    const listener = vi.fn();
    input.addEventListener("change", listener);
    input.focus();

    beforeInput(input, "insertText", "a");
    input.blur();

    expect(listener).toHaveBeenCalledOnce();
  });

  it("supports undo and redo without exposing plaintext", () => {
    const input = createInput();
    input.focus();

    beforeInput(input, "insertText", "ab");
    beforeInput(input, "deleteContentBackward");
    expect(state(input).value).toBe("a");

    beforeInput(input, "historyUndo");
    expect(state(input).value).toBe("ab");
    beforeInput(input, "historyRedo");
    expect(state(input).value).toBe("a");
    expect(input.value).toBe("•");
  });

  it("preserves history when application state accepts the current value", () => {
    const input = createInput();
    input.focus();

    beforeInput(input, "insertText", "a");
    state(input).value = "a";
    beforeInput(input, "historyUndo");

    expect(state(input).value).toBe("");
    expect(input.value).toBe("");
  });

  it("groups contiguous typing like one native undo transaction", () => {
    const input = createInput();
    input.focus();

    for (const character of ["a", "b", "c"]) {
      beforeInput(input, "insertText", character);
    }

    beforeInput(input, "historyUndo");
    expect(state(input).value).toBe("");
    expect(input.value).toBe("");

    beforeInput(input, "historyRedo");
    expect(state(input).value).toBe("abc");
    expect(input.value).toBe("•••");
  });

  it("groups contiguous backward deletion like one native undo transaction", () => {
    const input = createInput("abc");
    input.focus();
    input.setSelectionRange(3, 3);

    beforeInput(input, "deleteContentBackward");
    beforeInput(input, "deleteContentBackward");
    beforeInput(input, "historyUndo");

    expect(state(input).value).toBe("abc");
    expect(input.value).toBe("•••");
    expect(input.selectionStart).toBe(1);
    expect(input.selectionEnd).toBe(3);
  });

  it("groups contiguous forward deletion like one native undo transaction", () => {
    const input = createInput("abc");
    input.focus();
    input.setSelectionRange(0, 0);

    beforeInput(input, "deleteContentForward");
    beforeInput(input, "deleteContentForward");
    beforeInput(input, "historyUndo");

    expect(state(input).value).toBe("abc");
    expect(input.value).toBe("•••");
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(2);
  });

  it("starts a new undo transaction after caret navigation", () => {
    const input = createInput();
    input.focus();
    for (const character of ["a", "b", "c"]) {
      beforeInput(input, "insertText", character);
    }

    keyDown(input, "ArrowLeft");
    input.setSelectionRange(2, 2);
    beforeInput(input, "insertText", "x");
    beforeInput(input, "historyUndo");

    expect(state(input).value).toBe("abc");
    beforeInput(input, "historyUndo");
    expect(state(input).value).toBe("");
  });

  it("starts a new undo transaction after rejecting an unrelated edit", () => {
    const input = createInput();
    input.focus();
    beforeInput(input, "insertText", "a");
    beforeInput(input, "insertText", "b");

    beforeInput(input, "insertReplacementText", "rejected");
    beforeInput(input, "insertText", "c");
    beforeInput(input, "historyUndo");

    expect(state(input).value).toBe("ab");
    beforeInput(input, "historyUndo");
    expect(state(input).value).toBe("");
  });

  it("supports keyboard undo and redo without relying on the browser history stack", () => {
    const input = createInput();
    input.focus();
    beforeInput(input, "insertText", "ab");
    beforeInput(input, "deleteContentBackward");

    expect(keyDown(input, "z", { ctrlKey: true }).defaultPrevented).toBe(true);
    expect(state(input).value).toBe("ab");
    expect(keyDown(input, "y", { ctrlKey: true }).defaultPrevented).toBe(true);
    expect(state(input).value).toBe("a");
    expect(keyDown(input, "z", { ctrlKey: true }).defaultPrevented).toBe(true);
    expect(keyDown(input, "z", { metaKey: true, shiftKey: true }).defaultPrevented).toBe(true);
    expect(state(input).value).toBe("a");
    expect(input.value).toBe("•");
  });

  it("retains native labeling, focus, and ARIA attributes", () => {
    const label = document.createElement("label");
    const input = document.createElement("input");
    label.htmlFor = "token";
    input.id = "token";
    input.setAttribute("aria-describedby", "help");
    document.body.append(label, input);

    mask(input);
    input.focus();

    expect(label.control).toBe(input);
    expect(input.getAttribute("aria-describedby")).toBe("help");
    expect(document.activeElement).toBe(input);
  });

  it("retains native required validity", () => {
    const input = createInput();
    input.required = true;

    expect(input.validity.valueMissing).toBe(true);
    state(input).value = "present";
    expect(input.validity.valid).toBe(true);
  });
});
