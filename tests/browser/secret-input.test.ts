import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { cdp, page, server, userEvent } from "vite-plus/test/browser/context";

import { createSecretInput } from "../../src/index.ts";
import type { SecretInputController } from "../../src/index.ts";

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
  revealed: boolean;
  selectionEnd: number | null;
  selectionStart: number | null;
  value: string;
}

let events: LoggedEvent[];
let form: HTMLFormElement;
let input: HTMLInputElement;
let field: SecretInputController;
let other: HTMLButtonElement;

function query<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing browser-test element: ${selector}`);
  }
  return element;
}

function reset(value = "", redacted = true, maxLength = -1): void {
  field.update({ defaultValue: value });
  field.update({ value: value });
  field.update({ revealed: !redacted });
  input.disabled = false;
  input.readOnly = false;
  if (maxLength < 0) {
    field.update({ maxLength: undefined });
  } else {
    field.update({ maxLength: maxLength });
  }
  events.length = 0;
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
}

function snapshot(): Snapshot {
  return {
    domValue: input.value,
    events: [...events],
    revealed: field.revealed,
    selectionEnd: input.selectionEnd,
    selectionStart: input.selectionStart,
    value: field.value,
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
    field = createSecretInput(query<HTMLInputElement>("#secret"));
    input = field.input;
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
      revealed: false,
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

    field.update({ revealed: true });
    expect(snapshot().domValue).toBe(value);
    field.update({ revealed: false });
    expect(snapshot().domValue).toBe("••••");
  });

  it("handles keyboard insertion, selection replacement, and Unicode deletion", async () => {
    reset();
    await userEvent.type(input, "a你", { skipClick: true });
    expect(snapshot()).toMatchObject({
      domValue: "••",
      revealed: false,
      selectionEnd: 2,
      selectionStart: 2,
      value: "a你",
    });

    reset("a👩‍💻b");
    input.setSelectionRange(1, 2);
    await userEvent.type(input, "密", { skipClick: true });
    expect(field.value).toBe("a密b");

    reset("a👩‍💻b");
    input.setSelectionRange(2, 2);
    await userEvent.keyboard("{Backspace}");
    expect(field.value).toBe("ab");
  });

  it("applies native maxlength units without splitting Unicode input", () => {
    reset("", true, 6);
    beforeInput("insertText", "a👩‍💻b");
    expect(field.value).toBe("a👩‍💻");

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
      revealed: false,
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

    expect(field.value).toBe("secret");
    expect(input.value).toBe("••••••");
    expect(events.find((event) => event.type === "copy")?.defaultPrevented).toBe(true);
    expect(events.find((event) => event.type === "cut")?.defaultPrevented).toBe(true);

    input.setSelectionRange(6, 6);
    paste("粘贴🔐");
    expect(field.value).toBe("secret粘贴🔐");
    expect(input.value).toBe("•••••••••");
  });

  it("keeps the native context menu and provides secret-state undo and redo", async () => {
    reset();
    await userEvent.type(input, "abc", { skipClick: true });
    await userEvent.keyboard(shortcut("z"));
    expect(field.value).toBe("");

    await userEvent.keyboard(shortcut("z", true));
    expect(field.value).toBe("abc");

    input.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    expect(events.findLast((event) => event.type === "contextmenu")?.defaultPrevented).toBe(false);
  });

  it("handles both simulated composition commit orders without displaying drafts", () => {
    for (const commitBeforeEnd of [false, true]) {
      reset("kept");
      composition("compositionstart");
      for (const draft of ["h", "hha", "hhaha", "hhaha'hha'hha"]) {
        nativeCompositionDraft(draft);
        expect(field.value).toBe("kept");
        expect(input.value).toBe("••••");
      }

      if (commitBeforeEnd) {
        beforeInput("insertFromComposition", "好");
        composition("compositionend", "好");
      } else {
        composition("compositionend", "好");
        beforeInput("insertFromComposition", "好");
      }

      expect(field.value).toBe("kept好");
      expect(input.value).toBe("•••••");
      expect(events.filter((event) => event.type === "input" && event.data === "好")).toHaveLength(
        1,
      );
    }
  });

  it.skipIf(!["chrome", "edge"].includes(server.browser))(
    "restores committed DOM and native required validity during engine composition",
    async () => {
      const protocol = cdp();
      field.update({ required: true });
      const native = document.createElement("input");
      native.type = "password";
      native.required = true;

      for (const revealed of [false, true]) {
        reset("", !revealed);
        await protocol.send("Input.imeSetComposition", {
          text: "ni",
          selectionStart: 2,
          selectionEnd: 2,
        });
        expect(field.value).toBe("");
        expect(input.value).toBe("");
        expect(input.validity.valueMissing).toBe(true);
        expect(input.validationMessage).toBe(native.validationMessage);

        await protocol.send("Input.insertText", { text: "你" });
        expect(field.value).toBe("你");
        expect(input.value).toBe(revealed ? "你" : "•");
        expect(input.checkValidity()).toBe(true);
      }

      reset("ab");
      input.setSelectionRange(1, 2);
      await protocol.send("Input.imeSetComposition", {
        text: "ni",
        selectionStart: 2,
        selectionEnd: 2,
      });
      expect(input.value).toBe("••");
      expect(input.selectionStart).toBe(1);
      expect(input.selectionEnd).toBe(2);
      await protocol.send("Input.insertText", { text: "你" });
      expect(field.value).toBe("a你");
      await protocol.send("Input.insertText", { text: "x" });
      expect(field.value).toBe("a你x");
      beforeInput("historyUndo");
      expect(field.value).toBe("a你");
      beforeInput("historyUndo");
      expect(field.value).toBe("ab");

      reset("", true, 3);
      await protocol.send("Input.imeSetComposition", {
        text: "emoji",
        selectionStart: 5,
        selectionEnd: 5,
      });
      await protocol.send("Input.insertText", { text: "👩‍💻" });
      expect(field.value).toBe("");
      expect(input.validity.valueMissing).toBe(true);
      await protocol.send("Input.insertText", { text: "🔐" });
      expect(field.value).toBe("🔐");
      expect(input.value).toBe("•");
      expect(input.checkValidity()).toBe(true);
    },
  );

  it("rejects simulated autofill mutations and submits the actual value", async () => {
    reset("kept");
    beforeInput("insertReplacementText", "autofilled");
    expect(field.value).toBe("kept");
    expect(input.value).toBe("••••");

    input.value = "browser-filled";
    input.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        inputType: "insertReplacementText",
      }),
    );
    expect(field.value).toBe("kept");
    expect(input.value).toBe("••••");
    expect(Array.from(new FormData(form).entries())).toEqual([["secret", "kept"]]);

    field.update({ defaultValue: "reset" });
    field.update({ value: "changed" });
    form.reset();
    await Promise.resolve();
    expect(field.value).toBe("reset");
    expect(input.value).toBe("•••••");
  });

  it("resets after native button activation and keeps the default presentation", async () => {
    reset("kept");
    field.update({ defaultValue: "start🔐" });
    const button = document.createElement("button");
    button.type = "reset";
    button.textContent = "Reset";
    form.append(button);
    let valueDuringReset: string | undefined;
    form.addEventListener("reset", () => {
      valueDuringReset = field.value;
    });

    await userEvent.click(button);
    await expect.poll(() => field.value).toBe("start🔐");
    expect(valueDuringReset).toBe("kept");
    expect(input.value).toBe("••••••");
    expect(events.filter((event) => event.type === "input" || event.type === "change")).toEqual([]);
  });

  it("preserves the secret and history when a native reset click is canceled", async () => {
    reset("kept");
    await userEvent.type(input, "x", { skipClick: true });
    const button = document.createElement("button");
    button.type = "reset";
    button.textContent = "Reset";
    form.append(button);
    form.addEventListener("reset", (event) => event.preventDefault());

    await userEvent.click(button);
    // Let a deferred reset finish before checking that cancellation preserved history.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(field.value).toBe("keptx");
    expect(input.value).toBe("•••••");
    await userEvent.click(input);
    await userEvent.keyboard(shortcut("z"));
    expect(field.value).toBe("kept");
  });

  it("keeps mixed same-name controls, files, submitters, and entry order", async () => {
    form.innerHTML = `
      <input name="before" value="first">
      <input name="token" value="•••">
      <input name="token" data-secret dirname="direction">
      <input name="token" type="checkbox" value="unchecked">
      <input name="token" type="checkbox" value="checked" checked>
      <select name="token" multiple>
        <option selected>first option</option>
        <option selected disabled>disabled option</option>
        <optgroup disabled><option selected>disabled group</option></optgroup>
        <option selected>last option</option>
      </select>
      <input name="token" type="file" multiple>
      <fieldset disabled><input name="token" value="disabled"></fieldset>
      <input name="token" data-secret>
      <input name="after" value="last">
      <button name="action" value="save">Save</button>
    `;
    const inputs = form.querySelectorAll<HTMLInputElement>("[data-secret]");
    createSecretInput(inputs[0]!, { value: "one" });
    createSecretInput(inputs[1]!, { value: "two" });
    const transfer = new DataTransfer();
    transfer.items.add(new File(["first contents"], "first.txt", { type: "text/plain" }));
    transfer.items.add(new File(["last contents"], "last.txt", { type: "text/plain" }));
    form.querySelector<HTMLInputElement>("[type=file]")!.files = transfer.files;
    const data = new FormData(form, form.querySelector("button")!);
    expect(
      Array.from(data, ([name, value]) => [name, value instanceof File ? value.name : value]),
    ).toEqual([
      ["before", "first"],
      ["token", "•••"],
      ["token", "one"],
      ["direction", "ltr"],
      ["token", "checked"],
      ["token", "first option"],
      ["token", "last option"],
      ["token", "first.txt"],
      ["token", "last.txt"],
      ["token", "two"],
      ["after", "last"],
      ["action", "save"],
    ]);
    const files = data.getAll("token").filter((value): value is File => value instanceof File);
    expect(await Promise.all(files.map((file) => file.text()))).toEqual([
      "first contents",
      "last contents",
    ]);
    expect(files.every((file) => file.type === "text/plain")).toBe(true);
    expect(inputs[0]!.value).toBe("•••");
  });

  it("preserves rule enforcement and accepted edits when a message formatter throws", async () => {
    field.update({
      value: "ABC",
      defaultValue: "123",
      pattern: "[A-Z]+",
      validationMessages: {
        patternMismatch: () => {
          throw new Error("Message formatting failed");
        },
      },
    });
    let submitted = false;
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      submitted = true;
    });
    field.update({ value: "123" });
    expect(input.checkValidity()).toBe(false);
    expect(input.validationMessage).not.toBe("");
    input.focus();
    await userEvent.keyboard("4");
    expect(field.value).toBe("1234");
    expect(events.some((event) => event.type === "input" && event.data === "4")).toBe(true);
    form.requestSubmit();
    expect(submitted).toBe(false);
    field.update({ value: "ABC" });
    form.requestSubmit();
    expect(submitted).toBe(true);
    form.reset();
    await expect.poll(() => field.value).toBe("123");
    expect(input.checkValidity()).toBe(false);
  });

  it("preserves native readonly, disabled, and required behavior", () => {
    reset();
    field.update({ required: true });
    expect(input.validity.valueMissing).toBe(true);

    field.update({ value: "present" });
    expect(input.validity.valid).toBe(true);

    input.readOnly = true;
    beforeInput("insertText", "changed");
    expect(field.value).toBe("present");

    input.readOnly = false;
    const fieldset = document.createElement("fieldset");
    input.replaceWith(fieldset);
    fieldset.append(input);
    fieldset.disabled = true;
    expect(input.matches(":disabled")).toBe(true);
    expect(Array.from(new FormData(form).entries())).toEqual([]);
  });

  it("validates actual values in core and preserves native messages and submission", () => {
    reset("AB");
    field.update({ required: true });
    const validator = input.ownerDocument.createElement("input");
    validator.type = "password";
    validator.required = true;
    validator.pattern = "[A-F0-9]{4}";
    validator.value = "AB";
    const message = validator.validationMessage;
    validator.value = "";
    field.update({ pattern: "[A-F0-9]{4}" });
    field.update({});
    const submissions: FormDataEntryValue[] = [];
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      submissions.push(new FormData(form).get("secret")!);
    });

    expect(input.validity.customError).toBe(true);
    expect(validator.isConnected).toBe(false);
    expect(validator.value).toBe("");
    expect(input.validationMessage).toBe(message);
    expect(form.checkValidity()).toBe(false);
    form.requestSubmit();
    expect(submissions).toEqual([]);

    beforeInput("insertFromPaste", "CD");
    expect(field.value).toBe("ABCD");
    expect(input.value).toBe("••••");
    expect(form.checkValidity()).toBe(true);
    for (const revealed of [true, false]) {
      field.update({ revealed: revealed });
      expect(form.checkValidity()).toBe(true);
    }
    form.requestSubmit();
    expect(submissions).toEqual(["ABCD"]);

    beforeInput("historyUndo");
    expect(field.value).toBe("AB");
    expect(input.validity.customError).toBe(true);
    form.requestSubmit();
    expect(submissions).toEqual(["ABCD"]);

    // Programmatic writes are quiet and core revalidates them immediately.
    field.update({ value: "EF12" });
    expect(input.value).toBe("••••");
    expect(input.validationMessage).toBe("");
    expect(form.checkValidity()).toBe(true);
  });

  it("applies synchronous controller rule updates and validates Unicode lengths without exposing the value", async () => {
    reset("👩‍💻");
    field.update({ minLength: 5 });
    field.update({ maxLength: 5 });
    field.update({});
    expect(input.value).toBe("•");
    expect(input.checkValidity()).toBe(true);
    field.update({ maxLength: 3 });
    await expect.poll(() => input.checkValidity()).toBe(false);
    expect(field.value).toBe("👩‍💻");
    expect(input.matches(":invalid")).toBe(true);
    expect(input.validationMessage).toBe("The value is too long.");
    field.update({ validationMessages: { tooLong: "内容超过允许长度" } });
    expect(input.validationMessage).toBe("内容超过允许长度");
    expect(input.reportValidity()).toBe(false);
    expect(document.activeElement).toBe(input);
    field.update({ validationMessages: undefined });
    expect(input.validationMessage).toBe("The value is too long.");
    const native = document.createElement("input");
    field.update({ minLength: undefined });
    field.update({ maxLength: undefined });
    await expect.poll(() => input.checkValidity()).toBe(true);
    field.update({ pattern: "[A-Z]+" });
    await expect.poll(() => input.checkValidity()).toBe(false);
    field.update({ value: "AB" });
    expect(input.checkValidity()).toBe(true);
    field.update({ minLength: 3 });
    await expect.poll(() => input.checkValidity()).toBe(false);
    expect(input.validationMessage).toBe("The value is too short.");
    field.update({ validationMessages: { tooShort: "内容长度不足" } });
    expect(input.validationMessage).toBe("内容长度不足");
    field.update({ value: "ABC" });
    expect(input.checkValidity()).toBe(true);
    field.update({ value: "" });
    expect(input.checkValidity()).toBe(true);
    field.update({ required: true });
    expect(input.validity.valueMissing).toBe(true);
    expect(input.validity.customError).toBe(false);
    native.removeAttribute("pattern");
    native.value = "";
    native.required = true;
    expect(input.validationMessage).toBe(native.validationMessage);
    field.update({
      validationMessages: {
        valueMissing: ({ defaultMessage }) => `Required: ${defaultMessage}`,
        patternMismatch: ({ pattern }) => `Use ${pattern}`,
      },
    });
    expect(input.validationMessage).toBe(`Required: ${native.validationMessage}`);
    expect(input.validity.valueMissing).toBe(true);
    expect(input.reportValidity()).toBe(false);
    field.update({ value: "123" });
    expect(input.validationMessage).toBe("Use [A-Z]+");
    field.update({ validationMessages: undefined });
    native.required = false;
    native.pattern = "[A-Z]+";
    native.value = "123";
    expect(input.validationMessage).toBe(native.validationMessage);
  });

  it("retains application errors across native exemptions and restores rule errors when cleared", () => {
    reset("AB");
    field.update({ minLength: 4, customValidity: "Server error" });
    for (const property of ["disabled", "readOnly"] as const) {
      input[property] = true;
      field.update({ value: "ABC" });
      expect(input.validationMessage).toBe("");
      expect(input.validity.customError).toBe(true);
      expect(form.checkValidity()).toBe(true);
      input[property] = false;
      expect(input.validationMessage).toBe("Server error");
      expect(form.checkValidity()).toBe(false);
    }
    const fieldset = document.createElement("fieldset");
    input.replaceWith(fieldset);
    fieldset.append(input);
    fieldset.disabled = true;
    field.update({ revealed: true });
    expect(input.validationMessage).toBe("");
    expect(form.checkValidity()).toBe(true);
    fieldset.disabled = false;
    expect(input.validationMessage).toBe("Server error");
    field.update({ customValidity: "" });
    expect(input.validationMessage).not.toBe("Server error");
    expect(input.validity.customError).toBe(true);
    expect(input.validity.tooShort).toBe(false);
    beforeInput("insertText", "D");
    expect(field.value).toBe("ABCD");
    expect(input.checkValidity()).toBe(true);
  });

  it("commits Enter before validation and submission while retaining focus", async () => {
    reset();
    const submit = document.createElement("button");
    submit.type = "submit";
    submit.textContent = "Save";
    form.append(submit);
    const seen: string[] = [];
    field.update({ customValidity: "Enter a value" });
    input.addEventListener("change", () => {
      seen.push(`change:${field.value}`);
      field.update({ customValidity: field.value ? "" : "Enter a value" });
    });
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const submitted = new FormData(form).get("secret");
      if (typeof submitted !== "string") throw new TypeError("Expected a secret string");
      seen.push(`submit:${submitted}`);
    });
    await userEvent.type(input, "x", { skipClick: true });
    await userEvent.keyboard("{Enter}");
    expect(seen).toEqual(["change:x", "submit:x"]);
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe("•");
    await userEvent.keyboard("{Enter}");
    expect(seen).toEqual(["change:x", "submit:x", "submit:x"]);
    await userEvent.click(other);
    expect(events.filter((event) => event.type === "change")).toHaveLength(1);
  });

  it("does not commit or submit when Enter is canceled on keydown", async () => {
    reset();
    const submit = document.createElement("button");
    submit.type = "submit";
    form.append(submit);
    let submissions = 0;
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      submissions += 1;
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") event.preventDefault();
    });
    await userEvent.type(input, "x", { skipClick: true });
    await userEvent.keyboard("{Enter}");
    expect(submissions).toBe(0);
    expect(events.filter((event) => event.type === "change")).toHaveLength(0);
  });

  it("emits input and change with masked event targets", async () => {
    reset();
    await userEvent.type(input, "x", { skipClick: true });
    await userEvent.click(other);

    expect(field.value).toBe("x");
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
      expect(field.value).toBe("a\u0301xb");
      beforeInput("historyUndo");
      expect(field.value).toBe("ab");
      input.setSelectionRange(0, 1, "backward");
      field.update({ revealed: redacted });
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
      const masked = createSecretInput(targetInput, { value: "changed", defaultValue: "initial" });
      expect(new FormData(targetForm).get("token")).toBe("changed");
      targetForm.reset();
      await Promise.resolve();
      expect(masked.value).toBe("initial");
      expect(targetInput.value).toBe("•••••••");
    },
  );

  it("ignores canceled, mismatched, and data-less edits", () => {
    reset("kept");
    input.select();
    beforeInput("insertFromPaste");
    expect(field.value).toBe("kept");
    beforeInput("insertText", "stale", false);
    input.value = "browser-filled";
    input.dispatchEvent(new InputEvent("input", { inputType: "insertReplacementText" }));
    expect(field.value).toBe("kept");
    input.addEventListener("beforeinput", (event) => event.preventDefault(), { capture: true });
    beforeInput("insertText", "rejected");
    expect(field.value).toBe("kept");
  });
});
