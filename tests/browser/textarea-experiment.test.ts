import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { server, userEvent } from "vite-plus/test/browser/context";

import { initializeComparison } from "../../src/comparison.ts";
import "../../src/style.css";

let textarea: HTMLTextAreaElement;
let form: HTMLFormElement;
const historyModifier = /Mac/.test(navigator.platform) ? "Command" : "Control";

async function nativeHistory(command: "undo" | "redo"): Promise<void> {
  if (server.browser === "safari") {
    // Safari CI key actions did not invoke native undo, even with explicit Command.
    // Exercise the browser's editing stack; OS keyboard shortcuts are checked separately.
    expect(document.execCommand(command)).toBe(true);
    return;
  }
  const shift = command === "redo" ? "{Shift>}" : "";
  const releaseShift = command === "redo" ? "{/Shift}" : "";
  await userEvent.keyboard(`{${historyModifier}>}${shift}z${releaseShift}{/${historyModifier}}`);
}

describe("single-line textarea experiment", () => {
  beforeEach(() => {
    initializeComparison(document.body, () => {});
    textarea = document.querySelector<HTMLTextAreaElement>("#textarea-signing-secret")!;
    form = textarea.form!;
    // The public autofill comparison omits names consistently across candidates.
    textarea.name = "secret";
    textarea.focus();
  });
  afterEach(() => document.body.replaceChildren());

  it("paints a mask while native values, selection edits, form data and reset remain intact", async () => {
    expect(textarea.readOnly).toBe(false);
    expect(getComputedStyle(textarea).getPropertyValue("-webkit-text-security")).toBe("disc");
    await userEvent.type(textarea, "secret", { skipClick: true });
    textarea.setSelectionRange(1, 5);
    await userEvent.keyboard("X");
    expect(textarea.value).toBe("sXt");
    expect(textarea.selectionStart).toBe(2);
    expect(new FormData(form).get("secret")).toBe("sXt");
    textarea.defaultValue = "Sëcret+&=🔐";
    form.reset();
    expect(textarea.value).toBe("Sëcret+&=🔐");
    expect(new FormData(form).get("secret")).toBe("Sëcret+&=🔐");
  });

  it("keeps native typing undo and redo without rewriting the value", async () => {
    await userEvent.type(textarea, "abc", { skipClick: true });
    await nativeHistory("undo");
    expect(textarea.value).toBe("");
    await nativeHistory("redo");
    expect(textarea.value).toBe("abc");
  });

  it("submits on Enter with native required validation and ignores composition confirmation", async () => {
    let submissions = 0;
    form.addEventListener("submit", () => (submissions += 1));
    textarea.required = true;
    await userEvent.keyboard("{Enter}");
    expect(submissions).toBe(0);
    await userEvent.keyboard("value{Enter}");
    expect(submissions).toBe(1);
    expect(textarea.value).toBe("value");
    await userEvent.keyboard("{Shift>}{Enter}{/Shift}");
    expect(textarea.value).toBe("value");
    expect(submissions).toBe(1);
    textarea.dispatchEvent(new CompositionEvent("compositionstart"));
    const confirm = new KeyboardEvent("keydown", { key: "Enter", cancelable: true });
    textarea.dispatchEvent(confirm);
    expect(confirm.defaultPrevented).toBe(false);
    expect(submissions).toBe(1);
    textarea.dispatchEvent(new CompositionEvent("compositionend"));
  });

  it("rejects multiline transfers without replacing the selection or clearing native history", async () => {
    await userEvent.type(textarea, "abc", { skipClick: true });
    textarea.setSelectionRange(1, 2);
    // Firefox does not expose synthetic clipboard data through its native constructor.
    const transfer = { getData: () => "one\r\ntwo" };
    const paste = new Event("paste", { cancelable: true });
    Object.defineProperty(paste, "clipboardData", { value: transfer });
    textarea.dispatchEvent(paste);
    expect(paste.defaultPrevented).toBe(true);
    const drop = new Event("drop", { cancelable: true });
    Object.defineProperty(drop, "dataTransfer", { value: transfer });
    textarea.dispatchEvent(drop);
    expect(drop.defaultPrevented).toBe(true);
    expect(textarea.value).toBe("abc");
    expect([textarea.selectionStart, textarea.selectionEnd]).toEqual([1, 2]);
    await nativeHistory("undo");
    expect(textarea.value).toBe("");
  });

  it("cancels line-break edits while allowing ordinary native insertions", () => {
    for (const inputType of ["insertLineBreak", "insertParagraph"]) {
      const event = new InputEvent("beforeinput", { inputType, cancelable: true });
      textarea.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    }
    const insert = new InputEvent("beforeinput", {
      inputType: "insertText",
      data: "secret",
      cancelable: true,
    });
    textarea.dispatchEvent(insert);
    expect(insert.defaultPrevented).toBe(false);
  });

  it("handles software-keyboard submission without requiring keydown", () => {
    let submissions = 0;
    form.addEventListener("submit", () => (submissions += 1));
    textarea.required = true;
    const enter = () => {
      const event = new InputEvent("beforeinput", {
        inputType: "insertLineBreak",
        cancelable: true,
      });
      textarea.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    };
    enter();
    expect(submissions).toBe(0);
    textarea.value = "mobile-test";
    enter();
    expect(submissions).toBe(1);
    expect(textarea.value).toBe("mobile-test");
    expect(document.querySelector("#textarea-status")?.textContent).toBe(
      "Test form submitted. Nothing was sent.",
    );
    textarea.dispatchEvent(
      new InputEvent("beforeinput", {
        inputType: "insertLineBreak",
        cancelable: true,
        isComposing: true,
      }),
    );
    expect(submissions).toBe(1);
  });

  it("scrolls long values horizontally without growing the one-line field", async () => {
    textarea.style.width = "160px";
    const height = textarea.getBoundingClientRect().height;
    await userEvent.type(textarea, "a".repeat(80), { skipClick: true });
    expect(textarea.scrollWidth).toBeGreaterThan(textarea.clientWidth);
    expect(textarea.scrollLeft).toBeGreaterThan(0);
    expect(textarea.getBoundingClientRect().height).toBe(height);
    expect(textarea.scrollHeight).toBeLessThanOrEqual(textarea.clientHeight + 1);
  });
});
