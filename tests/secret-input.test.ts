import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { mask } from "../src/index.ts";
import type { SecretInput } from "../src/index.ts";
import { beforeInput, composition, formDataFor } from "./edit.ts";

function createInput(value = ""): SecretInput {
  const input = document.createElement("input");
  document.body.append(input);
  return mask(input, { value });
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
    expect(input.redacted).toBe(true);
    expect(input.secretValue).toBe("secret🔐");
    expect(input.value).toBe("•••••••");
    expect(input.getAttribute("value")).toBeNull();
    expect(input.value).not.toContain("secret");
  });

  it("discards DOM values written before the controller attaches", () => {
    const input = document.createElement("input");
    input.value = "browser-filled";

    const masked = mask(input, { value: "kept" });

    expect(masked.secretValue).toBe("kept");
    expect(masked.value).toBe("••••");
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

    input.redacted = false;

    expect(input.value).toBe("a👩‍💻b");
    expect(input.secretValue).toBe("a👩‍💻b");
    expect(input.selectionStart).toBe(1);
    expect(input.selectionEnd).toBe(6);
    expect(listener).not.toHaveBeenCalled();

    input.redacted = true;

    expect(input.value).toBe("•••");
    expect(input.selectionStart).toBe(1);
    expect(input.selectionEnd).toBe(2);
    expect(listener).not.toHaveBeenCalled();
  });

  it("accepts an initial revealed state", () => {
    const input = document.createElement("input");
    document.body.append(input);

    const revealed = mask(input, { redacted: false, value: "secret" });

    expect(revealed.redacted).toBe(false);
    expect(revealed.secretValue).toBe("secret");
    expect(input.value).toBe("secret");
  });

  it("uses defaultValue as the initial value when value is omitted", () => {
    const input = document.createElement("input");

    const currentState = mask(input, { defaultValue: "initial" });

    expect(currentState.secretValue).toBe("initial");
    expect(currentState.defaultSecretValue).toBe("initial");
    expect(input.value).toBe("•••••••");
  });

  it("applies native single-line value sanitization", () => {
    const input = mask(document.createElement("input"), {
      defaultValue: "de\r\nfault",
      value: "a\nb\rc",
    });

    expect(input.secretValue).toBe("abc");
    expect(input.defaultSecretValue).toBe("default");

    input.secretValue = "x\r\ny";
    input.defaultSecretValue = "r\neset";
    expect(input.secretValue).toBe("xy");
    expect(input.defaultSecretValue).toBe("reset");

    input.secretValue = "";
    beforeInput(input, "insertText", "a\r\nb");
    expect(input.secretValue).toBe("ab");
  });

  it("returns the native input with non-enumerable secret properties", () => {
    const input = document.createElement("input");

    const masked = mask(input, { redacted: false, value: "secret" });

    expect(masked).toBe(input);
    expect(masked.secretValue).toBe("secret");
    expect(masked.defaultSecretValue).toBe("secret");
    expect(masked.redacted).toBe(false);
    expect(Object.getOwnPropertyDescriptor(input, "secretValue")).toMatchObject({
      configurable: false,
      enumerable: false,
      get: expect.any(Function),
      set: expect.any(Function),
    });
  });

  it("preserves an unfocused selection across presentation changes", () => {
    const input = createInput("a👩‍💻b");
    input.setSelectionRange(1, 2);

    input.redacted = false;

    expect(input.selectionStart).toBe(1);
    expect(input.selectionEnd).toBe(6);
  });

  it("maps revealed UTF-16 selections back to grapheme edits", () => {
    const input = createInput("a👩‍💻b");
    input.redacted = false;
    input.focus();
    input.setSelectionRange(1, 6);

    beforeInput(input, "insertText", "x");

    expect(input.secretValue).toBe("axb");
    expect(input.value).toBe("axb");
    expect(input.selectionStart).toBe(2);
    expect(input.selectionEnd).toBe(2);
  });

  it("rejects unexpected DOM mutations while revealed", () => {
    const input = createInput("kept");
    input.redacted = false;

    input.value = "browser-filled";
    input.dispatchEvent(new InputEvent("input", { bubbles: true }));

    expect(input.secretValue).toBe("kept");
    expect(input.value).toBe("kept");
  });

  it("restores presentation when the current redacted state is reaffirmed", () => {
    const input = createInput("kept");
    input.value = "browser-filled";

    input.redacted = true;

    expect(input.secretValue).toBe("kept");
    expect(input.value).toBe("••••");
  });

  it("allows exporting and cutting a revealed selection", () => {
    const input = createInput("secret");
    input.redacted = false;
    input.focus();
    input.select();
    const copy = new Event("copy", { bubbles: true, cancelable: true });

    input.dispatchEvent(copy);
    beforeInput(input, "deleteByCut");

    expect(copy.defaultPrevented).toBe(false);
    expect(input.secretValue).toBe("");
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
      expect(input.secretValue).toBe("");
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
    const originalInput = input;

    expect(mask(input, { value: "ignored" })).toBe(input);
    expect(mask(input)).toBe(originalInput);
    expect(input.secretValue).toBe("first");
  });

  it("updates the secret from explicit edits while inserting only masks", () => {
    const input = createInput();
    input.focus();

    const event = beforeInput(input, "insertText", "🔐");

    expect(event.defaultPrevented).toBe(true);
    expect(input.secretValue).toBe("🔐");
    expect(input.value).toBe("•");
    expect(input.selectionStart).toBe(1);
  });

  it.each(["é", "e\u0301", "🔐", "👩‍💻", "👍🏽", "🇨🇳"])(
    "preserves %s as one masked editing unit",
    (value) => {
      const input = createInput();
      input.focus();

      beforeInput(input, "insertText", value);

      expect(input.secretValue).toBe(value);
      expect(input.value).toBe("•");
      expect(input.selectionStart).toBe(1);
    },
  );

  it.each(["insertFromPasteAsQuotation", "insertFromYank"])("handles %s", (inputType) => {
    const input = createInput();
    input.focus();

    beforeInput(input, inputType, "inserted");

    expect(input.secretValue).toBe("inserted");
    expect(input.value).toBe("••••••••");
  });

  it("edits selections using grapheme positions", () => {
    const input = createInput("a👩‍💻b");
    input.focus();
    input.setSelectionRange(1, 2);

    beforeInput(input, "insertText", "é");

    expect(input.secretValue).toBe("aéb");
    expect(input.value).toBe("•••");
  });

  it.each(["deleteContentBackward", "deleteContentForward"])(
    "does not split a grapheme during %s",
    (inputType) => {
      const input = createInput("a👩‍💻b");
      input.focus();
      const caret = inputType === "deleteContentBackward" ? 2 : 1;
      input.setSelectionRange(caret, caret);

      beforeInput(input, inputType);

      expect(input.secretValue).toBe("ab");
      expect(input.value).toBe("••");
    },
  );

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

    expect(input.secretValue).toBe(expected);
    expect(input.value).toBe("•".repeat(Array.from(expected).length));
  });

  it.each(["copy", "cut", "dragstart"])("cancels %s like a concealed password field", (type) => {
    const input = createInput("secret");
    input.focus();
    input.select();
    const event = new Event(type, { bubbles: true, cancelable: true });

    input.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(input.secretValue).toBe("secret");
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

    expect(input.secretValue).toBe("secret");
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

    expect(input.secretValue).toBe("pasted");
    expect(input.value).toBe("••••••");
  });

  it("uses transfer data when input arrives without beforeinput", () => {
    const input = createInput();
    input.focus();

    dispatchTransfer(input, "paste", "pasted");
    input.value = "pasted";
    input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertFromPaste" }));

    expect(input.secretValue).toBe("pasted");
    expect(input.value).toBe("••••••");
  });

  it("does not reuse transfer data after its edit opportunity expires", async () => {
    const input = createInput();
    input.focus();

    dispatchTransfer(input, "paste", "stale");
    await Promise.resolve();
    beforeInput(input, "insertFromPaste");

    expect(input.secretValue).toBe("");
    expect(input.value).toBe("");
  });

  it("applies a non-cancelable edit from its beforeinput metadata", () => {
    const input = createInput();
    input.focus();

    beforeInput(input, "insertText", "x", false);
    input.value = "x";
    input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText" }));

    expect(input.secretValue).toBe("x");
    expect(input.value).toBe("•");
  });

  it("does not reuse a non-cancelable edit after its input opportunity expires", async () => {
    const input = createInput();
    input.focus();

    beforeInput(input, "insertText", "stale", false);
    await Promise.resolve();
    input.value = "browser-filled";
    input.dispatchEvent(new InputEvent("input", { bubbles: true }));

    expect(input.secretValue).toBe("");
    expect(input.value).toBe("");
  });

  it("keeps composition drafts out of the secret until commit", () => {
    const input = createInput();
    input.focus();

    composition(input, "compositionstart");
    beforeInput(input, "insertCompositionText", "n");
    expect(input.secretValue).toBe("");
    expect(input.value).toBe("•");

    beforeInput(input, "insertCompositionText", "ni");
    expect(input.secretValue).toBe("");
    expect(input.value).toBe("••");

    composition(input, "compositionend", "你");
    beforeInput(input, "insertFromComposition", "你");

    expect(input.secretValue).toBe("你");
    expect(input.value).toBe("•");
  });

  it("shows composition drafts without committing them while revealed", () => {
    const input = createInput();
    input.redacted = false;
    input.focus();

    composition(input, "compositionstart");
    beforeInput(input, "insertCompositionText", "ni");

    expect(input.secretValue).toBe("");
    expect(input.value).toBe("ni");

    composition(input, "compositionend", "你");

    expect(input.secretValue).toBe("你");
    expect(input.value).toBe("你");
  });

  it("segments composition drafts together with surrounding text", () => {
    const input = createInput("a");
    input.focus();
    input.setSelectionRange(1, 1);

    composition(input, "compositionstart");
    beforeInput(input, "insertCompositionText", "\u0301");

    expect(input.secretValue).toBe("a");
    expect(input.value).toBe("•");

    composition(input, "compositionend", "\u0301");

    expect(input.secretValue).toBe("a\u0301");
    expect(input.value).toBe("•");
  });

  it("restores the selected text when composition is canceled", () => {
    const input = createInput("ab");
    const listener = vi.fn();
    input.addEventListener("input", listener);
    input.focus();
    input.setSelectionRange(1, 2);

    composition(input, "compositionstart");
    beforeInput(input, "insertCompositionText", "x");
    composition(input, "compositionend");

    expect(input.secretValue).toBe("ab");
    expect(input.value).toBe("••");
    expect(listener).not.toHaveBeenCalled();
  });

  it("commits composition once when insertFromComposition precedes compositionend", () => {
    const input = createInput("ab");
    const listener = vi.fn();
    input.addEventListener("input", listener);
    input.focus();
    input.setSelectionRange(1, 2);

    composition(input, "compositionstart");
    beforeInput(input, "insertCompositionText", "ni");
    beforeInput(input, "insertFromComposition", "你");
    composition(input, "compositionend", "你");

    expect(input.secretValue).toBe("a你");
    expect(input.value).toBe("••");
    expect(listener).toHaveBeenCalledOnce();
  });

  it("restores masks after a non-cancelable composition mutation without committing it", () => {
    const input = createInput();
    input.focus();

    composition(input, "compositionstart");
    beforeInput(input, "insertCompositionText", "密", false);
    input.value = "密";
    input.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        data: "密",
        inputType: "insertCompositionText",
      }),
    );

    expect(input.secretValue).toBe("");
    expect(input.value).toBe("•");

    composition(input, "compositionend", "密");

    expect(input.secretValue).toBe("密");
    expect(input.value).toBe("•");
  });

  it("never adopts an uncommitted composition and discards it on blur", () => {
    const input = createInput("kept");
    input.focus();
    input.setSelectionRange(4, 4);
    composition(input, "compositionstart");

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

      expect(input.secretValue).toBe("kept");
    }

    expect(input.value).toBe("•".repeat(17));
    input.blur();
    expect(input.secretValue).toBe("kept");
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

    expect(input.secretValue).toBe("a");
    expect(input.value).toBe("•");
    expect(listener).not.toHaveBeenCalled();
    input.removeEventListener(type, listener);

    beforeInput(input, "insertText", "b");
    beforeInput(input, "historyUndo");
    expect(input.secretValue).toBe("a");
  });

  it("rejects browser-managed replacement input", () => {
    const input = createInput("kept");
    input.focus();
    input.select();

    beforeInput(input, "insertReplacementText", "autofilled");

    expect(input.secretValue).toBe("kept");
    expect(input.value).toBe("••••");
  });

  it("ignores edits while readonly or disabled", () => {
    for (const property of ["readOnly", "disabled"] as const) {
      const input = createInput("kept");
      input[property] = true;
      input.focus();
      input.select();

      beforeInput(input, "insertText", "changed");

      expect(input.secretValue).toBe("kept");
      expect(input.value).toBe("••••");
    }
  });

  it("applies maxlength in UTF-16 code units without splitting graphemes", () => {
    const input = createInput();
    input.maxLength = 6;
    input.focus();

    beforeInput(input, "insertText", "a👩‍💻b");

    expect(input.secretValue).toBe("a👩‍💻");
    expect(input.value).toBe("••");

    input.setSelectionRange(1, 2);
    beforeInput(input, "insertText", "bc");
    expect(input.secretValue).toBe("abc");
    expect(input.value).toBe("•••");

    input.secretValue = "";
    input.maxLength = 1;
    beforeInput(input, "insertText", "🔐");
    expect(input.secretValue).toBe("");
    expect(input.value).toBe("");

    input.secretValue = "🔐";
    expect(input.secretValue).toBe("🔐");
    expect(input.value).toBe("•");
  });

  it("provides actual values to FormData", () => {
    const { form, input } = createFormInput("token");
    const masked = mask(input, { value: "submitted🔐" });

    const formData = formDataFor(form);

    expect(masked.secretValue).toBe("submitted🔐");
    expect(input.value).toBe("••••••••••");
    expect(formData.get("token")).toBe("submitted🔐");
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
    });
    const listener = vi.fn();
    input.addEventListener("input", listener);
    currentState.defaultSecretValue = "reset";
    currentState.secretValue = "changed";

    form.reset();
    await Promise.resolve();

    expect(currentState.secretValue).toBe("reset");
    expect(input.value).toBe("•••••");
    expect(listener).not.toHaveBeenCalled();
  });

  it("keeps the current value when form reset is canceled", async () => {
    const { form, input } = createFormInput();
    const currentState = mask(input, {
      defaultValue: "initial",
      value: "changed",
    });
    form.addEventListener("reset", (event) => event.preventDefault());

    form.dispatchEvent(new Event("reset", { bubbles: true, cancelable: true }));
    await Promise.resolve();

    expect(currentState.secretValue).toBe("changed");
    expect(input.value).toBe("•••••••");
  });

  it("emits input for user edits but not property writes", () => {
    const input = createInput();
    const listener = vi.fn();
    input.addEventListener("input", listener);

    input.secretValue = "quiet";
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
    expect(input.secretValue).toBe("a");

    beforeInput(input, "historyUndo");
    expect(input.secretValue).toBe("ab");
    beforeInput(input, "historyRedo");
    expect(input.secretValue).toBe("a");
    expect(input.value).toBe("•");
  });

  it("preserves history when application state accepts the current value", () => {
    const input = createInput();
    input.focus();

    beforeInput(input, "insertText", "a");
    input.secretValue = "a";
    beforeInput(input, "historyUndo");

    expect(input.secretValue).toBe("");
    expect(input.value).toBe("");
  });

  it("groups contiguous typing like one native undo transaction", () => {
    const input = createInput();
    input.focus();

    for (const character of ["a", "b", "c"]) {
      beforeInput(input, "insertText", character);
    }

    beforeInput(input, "historyUndo");
    expect(input.secretValue).toBe("");
    expect(input.value).toBe("");

    beforeInput(input, "historyRedo");
    expect(input.secretValue).toBe("abc");
    expect(input.value).toBe("•••");
  });

  it("groups contiguous backward deletion and restores the original caret", () => {
    const input = createInput("abc");
    input.focus();
    input.setSelectionRange(3, 3);

    beforeInput(input, "deleteContentBackward");
    beforeInput(input, "deleteContentBackward");
    beforeInput(input, "historyUndo");

    expect(input.secretValue).toBe("abc");
    expect(input.value).toBe("•••");
    expect(input.selectionStart).toBe(3);
    expect(input.selectionEnd).toBe(3);
  });

  it("groups contiguous forward deletion and restores the original caret", () => {
    const input = createInput("abc");
    input.focus();
    input.setSelectionRange(0, 0);

    beforeInput(input, "deleteContentForward");
    beforeInput(input, "deleteContentForward");
    beforeInput(input, "historyUndo");

    expect(input.secretValue).toBe("abc");
    expect(input.value).toBe("•••");
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(0);
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

    expect(input.secretValue).toBe("abc");
    beforeInput(input, "historyUndo");
    expect(input.secretValue).toBe("");
  });

  it("starts a new undo transaction after rejecting an unrelated edit", () => {
    const input = createInput();
    input.focus();
    beforeInput(input, "insertText", "a");
    beforeInput(input, "insertText", "b");

    beforeInput(input, "insertReplacementText", "rejected");
    beforeInput(input, "insertText", "c");
    beforeInput(input, "historyUndo");

    expect(input.secretValue).toBe("ab");
    beforeInput(input, "historyUndo");
    expect(input.secretValue).toBe("");
  });

  it("supports keyboard undo and redo without relying on the browser history stack", () => {
    const input = createInput();
    input.focus();
    beforeInput(input, "insertText", "ab");
    beforeInput(input, "deleteContentBackward");

    expect(keyDown(input, "z", { ctrlKey: true }).defaultPrevented).toBe(true);
    expect(input.secretValue).toBe("ab");
    expect(keyDown(input, "y", { ctrlKey: true }).defaultPrevented).toBe(true);
    expect(input.secretValue).toBe("a");
    expect(keyDown(input, "z", { ctrlKey: true }).defaultPrevented).toBe(true);
    expect(keyDown(input, "z", { metaKey: true, shiftKey: true }).defaultPrevented).toBe(true);
    expect(input.secretValue).toBe("a");
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
    input.secretValue = "present";
    expect(input.validity.valid).toBe(true);
  });
  it.each([true, false])(
    "keeps the caret at joined grapheme boundaries (redacted=%s)",
    (redacted) => {
      const input = createInput("ab");
      input.redacted = redacted;
      input.setSelectionRange(1, 1);

      beforeInput(input, "insertText", "\u0301");
      expect(input.secretValue).toBe("a\u0301b");
      expect(input.selectionStart).toBe(redacted ? 1 : 2);
      beforeInput(input, "insertText", "x");
      expect(input.secretValue).toBe("a\u0301xb");
      beforeInput(input, "historyUndo");
      expect(input.secretValue).toBe("ab");
    },
  );

  it("preserves backward selection when revealing and redacting", () => {
    const input = createInput("a👩‍💻b");
    input.setSelectionRange(1, 2, "backward");
    input.redacted = false;
    expect(input.selectionDirection).toBe("backward");
    input.redacted = true;
    expect(input.selectionDirection).toBe("backward");
  });

  it("does not reuse paste data for an unrelated edit in the same task", () => {
    const input = createInput();
    dispatchTransfer(input, "paste", "stale");
    beforeInput(input, "insertText", "x");
    expect(input.secretValue).toBe("x");
  });

  it("rejects an input whose type does not match pending metadata", () => {
    const input = createInput("kept");
    input.select();
    beforeInput(input, "insertText", "stale", false);
    input.value = "browser-filled";
    input.dispatchEvent(new InputEvent("input", { inputType: "insertReplacementText" }));
    expect(input.secretValue).toBe("kept");
    expect(input.value).toBe("••••");
  });

  it("does not delete a selection when insertion data is unavailable", () => {
    const input = createInput("kept");
    input.select();
    beforeInput(input, "insertFromPaste");
    expect(input.secretValue).toBe("kept");
  });

  it("respects beforeinput canceled by the application", () => {
    const input = createInput("kept");
    input.select();
    input.addEventListener("beforeinput", (event) => event.preventDefault(), { capture: true });
    beforeInput(input, "insertText", "rejected");
    expect(input.secretValue).toBe("kept");
  });

  it("preserves a composition draft when the current value is reaffirmed", () => {
    const input = createInput("ab");
    input.setSelectionRange(1, 2);
    composition(input, "compositionstart");
    beforeInput(input, "insertCompositionText", "ni");
    input.secretValue = "ab";
    expect(input.value).toBe("•••");
    composition(input, "compositionend", "你");
    expect(input.secretValue).toBe("a你");
  });

  it.each(["readOnly", "disabled"] as const)(
    "does not commit composition after becoming %s",
    (property) => {
      const input = createInput("ab");
      input.setSelectionRange(1, 2);
      composition(input, "compositionstart");
      beforeInput(input, "insertCompositionText", "ni");
      input[property] = true;
      composition(input, "compositionend", "你");
      expect(input.secretValue).toBe("ab");
      expect(input.value).toBe("••");
    },
  );

  it.each(["detached", "shadow"])("participates in %s forms", async (location) => {
    const form = document.createElement("form");
    const input = document.createElement("input");
    input.name = "token";
    form.append(input);
    if (location === "shadow") {
      const host = document.createElement("div");
      document.body.append(host);
      host.attachShadow({ mode: "open" }).append(form);
    }
    const masked = mask(input, { value: "changed", defaultValue: "initial" });
    expect(formDataFor(form).get("token")).toBe("changed");
    form.reset();
    await Promise.resolve();
    expect(masked.secretValue).toBe("initial");
  });
  it("rejects unrelated DOM events dispatched inside an accepted input callback", () => {
    const input = createInput();
    const received: string[] = [];
    input.addEventListener("input", () => {
      received.push(input.value);
      if (received.length === 1) {
        input.value = "browser-filled";
        input.dispatchEvent(new InputEvent("input", { bubbles: true }));
      }
    });
    beforeInput(input, "insertText", "x");
    expect(received).toEqual(["•"]);
    expect(input.value).toBe("•");
    expect(input.secretValue).toBe("x");
  });

  it("filters rejected input before listeners installed prior to masking", () => {
    const input = document.createElement("input");
    const listener = vi.fn();
    input.addEventListener("input", listener);
    mask(input, { value: "kept" });
    input.value = "browser-filled";
    input.dispatchEvent(new InputEvent("input"));
    expect(listener).not.toHaveBeenCalled();
    expect(input.value).toBe("••••");
  });

  it("does not reuse a canceled transfer even within the same task", () => {
    const input = createInput("kept");
    input.select();
    input.addEventListener("paste", (event) => event.preventDefault());
    const event = new Event("paste", { cancelable: true });
    Object.defineProperty(event, "clipboardData", { value: { getData: () => "rejected" } });
    input.dispatchEvent(event);
    input.dispatchEvent(new InputEvent("input", { inputType: "insertFromPaste" }));
    expect(input.secretValue).toBe("kept");
  });

  it("does not retain a canceled composition as active editing state", () => {
    const input = createInput();
    const listener = vi.fn();
    input.addEventListener("input", listener);
    input.dispatchEvent(new CompositionEvent("compositionstart", { cancelable: true }));
    beforeInput(input, "insertText", "x");
    expect(listener.mock.calls[0]?.[0].isComposing).toBe(false);
  });

  it("discards a composition on reset even when the secret already equals its default", async () => {
    const { form, input } = createFormInput();
    const masked = mask(input, { value: "ab" });
    input.setSelectionRange(1, 2);
    composition(input, "compositionstart");
    beforeInput(input, "insertCompositionText", "draft");
    form.reset();
    await Promise.resolve();
    composition(input, "compositionend", "ignored");
    expect(masked.secretValue).toBe("ab");
    expect(input.value).toBe("••");
  });
  it("prefers the current beforeinput over older non-cancelable metadata", () => {
    const input = createInput();
    beforeInput(input, "insertText", "stale", false);
    beforeInput(input, "insertText", "fresh");
    expect(input.secretValue).toBe("fresh");
  });
});
