// Comparison-only prototype. Keep native value and history; do not attach the secret controller.
export function initializeTextareaExperiment(
  textarea: HTMLTextAreaElement,
  status: HTMLElement,
): void {
  if (!CSS.supports("-webkit-text-security", "disc")) {
    textarea.readOnly = true;
    status.textContent =
      "CSS masking is unavailable in this browser. This experiment is read-only.";
    return;
  }

  textarea.style.setProperty("-webkit-text-security", "disc");
  textarea.readOnly = false;
  status.textContent = "Experimental. Test with disposable values only.";

  let composing = false;
  textarea.addEventListener("compositionstart", () => (composing = true));
  textarea.addEventListener("compositionend", () => (composing = false));
  textarea.addEventListener("beforeinput", (event) => {
    if (event.isComposing || composing || event.defaultPrevented) return;
    if (event.inputType === "insertLineBreak" || event.inputType === "insertParagraph") {
      event.preventDefault();
      // Software keyboards can send beforeinput without a preceding Enter keydown.
      if (event.cancelable) textarea.form?.requestSubmit();
    } else if (/[\r\n]/.test(event.data ?? "")) {
      event.preventDefault();
    }
  });
  textarea.addEventListener("paste", (event) => {
    if (/[\r\n]/.test(event.clipboardData?.getData("text/plain") ?? "")) {
      event.preventDefault();
      status.textContent = "Multiline paste was rejected. Paste a single-line value.";
    }
  });
  textarea.addEventListener("drop", (event) => {
    if (/[\r\n]/.test(event.dataTransfer?.getData("text/plain") ?? "")) {
      event.preventDefault();
      status.textContent = "Multiline drop was rejected. Drop a single-line value.";
    }
  });
  textarea.addEventListener("keydown", (event) => {
    if (
      event.key !== "Enter" ||
      event.isComposing ||
      composing ||
      event.keyCode === 229 ||
      event.defaultPrevented ||
      textarea.readOnly
    )
      return;
    event.preventDefault();
    if (!event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) {
      textarea.form?.requestSubmit();
    }
  });
}
