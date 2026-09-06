import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { createSecretInput } from "../src/index.ts";
import type { SecretInputController } from "../src/index.ts";
import { beforeInput, composition, formDataFor } from "./edit.ts";

function createInput(value = ""): SecretInputController {
  const input = document.createElement("input");
  document.body.append(input);
  return createSecretInput(input, { value });
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

describe("createSecretInput", () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it("keeps the secret separate from the native value", () => {
    const field = createInput("secret🔐");
    const { input } = field;

    expect(input.type).toBe("text");
    expect(field.revealed).toBe(false);
    expect(field.value).toBe("secret🔐");
    expect(input.value).toBe("•••••••");
    expect(input.getAttribute("value")).toBeNull();
    expect(input.value).not.toContain("secret");
  });

  it("discards DOM values written before the controller attaches", () => {
    const input = document.createElement("input");
    input.value = "browser-filled";

    const masked = createSecretInput(input, { value: "kept" });

    expect(masked.value).toBe("kept");
    expect(input.value).toBe("••••");
  });

  it("normalizes the editing surface to a text input", () => {
    const input = document.createElement("input");
    input.type = "password";

    createSecretInput(input);

    expect(input.type).toBe("text");
  });

  it("asks native and third-party password managers to ignore the input", () => {
    const input = document.createElement("input");
    input.autocomplete = "current-password";
    input.setAttribute("data-form-type", "password");

    createSecretInput(input);

    expect(input.autocomplete).toBe("off");
    expect(input.getAttribute("data-1p-ignore")).toBe("");
    expect(input.getAttribute("data-bwignore")).toBe("true");
    expect(input.getAttribute("data-form-type")).toBe("other");
    expect(input.getAttribute("data-lpignore")).toBe("true");
    expect(input.getAttribute("data-protonpass-ignore")).toBe("true");
  });

  it("reveals and redacts without changing the secret or emitting input", () => {
    const field = createInput("a👩‍💻b");
    const { input } = field;
    const listener = vi.fn();
    input.addEventListener("input", listener);
    input.focus();
    input.setSelectionRange(1, 2);

    field.update({ revealed: true });

    expect(input.value).toBe("a👩‍💻b");
    expect(field.value).toBe("a👩‍💻b");
    expect(input.selectionStart).toBe(1);
    expect(input.selectionEnd).toBe(6);
    expect(listener).not.toHaveBeenCalled();

    field.update({ revealed: false });

    expect(input.value).toBe("•••");
    expect(input.selectionStart).toBe(1);
    expect(input.selectionEnd).toBe(2);
    expect(listener).not.toHaveBeenCalled();
  });

  it("accepts an initial revealed state", () => {
    const input = document.createElement("input");
    document.body.append(input);

    const revealed = createSecretInput(input, { revealed: true, value: "secret" });

    expect(revealed.revealed).toBe(true);
    expect(revealed.value).toBe("secret");
    expect(input.value).toBe("secret");
  });

  it("uses defaultValue as the initial value when value is omitted", () => {
    const input = document.createElement("input");

    const currentState = createSecretInput(input, { defaultValue: "initial" });

    expect(currentState.value).toBe("initial");
    expect(currentState.defaultValue).toBe("initial");
    expect(input.value).toBe("•••••••");
  });

  it("applies native single-line value sanitization", () => {
    const field = createSecretInput(document.createElement("input"), {
      defaultValue: "de\r\nfault",
      value: "a\nb\rc",
    });
    const { input } = field;

    expect(field.value).toBe("abc");
    expect(field.defaultValue).toBe("default");

    field.update({ value: "x\r\ny" });
    field.update({ defaultValue: "r\neset" });
    expect(field.value).toBe("xy");
    expect(field.defaultValue).toBe("reset");

    field.update({ value: "" });
    beforeInput(input, "insertText", "a\r\nb");
    expect(field.value).toBe("ab");
  });

  it("returns a controller without extending the native input", () => {
    const input = document.createElement("input");
    const nativeMethod = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "setCustomValidity",
    );
    const field = createSecretInput(input, { revealed: true, value: "secret" });

    expect(field).not.toBe(input);
    expect(field.input).toBe(input);
    expect(field.value).toBe("secret");
    expect(field.defaultValue).toBe("secret");
    expect(field.revealed).toBe(true);
    for (const name of ["secretValue", "defaultSecretValue", "revealed", "setCustomValidity"]) {
      expect(Object.hasOwn(input, name)).toBe(false);
    }
    expect(
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "setCustomValidity"),
    ).toEqual(nativeMethod);
  });

  it("preserves an unfocused selection across presentation changes", () => {
    const field = createInput("a👩‍💻b");
    const { input } = field;
    input.setSelectionRange(1, 2);

    field.update({ revealed: true });

    expect(input.selectionStart).toBe(1);
    expect(input.selectionEnd).toBe(6);
  });

  it("maps revealed UTF-16 selections back to grapheme edits", () => {
    const field = createInput("a👩‍💻b");
    const { input } = field;
    field.update({ revealed: true });
    input.focus();
    input.setSelectionRange(1, 6);

    beforeInput(input, "insertText", "x");

    expect(field.value).toBe("axb");
    expect(input.value).toBe("axb");
    expect(input.selectionStart).toBe(2);
    expect(input.selectionEnd).toBe(2);
  });

  it("rejects unexpected DOM mutations while revealed", () => {
    const field = createInput("kept");
    const { input } = field;
    field.update({ revealed: true });

    input.value = "browser-filled";
    input.dispatchEvent(new InputEvent("input", { bubbles: true }));

    expect(field.value).toBe("kept");
    expect(input.value).toBe("kept");
  });

  it("restores presentation when the current redacted state is reaffirmed", () => {
    const field = createInput("kept");
    const { input } = field;
    input.value = "browser-filled";

    field.update({ revealed: false });

    expect(field.value).toBe("kept");
    expect(input.value).toBe("••••");
  });

  it("allows exporting and cutting a revealed selection", () => {
    const field = createInput("secret");
    const { input } = field;
    field.update({ revealed: true });
    input.focus();
    input.select();
    const copy = new Event("copy", { bubbles: true, cancelable: true });

    input.dispatchEvent(copy);
    beforeInput(input, "deleteByCut");

    expect(copy.defaultPrevented).toBe(false);
    expect(field.value).toBe("");
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
      const field = createInput();
      const { input } = field;

      expect(valueSetter.mock.calls).toEqual([["••"], [""]]);
      expect(field.value).toBe("");
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

    createSecretInput(input);
    createSecretInput(configured);

    expect(input.getAttribute("autocapitalize")).toBe("off");
    expect(input.getAttribute("autocorrect")).toBe("off");
    expect(input.getAttribute("spellcheck")).toBe("false");
    expect(configured.getAttribute("autocapitalize")).toBe("words");
    expect(configured.getAttribute("autocorrect")).toBe("on");
    expect(configured.getAttribute("spellcheck")).toBe("true");
  });

  it("cancels composition when the browser permits it", () => {
    const field = createInput();
    const { input } = field;
    const event = new CompositionEvent("compositionstart", {
      bubbles: true,
      cancelable: true,
    });

    input.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it("masks each input only once", () => {
    const field = createInput("first");
    const { input } = field;
    const originalInput = input;

    expect(createSecretInput(input, { value: "ignored" })).toBe(field);
    expect(createSecretInput(input).input).toBe(originalInput);
    expect(field.value).toBe("first");
  });

  it("updates the secret from explicit edits while inserting only masks", () => {
    const field = createInput();
    const { input } = field;
    input.focus();

    const event = beforeInput(input, "insertText", "🔐");

    expect(event.defaultPrevented).toBe(true);
    expect(field.value).toBe("🔐");
    expect(input.value).toBe("•");
    expect(input.selectionStart).toBe(1);
  });

  it.each(["é", "e\u0301", "🔐", "👩‍💻", "👍🏽", "🇨🇳"])(
    "preserves %s as one masked editing unit",
    (value) => {
      const field = createInput();
      const { input } = field;
      input.focus();

      beforeInput(input, "insertText", value);

      expect(field.value).toBe(value);
      expect(input.value).toBe("•");
      expect(input.selectionStart).toBe(1);
    },
  );

  it.each(["insertFromPasteAsQuotation", "insertFromYank"])("handles %s", (inputType) => {
    const field = createInput();
    const { input } = field;
    input.focus();

    beforeInput(input, inputType, "inserted");

    expect(field.value).toBe("inserted");
    expect(input.value).toBe("••••••••");
  });

  it("edits selections using grapheme positions", () => {
    const field = createInput("a👩‍💻b");
    const { input } = field;
    input.focus();
    input.setSelectionRange(1, 2);

    beforeInput(input, "insertText", "é");

    expect(field.value).toBe("aéb");
    expect(input.value).toBe("•••");
  });

  it.each(["deleteContentBackward", "deleteContentForward"])(
    "does not split a grapheme during %s",
    (inputType) => {
      const field = createInput("a👩‍💻b");
      const { input } = field;
      input.focus();
      const caret = inputType === "deleteContentBackward" ? 2 : 1;
      input.setSelectionRange(caret, caret);

      beforeInput(input, inputType);

      expect(field.value).toBe("ab");
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
    const field = createInput("ab cd");
    const { input } = field;
    input.focus();
    input.setSelectionRange(start, end);

    beforeInput(input, inputType);

    expect(field.value).toBe(expected);
    expect(input.value).toBe("•".repeat(Array.from(expected).length));
  });

  it.each(["copy", "cut", "dragstart"])("cancels %s like a concealed password field", (type) => {
    const field = createInput("secret");
    const { input } = field;
    input.focus();
    input.select();
    const event = new Event(type, { bubbles: true, cancelable: true });

    input.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(field.value).toBe("secret");
    expect(input.value).toBe("••••••");
  });

  it("leaves the native context menu available", () => {
    const field = createInput("secret");
    const { input } = field;
    const event = new Event("contextmenu", { bubbles: true, cancelable: true });

    input.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
  });

  it("does not honor a cut mutation after canceling clipboard export", () => {
    const field = createInput("secret");
    const { input } = field;
    input.focus();
    input.select();

    beforeInput(input, "deleteByCut");

    expect(field.value).toBe("secret");
    expect(input.value).toBe("••••••");
  });

  it.each([
    { eventType: "paste", inputType: "insertFromPaste" },
    { eventType: "drop", inputType: "insertFromDrop" },
  ] as const)("uses $eventType data when beforeinput has none", ({ eventType, inputType }) => {
    const field = createInput();
    const { input } = field;
    input.focus();

    dispatchTransfer(input, eventType, "pasted");
    beforeInput(input, inputType);

    expect(field.value).toBe("pasted");
    expect(input.value).toBe("••••••");
  });

  it("uses transfer data when input arrives without beforeinput", () => {
    const field = createInput();
    const { input } = field;
    input.focus();

    dispatchTransfer(input, "paste", "pasted");
    input.value = "pasted";
    input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertFromPaste" }));

    expect(field.value).toBe("pasted");
    expect(input.value).toBe("••••••");
  });

  it("does not reuse transfer data after its edit opportunity expires", async () => {
    const field = createInput();
    const { input } = field;
    input.focus();

    dispatchTransfer(input, "paste", "stale");
    await Promise.resolve();
    beforeInput(input, "insertFromPaste");

    expect(field.value).toBe("");
    expect(input.value).toBe("");
  });

  it("applies a non-cancelable edit from its beforeinput metadata", () => {
    const field = createInput();
    const { input } = field;
    input.focus();

    beforeInput(input, "insertText", "x", false);
    input.value = "x";
    input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText" }));

    expect(field.value).toBe("x");
    expect(input.value).toBe("•");
  });

  it("does not reuse a non-cancelable edit after its input opportunity expires", async () => {
    const field = createInput();
    const { input } = field;
    input.focus();

    beforeInput(input, "insertText", "stale", false);
    await Promise.resolve();
    input.value = "browser-filled";
    input.dispatchEvent(new InputEvent("input", { bubbles: true }));

    expect(field.value).toBe("");
    expect(input.value).toBe("");
  });

  it("keeps composition drafts out of the secret until commit", () => {
    const field = createInput();
    const { input } = field;
    input.focus();

    composition(input, "compositionstart");
    beforeInput(input, "insertCompositionText", "n");
    expect(field.value).toBe("");
    expect(input.value).toBe("");

    beforeInput(input, "insertCompositionText", "ni");
    expect(field.value).toBe("");
    expect(input.value).toBe("");

    composition(input, "compositionend", "你");
    beforeInput(input, "insertFromComposition", "你");

    expect(field.value).toBe("你");
    expect(input.value).toBe("•");
  });

  it("keeps composition drafts out of the revealed presentation", () => {
    const field = createInput();
    const { input } = field;
    field.update({ revealed: true });
    input.focus();

    composition(input, "compositionstart");
    beforeInput(input, "insertCompositionText", "ni");

    expect(field.value).toBe("");
    expect(input.value).toBe("");

    composition(input, "compositionend", "你");

    expect(field.value).toBe("你");
    expect(input.value).toBe("你");
  });

  it("commits interrupted composition through insertText once at the saved range", () => {
    const field = createInput("ab");
    const { input } = field;
    input.setSelectionRange(1, 2);
    const listener = vi.fn();
    input.addEventListener("input", listener);
    composition(input, "compositionstart");
    beforeInput(input, "insertCompositionText", "ni");
    expect(input.value).toBe("••");
    expect(input.selectionStart).toBe(1);
    expect(input.selectionEnd).toBe(2);
    beforeInput(input, "insertText", "你");
    composition(input, "compositionend", "你");
    expect(field.value).toBe("a你");
    expect(listener).toHaveBeenCalledOnce();
    beforeInput(input, "insertText", "x");
    expect(field.value).toBe("a你x");
    beforeInput(input, "historyUndo");
    expect(field.value).toBe("a你");
    beforeInput(input, "historyUndo");
    expect(field.value).toBe("ab");
  });

  it("segments committed composition text together with surrounding text", () => {
    const field = createInput("a");
    const { input } = field;
    input.focus();
    input.setSelectionRange(1, 1);

    composition(input, "compositionstart");
    beforeInput(input, "insertCompositionText", "\u0301");

    expect(field.value).toBe("a");
    expect(input.value).toBe("•");

    composition(input, "compositionend", "\u0301");

    expect(field.value).toBe("a\u0301");
    expect(input.value).toBe("•");
  });

  it("restores the selected text when composition is canceled", () => {
    const field = createInput("ab");
    const { input } = field;
    const listener = vi.fn();
    input.addEventListener("input", listener);
    input.focus();
    input.setSelectionRange(1, 2);

    composition(input, "compositionstart");
    beforeInput(input, "insertCompositionText", "x");
    composition(input, "compositionend");

    expect(field.value).toBe("ab");
    expect(input.value).toBe("••");
    expect(listener).not.toHaveBeenCalled();
  });

  it("commits composition once when insertFromComposition precedes compositionend", () => {
    const field = createInput("ab");
    const { input } = field;
    const listener = vi.fn();
    input.addEventListener("input", listener);
    input.focus();
    input.setSelectionRange(1, 2);

    composition(input, "compositionstart");
    beforeInput(input, "insertCompositionText", "ni");
    beforeInput(input, "insertFromComposition", "你");
    composition(input, "compositionend", "你");

    expect(field.value).toBe("a你");
    expect(input.value).toBe("••");
    expect(listener).toHaveBeenCalledOnce();
  });

  it("restores masks after a non-cancelable composition mutation without committing it", () => {
    const field = createInput();
    const { input } = field;
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

    expect(field.value).toBe("");
    expect(input.value).toBe("");

    composition(input, "compositionend", "密");

    expect(field.value).toBe("密");
    expect(input.value).toBe("•");
  });

  it("never adopts an uncommitted composition and discards it on blur", () => {
    const field = createInput("kept");
    const { input } = field;
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

      expect(field.value).toBe("kept");
    }

    expect(input.value).toBe("••••");
    input.blur();
    expect(field.value).toBe("kept");
    expect(input.value).toBe("••••");
  });

  it.each(["change", "input"])("does not adopt unexpected value mutations on %s", (type) => {
    const field = createInput();
    const { input } = field;
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

    expect(field.value).toBe("a");
    expect(input.value).toBe("•");
    expect(listener).not.toHaveBeenCalled();
    input.removeEventListener(type, listener);

    beforeInput(input, "insertText", "b");
    beforeInput(input, "historyUndo");
    expect(field.value).toBe("a");
  });

  it("rejects browser-managed replacement input", () => {
    const field = createInput("kept");
    const { input } = field;
    input.focus();
    input.select();

    beforeInput(input, "insertReplacementText", "autofilled");

    expect(field.value).toBe("kept");
    expect(input.value).toBe("••••");
  });

  it("ignores edits while readonly or disabled", () => {
    for (const property of ["readOnly", "disabled"] as const) {
      const field = createInput("kept");
      const { input } = field;
      input[property] = true;
      input.focus();
      input.select();

      beforeInput(input, "insertText", "changed");

      expect(field.value).toBe("kept");
      expect(input.value).toBe("••••");
    }
  });

  it("applies maxlength in UTF-16 code units without splitting graphemes", () => {
    const field = createInput();
    const { input } = field;
    field.update({ maxLength: 6 });
    input.focus();

    beforeInput(input, "insertText", "a👩‍💻b");

    expect(field.value).toBe("a👩‍💻");
    expect(input.value).toBe("••");

    input.setSelectionRange(1, 2);
    beforeInput(input, "insertText", "bc");
    expect(field.value).toBe("abc");
    expect(input.value).toBe("•••");

    field.update({ value: "" });
    field.update({ maxLength: 1 });
    beforeInput(input, "insertText", "🔐");
    expect(field.value).toBe("");
    expect(input.value).toBe("");

    field.update({ value: "🔐" });
    expect(field.value).toBe("🔐");
    expect(input.value).toBe("•");
  });

  it.each([true, false])(
    "preserves Unicode splice boundaries, maxlength, and history (redacted=%s)",
    (redacted) => {
      for (const {
        value,
        revealedStart,
        text,
        maxLength,
        expected,
        accepted,
        createSecretInput,
        caret,
        revealedCaret,
      } of [
        {
          value: "👩x💻",
          revealedStart: 2,
          text: "\u200d",
          maxLength: 5,
          expected: "👩‍💻",
          accepted: "\u200d",
          createSecretInput: "•",
          caret: 1,
          revealedCaret: 5,
        },
        {
          value: "a🔐b",
          revealedStart: 1,
          text: "e\u0301x",
          maxLength: 4,
          expected: "ae\u0301b",
          accepted: "e\u0301",
          createSecretInput: "•••",
          caret: 2,
          revealedCaret: 3,
        },
      ]) {
        const field = createInput(value);
        const { input } = field;
        field.update({ revealed: !redacted });
        field.update({ maxLength: maxLength });
        const from = redacted ? 1 : revealedStart;
        const to = redacted ? 2 : 3;
        input.setSelectionRange(from, to, "backward");
        const listener = vi.fn();
        input.addEventListener("input", listener);

        beforeInput(input, "insertFromPaste", text);
        expect(field.value).toBe(expected);
        expect(input.value).toBe(redacted ? createSecretInput : expected);
        expect(input.selectionStart).toBe(redacted ? caret : revealedCaret);
        expect(listener).toHaveBeenCalledExactlyOnceWith(
          expect.objectContaining({ data: accepted }),
        );

        beforeInput(input, "historyUndo");
        expect(field.value).toBe(value);
        expect([input.selectionStart, input.selectionEnd, input.selectionDirection]).toEqual([
          from,
          to,
          "backward",
        ]);
        beforeInput(input, "historyRedo");
        expect(field.value).toBe(expected);
      }
    },
  );

  it("provides actual values to FormData", () => {
    const { form, input } = createFormInput("token");
    const masked = createSecretInput(input, { value: "submitted🔐" });

    const formData = formDataFor(form);

    expect(masked.value).toBe("submitted🔐");
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
    createSecretInput(first, { value: "one" });
    createSecretInput(second, { value: "two" });

    expect(formDataFor(form).getAll("token")).toEqual(["one", "two"]);
  });

  it("omits disabled inputs from FormData", () => {
    const { form, input } = createFormInput("token");
    input.disabled = true;
    createSecretInput(input, { value: "secret" });

    expect(formDataFor(form).has("token")).toBe(false);
  });

  it("resets to the current default value without emitting input", async () => {
    const { form, input } = createFormInput();
    const currentState = createSecretInput(input, {
      defaultValue: "initial",
      value: "initial",
    });
    const listener = vi.fn();
    input.addEventListener("input", listener);
    currentState.update({ defaultValue: "reset" });
    currentState.update({ value: "changed" });

    form.reset();
    await Promise.resolve();

    expect(currentState.value).toBe("reset");
    expect(input.value).toBe("•••••");
    expect(listener).not.toHaveBeenCalled();
  });

  it("keeps the current value when form reset is canceled", async () => {
    const { form, input } = createFormInput();
    const currentState = createSecretInput(input, {
      defaultValue: "initial",
      value: "changed",
    });
    form.addEventListener("reset", (event) => event.preventDefault());

    form.dispatchEvent(new Event("reset", { bubbles: true, cancelable: true }));
    await Promise.resolve();

    expect(currentState.value).toBe("changed");
    expect(input.value).toBe("•••••••");
  });

  it("emits input for user edits but not property writes", () => {
    const field = createInput();
    const { input } = field;
    const listener = vi.fn();
    input.addEventListener("input", listener);

    field.update({ value: "quiet" });
    expect(listener).not.toHaveBeenCalled();

    input.focus();
    beforeInput(input, "insertText", "!");
    expect(listener).toHaveBeenCalledOnce();
    expect(listener.mock.calls[0]?.[0]).toBeInstanceOf(InputEvent);
  });

  it("commits Enter once without changing focus, and tracks subsequent changes", () => {
    const field = createInput("base");
    const { input } = field;
    input.focus();
    input.setSelectionRange(4, 4);
    const values: string[] = [];
    input.addEventListener("change", () => values.push(field.value));
    beforeInput(input, "insertText", "x");
    const enter = beforeInput(input, "insertLineBreak");
    expect(enter.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(input);
    expect(values).toEqual(["basex"]);
    beforeInput(input, "insertLineBreak");
    expect(values).toEqual(["basex"]);
    beforeInput(input, "insertText", "y");
    beforeInput(input, "historyUndo");
    expect(field.value).toBe("basex");
    input.blur();
    expect(values).toEqual(["basex"]);
  });

  it("does not turn quiet property assignments into Enter changes", () => {
    const field = createInput("base");
    const { input } = field;
    input.focus();
    const changed = vi.fn();
    input.addEventListener("change", changed);
    field.update({ value: "external" });
    beforeInput(input, "insertLineBreak");
    input.blur();
    expect(changed).not.toHaveBeenCalled();
  });

  it("does not commit when the application cancels the Enter action", () => {
    const field = createInput("base");
    const { input } = field;
    input.focus();
    const changed = vi.fn();
    input.addEventListener("change", changed);
    beforeInput(input, "insertText", "x");
    input.addEventListener("beforeinput", (event) => event.preventDefault(), { capture: true });
    beforeInput(input, "insertLineBreak");
    expect(changed).not.toHaveBeenCalled();
    input.blur();
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it("emits change on blur after a user edit", () => {
    const field = createInput();
    const { input } = field;
    const listener = vi.fn();
    input.addEventListener("change", listener);
    input.focus();

    beforeInput(input, "insertText", "a");
    input.blur();

    expect(listener).toHaveBeenCalledOnce();
  });

  it("supports undo and redo without exposing plaintext", () => {
    const field = createInput();
    const { input } = field;
    input.focus();

    beforeInput(input, "insertText", "ab");
    beforeInput(input, "deleteContentBackward");
    expect(field.value).toBe("a");

    beforeInput(input, "historyUndo");
    expect(field.value).toBe("ab");
    beforeInput(input, "historyRedo");
    expect(field.value).toBe("a");
    expect(input.value).toBe("•");
  });

  it("preserves history when application state accepts the current value", () => {
    const field = createInput();
    const { input } = field;
    input.focus();

    beforeInput(input, "insertText", "a");
    field.update({ value: "a" });
    beforeInput(input, "historyUndo");

    expect(field.value).toBe("");
    expect(input.value).toBe("");
  });

  it("groups contiguous typing like one native undo transaction", () => {
    const field = createInput();
    const { input } = field;
    input.focus();

    for (const character of ["a", "b", "c"]) {
      beforeInput(input, "insertText", character);
    }

    beforeInput(input, "historyUndo");
    expect(field.value).toBe("");
    expect(input.value).toBe("");

    beforeInput(input, "historyRedo");
    expect(field.value).toBe("abc");
    expect(input.value).toBe("•••");
  });

  it("groups contiguous backward deletion and restores the original caret", () => {
    const field = createInput("abc");
    const { input } = field;
    input.focus();
    input.setSelectionRange(3, 3);

    beforeInput(input, "deleteContentBackward");
    beforeInput(input, "deleteContentBackward");
    beforeInput(input, "historyUndo");

    expect(field.value).toBe("abc");
    expect(input.value).toBe("•••");
    expect(input.selectionStart).toBe(3);
    expect(input.selectionEnd).toBe(3);
  });

  it("groups contiguous forward deletion and restores the original caret", () => {
    const field = createInput("abc");
    const { input } = field;
    input.focus();
    input.setSelectionRange(0, 0);

    beforeInput(input, "deleteContentForward");
    beforeInput(input, "deleteContentForward");
    beforeInput(input, "historyUndo");

    expect(field.value).toBe("abc");
    expect(input.value).toBe("•••");
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(0);
  });

  it("starts a new undo transaction after caret navigation", () => {
    const field = createInput();
    const { input } = field;
    input.focus();
    for (const character of ["a", "b", "c"]) {
      beforeInput(input, "insertText", character);
    }

    keyDown(input, "ArrowLeft");
    input.setSelectionRange(2, 2);
    beforeInput(input, "insertText", "x");
    beforeInput(input, "historyUndo");

    expect(field.value).toBe("abc");
    beforeInput(input, "historyUndo");
    expect(field.value).toBe("");
  });

  it("starts a new undo transaction after rejecting an unrelated edit", () => {
    const field = createInput();
    const { input } = field;
    input.focus();
    beforeInput(input, "insertText", "a");
    beforeInput(input, "insertText", "b");

    beforeInput(input, "insertReplacementText", "rejected");
    beforeInput(input, "insertText", "c");
    beforeInput(input, "historyUndo");

    expect(field.value).toBe("ab");
    beforeInput(input, "historyUndo");
    expect(field.value).toBe("");
  });

  it("supports keyboard undo and redo without relying on the browser history stack", () => {
    const field = createInput();
    const { input } = field;
    input.focus();
    beforeInput(input, "insertText", "ab");
    beforeInput(input, "deleteContentBackward");

    expect(keyDown(input, "z", { ctrlKey: true }).defaultPrevented).toBe(true);
    expect(field.value).toBe("ab");
    expect(keyDown(input, "y", { ctrlKey: true }).defaultPrevented).toBe(true);
    expect(field.value).toBe("a");
    expect(keyDown(input, "z", { ctrlKey: true }).defaultPrevented).toBe(true);
    expect(keyDown(input, "z", { metaKey: true, shiftKey: true }).defaultPrevented).toBe(true);
    expect(field.value).toBe("a");
    expect(input.value).toBe("•");
  });

  it("retains native labeling, focus, and ARIA attributes", () => {
    const label = document.createElement("label");
    const input = document.createElement("input");
    label.htmlFor = "token";
    input.id = "token";
    input.setAttribute("aria-describedby", "help");
    document.body.append(label, input);

    createSecretInput(input);
    input.focus();

    expect(label.control).toBe(input);
    expect(input.getAttribute("aria-describedby")).toBe("help");
    expect(document.activeElement).toBe(input);
  });

  it("retains native required validity", () => {
    const field = createInput();
    const { input } = field;
    field.update({ required: true });

    expect(input.validity.valueMissing).toBe(true);
    field.update({ value: "present" });
    expect(input.validity.valid).toBe(true);
  });
  it.each([true, false])(
    "keeps the caret at joined grapheme boundaries (redacted=%s)",
    (redacted) => {
      const field = createInput("ab");
      const { input } = field;
      field.update({ revealed: !redacted });
      input.setSelectionRange(1, 1);

      beforeInput(input, "insertText", "\u0301");
      expect(field.value).toBe("a\u0301b");
      expect(input.selectionStart).toBe(redacted ? 1 : 2);
      beforeInput(input, "insertText", "x");
      expect(field.value).toBe("a\u0301xb");
      beforeInput(input, "historyUndo");
      expect(field.value).toBe("ab");
    },
  );

  it("preserves backward selection when revealing and redacting", () => {
    const field = createInput("a👩‍💻b");
    const { input } = field;
    input.setSelectionRange(1, 2, "backward");
    field.update({ revealed: true });
    expect(input.selectionDirection).toBe("backward");
    field.update({ revealed: false });
    expect(input.selectionDirection).toBe("backward");
  });

  it("does not reuse paste data for an unrelated edit in the same task", () => {
    const field = createInput();
    const { input } = field;
    dispatchTransfer(input, "paste", "stale");
    beforeInput(input, "insertText", "x");
    expect(field.value).toBe("x");
  });

  it("rejects an input whose type does not match pending metadata", () => {
    const field = createInput("kept");
    const { input } = field;
    input.select();
    beforeInput(input, "insertText", "stale", false);
    input.value = "browser-filled";
    input.dispatchEvent(new InputEvent("input", { inputType: "insertReplacementText" }));
    expect(field.value).toBe("kept");
    expect(input.value).toBe("••••");
  });

  it("does not delete a selection when insertion data is unavailable", () => {
    const field = createInput("kept");
    const { input } = field;
    input.select();
    beforeInput(input, "insertFromPaste");
    expect(field.value).toBe("kept");
  });

  it("respects beforeinput canceled by the application", () => {
    const field = createInput("kept");
    const { input } = field;
    input.select();
    input.addEventListener("beforeinput", (event) => event.preventDefault(), { capture: true });
    beforeInput(input, "insertText", "rejected");
    expect(field.value).toBe("kept");
  });

  it("preserves the composition replacement range when the current value is reaffirmed", () => {
    const field = createInput("ab");
    const { input } = field;
    input.setSelectionRange(1, 2);
    composition(input, "compositionstart");
    beforeInput(input, "insertCompositionText", "ni");
    field.update({ value: "ab" });
    expect(input.value).toBe("••");
    composition(input, "compositionend", "你");
    expect(field.value).toBe("a你");
  });

  it.each(["readOnly", "disabled"] as const)(
    "does not commit composition after becoming %s",
    (property) => {
      const field = createInput("ab");
      const { input } = field;
      input.setSelectionRange(1, 2);
      composition(input, "compositionstart");
      beforeInput(input, "insertCompositionText", "ni");
      input[property] = true;
      composition(input, "compositionend", "你");
      expect(field.value).toBe("ab");
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
    const masked = createSecretInput(input, { value: "changed", defaultValue: "initial" });
    expect(formDataFor(form).get("token")).toBe("changed");
    form.reset();
    await Promise.resolve();
    expect(masked.value).toBe("initial");
  });
  it("rejects unrelated DOM events dispatched inside an accepted input callback", () => {
    const field = createInput();
    const { input } = field;
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
    expect(field.value).toBe("x");
  });

  it("filters rejected input before listeners installed prior to masking", () => {
    const input = document.createElement("input");
    const listener = vi.fn();
    input.addEventListener("input", listener);
    createSecretInput(input, { value: "kept" });
    input.value = "browser-filled";
    input.dispatchEvent(new InputEvent("input"));
    expect(listener).not.toHaveBeenCalled();
    expect(input.value).toBe("••••");
  });

  it("does not reuse a canceled transfer even within the same task", () => {
    const field = createInput("kept");
    const { input } = field;
    input.select();
    input.addEventListener("paste", (event) => event.preventDefault());
    const event = new Event("paste", { cancelable: true });
    Object.defineProperty(event, "clipboardData", { value: { getData: () => "rejected" } });
    input.dispatchEvent(event);
    input.dispatchEvent(new InputEvent("input", { inputType: "insertFromPaste" }));
    expect(field.value).toBe("kept");
  });

  it("does not retain a canceled composition as active editing state", () => {
    const field = createInput();
    const { input } = field;
    const listener = vi.fn();
    input.addEventListener("input", listener);
    input.dispatchEvent(new CompositionEvent("compositionstart", { cancelable: true }));
    beforeInput(input, "insertText", "x");
    expect(listener.mock.calls[0]?.[0].isComposing).toBe(false);
  });

  it("discards a composition on reset even when the secret already equals its default", async () => {
    const { form, input } = createFormInput();
    const masked = createSecretInput(input, { value: "ab" });
    input.setSelectionRange(1, 2);
    composition(input, "compositionstart");
    beforeInput(input, "insertCompositionText", "draft");
    form.reset();
    await Promise.resolve();
    composition(input, "compositionend", "ignored");
    expect(masked.value).toBe("ab");
    expect(input.value).toBe("••");
  });
  it("prefers the current beforeinput over older non-cancelable metadata", () => {
    const field = createInput();
    const { input } = field;
    beforeInput(input, "insertText", "stale", false);
    beforeInput(input, "insertText", "fresh");
    expect(field.value).toBe("fresh");
  });
});
