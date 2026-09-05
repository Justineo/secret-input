import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser/context";

import { mask } from "../../src/index.ts";
import type { SecretInput } from "../../src/index.ts";

interface LoggedEvent {
  data: string | null;
  defaultPrevented: boolean;
  inputType: string;
  isComposing: boolean;
  isTrusted: boolean;
  type: string;
}

interface Snapshot {
  domValue: string;
  events: LoggedEvent[];
  redacted: boolean;
  selectionEnd: number | null;
  selectionStart: number | null;
  value: string;
}

let events: LoggedEvent[];
let form: HTMLFormElement;
let input: SecretInput;
let other: HTMLButtonElement;

function query<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing browser-test element: ${selector}`);
  }
  return element;
}

function reset(value = "", redacted = true, maxLength = -1): void {
  input.defaultSecretValue = value;
  input.secretValue = value;
  input.redacted = redacted;
  input.disabled = false;
  input.readOnly = false;
  if (maxLength < 0) {
    input.removeAttribute("maxlength");
  } else {
    input.maxLength = maxLength;
  }
  events.length = 0;
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
}

function snapshot(): Snapshot {
  return {
    domValue: input.value,
    events: [...events],
    redacted: input.redacted,
    selectionEnd: input.selectionEnd,
    selectionStart: input.selectionStart,
    value: input.secretValue,
  };
}

function beforeInput(inputType: string, data: string | null = null, cancelable = true): void {
  input.dispatchEvent(
    new InputEvent("beforeinput", {
      bubbles: true,
      cancelable,
      composed: true,
      data,
      inputType,
    }),
  );
}

function composition(type: "compositionend" | "compositionstart", data = ""): void {
  input.dispatchEvent(new CompositionEvent(type, { bubbles: true, data }));
}

function nativeCompositionDraft(data: string): void {
  beforeInput("insertCompositionText", data, false);
  input.value = data;
  input.dispatchEvent(
    new InputEvent("input", {
      bubbles: true,
      data,
      inputType: "insertCompositionText",
      isComposing: true,
    }),
  );
}

function paste(data: string): void {
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", {
    value: { getData: (type: string) => (type === "text/plain" ? data : "") },
  });
  input.dispatchEvent(event);
  beforeInput("insertFromPaste");
}

function shortcut(key: string, shift = false): string {
  const shiftedKey = shift ? `{Shift>}${key}{/Shift}` : key;
  return `{Ctrl>}${shiftedKey}{/Ctrl}`;
}

describe("secret input browser contract", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <form id="form">
        <label for="secret">Secret</label>
        <input id="secret" name="secret">
        <button id="other" type="button">Other</button>
      </form>
    `;
    form = query("#form");
    input = mask(query<HTMLInputElement>("#secret"));
    other = query("#other");
    events = [];

    for (const type of [
      "beforeinput",
      "change",
      "compositionend",
      "compositionstart",
      "contextmenu",
      "copy",
      "cut",
      "input",
      "paste",
    ]) {
      input.addEventListener(type, (event) => {
        const inputEvent = event instanceof InputEvent ? event : undefined;
        events.push({
          data: inputEvent?.data ?? null,
          defaultPrevented: event.defaultPrevented,
          inputType: inputEvent?.inputType ?? "",
          isComposing: inputEvent?.isComposing ?? false,
          isTrusted: event.isTrusted,
          type,
        });
      });
    }
  });

  afterEach(() => document.body.replaceChildren());

  it("keeps Unicode state separate from its masked DOM presentation", () => {
    const value = "a👩‍💻e\u0301你";
    reset(value);

    expect(snapshot()).toEqual({
      domValue: "••••",
      events: [],
      redacted: true,
      selectionEnd: 4,
      selectionStart: 4,
      value,
    });
    expect(input.type).toBe("text");
    expect(input.autocomplete).toBe("off");
    expect(input.getAttribute("autocapitalize")).toBe("off");
    expect(input.getAttribute("autocorrect")).toBe("off");
    expect(input.getAttribute("spellcheck")).toBe("false");
    expect(input.getAttribute("data-1p-ignore")).toBe("");
    expect(input.getAttribute("data-bwignore")).toBe("true");
    expect(input.getAttribute("data-form-type")).toBe("other");
    expect(input.getAttribute("data-lpignore")).toBe("true");
    expect(input.getAttribute("data-protonpass-ignore")).toBe("true");
    expect(page.getByRole("textbox", { name: "Secret" }).element()).toBe(input);
    expect(document.documentElement.outerHTML).not.toContain(value);

    input.redacted = false;
    expect(snapshot().domValue).toBe(value);
    input.redacted = true;
    expect(snapshot().domValue).toBe("••••");
  });

  it("handles keyboard insertion, selection replacement, and Unicode deletion", async () => {
    reset();
    await userEvent.type(input, "a你", { skipClick: true });
    expect(snapshot()).toMatchObject({
      domValue: "••",
      redacted: true,
      selectionEnd: 2,
      selectionStart: 2,
      value: "a你",
    });

    reset("a👩‍💻b");
    input.setSelectionRange(1, 2);
    await userEvent.type(input, "密", { skipClick: true });
    expect(input.secretValue).toBe("a密b");

    reset("a👩‍💻b");
    input.setSelectionRange(2, 2);
    await userEvent.keyboard("{Backspace}");
    expect(input.secretValue).toBe("ab");
  });

  it("applies native maxlength units without splitting Unicode input", () => {
    reset("", true, 6);
    beforeInput("insertText", "a👩‍💻b");
    expect(input.secretValue).toBe("a👩‍💻");

    reset("", true, 1);
    beforeInput("insertText", "🔐");
    expect(snapshot()).toEqual({
      domValue: "",
      events: [
        {
          data: "🔐",
          defaultPrevented: true,
          inputType: "insertText",
          isComposing: false,
          isTrusted: false,
          type: "beforeinput",
        },
      ],
      redacted: true,
      selectionEnd: 0,
      selectionStart: 0,
      value: "",
    });
  });

  it("supports paste while preventing copy and cut from a redacted field", async () => {
    reset("secret");
    input.select();
    await userEvent.copy();
    await userEvent.cut();

    expect(input.secretValue).toBe("secret");
    expect(input.value).toBe("••••••");
    expect(events.find((event) => event.type === "copy")?.defaultPrevented).toBe(true);
    expect(events.find((event) => event.type === "cut")?.defaultPrevented).toBe(true);

    input.setSelectionRange(6, 6);
    paste("粘贴🔐");
    expect(input.secretValue).toBe("secret粘贴🔐");
    expect(input.value).toBe("•••••••••");
  });

  it("keeps the native context menu and provides secret-state undo and redo", async () => {
    reset();
    await userEvent.type(input, "abc", { skipClick: true });
    await userEvent.keyboard(shortcut("z"));
    expect(input.secretValue).toBe("");

    await userEvent.keyboard(shortcut("z", true));
    expect(input.secretValue).toBe("abc");

    input.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    expect(events.findLast((event) => event.type === "contextmenu")?.defaultPrevented).toBe(false);
  });

  it("buffers both common native composition event orders", () => {
    for (const commitBeforeEnd of [false, true]) {
      reset("kept");
      composition("compositionstart");
      for (const draft of ["h", "hha", "hhaha", "hhaha'hha'hha"]) {
        nativeCompositionDraft(draft);
        expect(input.secretValue).toBe("kept");
        expect(input.value).not.toContain("h");
      }

      if (commitBeforeEnd) {
        beforeInput("insertFromComposition", "好");
        composition("compositionend", "好");
      } else {
        composition("compositionend", "好");
        beforeInput("insertFromComposition", "好");
      }

      expect(input.secretValue).toBe("kept好");
      expect(input.value).toBe("•••••");
      expect(events.filter((event) => event.type === "input" && event.data === "好")).toHaveLength(
        1,
      );
    }
  });

  it("rejects simulated autofill mutations and submits the actual value", async () => {
    reset("kept");
    beforeInput("insertReplacementText", "autofilled");
    expect(input.secretValue).toBe("kept");
    expect(input.value).toBe("••••");

    input.value = "browser-filled";
    input.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        inputType: "insertReplacementText",
      }),
    );
    expect(input.secretValue).toBe("kept");
    expect(input.value).toBe("••••");
    expect(Array.from(new FormData(form).entries())).toEqual([["secret", "kept"]]);

    input.defaultSecretValue = "reset";
    input.secretValue = "changed";
    form.reset();
    await Promise.resolve();
    expect(input.secretValue).toBe("reset");
    expect(input.value).toBe("•••••");
  });

  it("preserves native readonly, disabled, and required behavior", () => {
    reset();
    input.required = true;
    expect(input.validity.valueMissing).toBe(true);

    input.secretValue = "present";
    expect(input.validity.valid).toBe(true);

    input.readOnly = true;
    beforeInput("insertText", "changed");
    expect(input.secretValue).toBe("present");

    input.readOnly = false;
    const fieldset = document.createElement("fieldset");
    input.replaceWith(fieldset);
    fieldset.append(input);
    fieldset.disabled = true;
    expect(input.matches(":disabled")).toBe(true);
    expect(Array.from(new FormData(form).entries())).toEqual([]);
  });

  it("emits input and change with masked event targets", async () => {
    reset();
    await userEvent.type(input, "x", { skipClick: true });
    await userEvent.click(other);

    expect(input.secretValue).toBe("x");
    expect(input.value).toBe("•");
    expect(events.filter((event) => event.type === "input")).toHaveLength(1);
    expect(events.filter((event) => event.type === "change")).toHaveLength(1);
  });
  it.each([true, false])(
    "keeps joined grapheme edits and selection direction (redacted=%s)",
    (redacted) => {
      reset("ab", redacted);
      input.setSelectionRange(1, 1);
      beforeInput("insertText", "\u0301");
      expect(input.selectionStart).toBe(redacted ? 1 : 2);
      beforeInput("insertText", "x");
      expect(input.secretValue).toBe("a\u0301xb");
      beforeInput("historyUndo");
      expect(input.secretValue).toBe("ab");
      input.setSelectionRange(0, 1, "backward");
      input.redacted = !redacted;
      expect(input.selectionDirection).toBe("backward");
    },
  );

  it.each(["detached", "shadow", "iframe"])(
    "submits and resets secrets in %s forms",
    async (location) => {
      let targetDocument = document;
      let host: HTMLElement | ShadowRoot | undefined;
      if (location === "iframe") {
        const frame = document.createElement("iframe");
        document.body.append(frame);
        targetDocument = frame.contentDocument!;
        host = targetDocument.body;
      } else if (location === "shadow") {
        const element = document.createElement("div");
        document.body.append(element);
        host = element.attachShadow({ mode: "closed" });
      }
      const targetForm = targetDocument.createElement("form");
      const targetInput = targetDocument.createElement("input");
      targetInput.name = "token";
      targetForm.append(targetInput);
      host?.append(targetForm);
      const masked = mask(targetInput, { value: "changed", defaultValue: "initial" });
      expect(new FormData(targetForm).get("token")).toBe("changed");
      targetForm.reset();
      await Promise.resolve();
      expect(masked.secretValue).toBe("initial");
      expect(masked.value).toBe("•••••••");
    },
  );

  it("ignores canceled, mismatched, and data-less edits", () => {
    reset("kept");
    input.select();
    beforeInput("insertFromPaste");
    expect(input.secretValue).toBe("kept");
    beforeInput("insertText", "stale", false);
    input.value = "browser-filled";
    input.dispatchEvent(new InputEvent("input", { inputType: "insertReplacementText" }));
    expect(input.secretValue).toBe("kept");
    input.addEventListener("beforeinput", (event) => event.preventDefault(), { capture: true });
    beforeInput("insertText", "rejected");
    expect(input.secretValue).toBe("kept");
  });
});
