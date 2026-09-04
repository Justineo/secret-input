import { nextWordBoundary, previousWordBoundary, splitGraphemes } from "./graphemes.ts";
import { passwordManagerAttributes } from "./password-manager.ts";

const MASK = "•";

function sanitize(value: string): string {
  return value.replace(/[\r\n]/gu, "");
}

export function redact(value: string): string {
  return MASK.repeat(splitGraphemes(sanitize(value)).length);
}

export const secretInput = Symbol("secret-input");

export interface SecretInputState {
  defaultValue: string;
  redacted: boolean;
  value: string;
}

export interface SecretInput extends HTMLInputElement {
  readonly [secretInput]: SecretInputState;
}

export interface MaskOptions {
  defaultValue?: string;
  redacted?: boolean;
  value?: string;
}

interface Selection {
  end: number;
  start: number;
}

interface Snapshot extends Selection {
  value: string;
}

interface Edit extends Selection {
  data: string | null;
  inputType: string;
}

interface CompositionState extends Selection {
  currentText?: string;
  originalText: string;
}

interface HistoryGroup {
  caret: number;
  inputType: string;
}

interface Controller {
  readonly state: SecretInputState;
  reset(): void;
}

const controllers = new WeakMap<HTMLInputElement, Controller>();
const installedDocuments = new WeakSet<Document>();

function isFormDataEvent(event: Event): event is FormDataEvent {
  return "formData" in event && event.formData instanceof FormData;
}

function installDocumentHandlers(document: Document): void {
  if (installedDocuments.has(document)) {
    return;
  }
  installedDocuments.add(document);

  document.addEventListener(
    "formdata",
    (event) => {
      if (!isFormDataEvent(event) || !(event.target instanceof HTMLFormElement)) {
        return;
      }

      const byName = new Map<string, string[]>();
      for (const element of event.target.elements) {
        if (!(element instanceof HTMLInputElement)) {
          continue;
        }

        const controller = controllers.get(element);
        if (!controller || !element.name || isDisabled(element)) {
          continue;
        }

        const group = byName.get(element.name) ?? [];
        group.push(controller.state.value);
        byName.set(element.name, group);
      }

      for (const [name, group] of byName) {
        event.formData.delete(name);
        for (const value of group) {
          event.formData.append(name, value);
        }
      }
    },
    true,
  );

  document.addEventListener(
    "reset",
    (event) => {
      if (!(event.target instanceof HTMLFormElement)) {
        return;
      }

      const form = event.target;
      queueMicrotask(() => {
        if (event.defaultPrevented) {
          return;
        }

        for (const element of form.elements) {
          if (element instanceof HTMLInputElement) {
            controllers.get(element)?.reset();
          }
        }
      });
    },
    true,
  );
}

function isDisabled(input: HTMLInputElement): boolean {
  return input.disabled || input.matches(":disabled");
}

function setDefaultAttribute(input: HTMLInputElement, name: string, value: string): void {
  if (!input.hasAttribute(name)) {
    input.setAttribute(name, value);
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function collapsed(position: number): Selection {
  return { start: position, end: position };
}

function graphemeIndexAtOffset(graphemes: readonly string[], offset: number): number {
  let currentOffset = 0;

  for (const [index, grapheme] of graphemes.entries()) {
    const nextOffset = currentOffset + grapheme.length;
    if (offset < nextOffset) {
      return index;
    }
    if (offset === nextOffset) {
      return index + 1;
    }
    currentOffset = nextOffset;
  }

  return graphemes.length;
}

function offsetAtGraphemeIndex(graphemes: readonly string[], index: number): number {
  return graphemes.slice(0, index).join("").length;
}

function createController(
  input: HTMLInputElement,
  initialValue: string,
  initialDefaultValue: string,
  initialRedacted: boolean,
): Controller {
  let composition: CompositionState | undefined;
  let defaultValue = initialDefaultValue;
  let dirtySinceFocus = false;
  let dispatchingChange = false;
  let dispatchingInput = false;
  let historyGroup: HistoryGroup | undefined;
  let pendingEdit: Edit | undefined;
  let redacted = initialRedacted;
  const redoStack: Snapshot[] = [];
  let skipCompositionCommit = false;
  const undoStack: Snapshot[] = [];
  let value = initialValue;

  const state: SecretInputState = {
    get value() {
      return value;
    },
    set value(nextValue: string) {
      setValue(sanitize(String(nextValue)));
    },
    get defaultValue() {
      return defaultValue;
    },
    set defaultValue(nextValue: string) {
      defaultValue = sanitize(String(nextValue));
    },
    get redacted() {
      return redacted;
    },
    set redacted(nextValue: boolean) {
      const nextRedacted = Boolean(nextValue);
      if (nextRedacted === redacted) {
        render();
        return;
      }

      const currentSelection = selection();
      composition = undefined;
      pendingEdit = undefined;
      skipCompositionCommit = false;
      historyGroup = undefined;
      redacted = nextRedacted;
      render(currentSelection);
    },
  };

  input.addEventListener("beforeinput", handleBeforeInput);
  input.addEventListener("keydown", handleKeyDown);
  input.addEventListener("input", handleNativeInput);
  input.addEventListener("change", handleNativeChange);
  input.addEventListener("copy", preventExport);
  input.addEventListener("cut", preventExport);
  input.addEventListener("paste", handlePaste);
  input.addEventListener("pointerdown", breakHistoryGroup);
  input.addEventListener("dragstart", preventExport);
  input.addEventListener("drop", handleDrop);
  input.addEventListener("compositionstart", handleCompositionStart);
  input.addEventListener("compositionend", handleCompositionEnd);
  input.addEventListener("focus", handleFocus);
  input.addEventListener("blur", handleBlur);

  render();

  function clearHistory(): void {
    historyGroup = undefined;
    undoStack.length = 0;
    redoStack.length = 0;
  }

  function reset(): void {
    setValue(defaultValue);
    clearHistory();
    dirtySinceFocus = false;
  }

  function selection(): Selection {
    const valueParts = splitGraphemes(value);
    const length = valueParts.length;
    const startOffset = input.selectionStart ?? length;
    const endOffset = input.selectionEnd ?? startOffset;
    const displayParts = redacted ? undefined : splitGraphemes(input.value);
    const start = displayParts ? graphemeIndexAtOffset(displayParts, startOffset) : startOffset;
    const end = displayParts ? graphemeIndexAtOffset(displayParts, endOffset) : endOffset;
    const safeStart = clamp(start, 0, length);

    return {
      start: safeStart,
      end: clamp(end, safeStart, length),
    };
  }

  function setValue(nextValue: string): void {
    composition = undefined;
    pendingEdit = undefined;
    if (nextValue === value) {
      render();
      return;
    }

    clearHistory();
    value = nextValue;
    const length = splitGraphemes(nextValue).length;
    render(collapsed(length));
  }

  function render(selection?: Selection): void {
    const currentComposition = composition;
    const parts = splitGraphemes(value);
    const revealedValue =
      currentComposition?.currentText === undefined
        ? value
        : [
            ...parts.slice(0, currentComposition.start),
            currentComposition.currentText,
            ...parts.slice(currentComposition.end),
          ].join("");
    const displayParts = splitGraphemes(revealedValue);
    const presentation = redacted ? MASK.repeat(displayParts.length) : revealedValue;
    if (input.value !== presentation) {
      input.value = presentation;
    }

    if (!selection) {
      return;
    }

    if (redacted) {
      input.setSelectionRange(selection.start, selection.end);
      return;
    }

    input.setSelectionRange(
      offsetAtGraphemeIndex(displayParts, selection.start),
      offsetAtGraphemeIndex(displayParts, selection.end),
    );
  }

  function replace(start: number, end: number, insertedText: string, inputType: string): void {
    const parts = splitGraphemes(value);
    const safeStart = clamp(start, 0, parts.length);
    const safeEnd = clamp(end, safeStart, parts.length);
    const normalizedText = sanitize(insertedText);
    let insertedParts = splitGraphemes(normalizedText);
    const { maxLength } = input;

    if (maxLength >= 0) {
      const removedLength = parts.slice(safeStart, safeEnd).join("").length;
      const available = Math.max(maxLength - (value.length - removedLength), 0);
      let insertedLength = 0;
      const firstOverflow = insertedParts.findIndex((part) => {
        insertedLength += part.length;
        return insertedLength > available;
      });
      if (firstOverflow >= 0) {
        insertedParts = insertedParts.slice(0, firstOverflow);
      }
    }

    const nextValue = [
      ...parts.slice(0, safeStart),
      ...insertedParts,
      ...parts.slice(safeEnd),
    ].join("");
    const nextCaret = safeStart + insertedParts.length;

    if (nextValue === value) {
      render(collapsed(nextCaret));
      return;
    }

    const continuesHistory =
      historyGroup?.inputType === inputType &&
      ((inputType === "insertText" && safeStart === safeEnd && safeStart === historyGroup.caret) ||
        (inputType === "deleteContentBackward" && safeEnd === historyGroup.caret) ||
        (inputType === "deleteContentForward" && safeStart === historyGroup.caret));

    if (!continuesHistory) {
      undoStack.push({ value, start: safeStart, end: safeEnd });
      redoStack.length = 0;
    } else {
      const snapshot = undoStack.at(-1);
      if (snapshot && inputType === "deleteContentBackward") {
        snapshot.start = safeStart;
      } else if (snapshot && inputType === "deleteContentForward") {
        snapshot.end += safeEnd - safeStart;
      }
    }

    value = nextValue;
    dirtySinceFocus = true;
    historyGroup =
      inputType === "insertText" ||
      inputType === "deleteContentBackward" ||
      inputType === "deleteContentForward"
        ? { caret: nextCaret, inputType }
        : undefined;
    render(collapsed(nextCaret));
    dispatchInput(inputType, insertedParts.length > 0 ? insertedParts.join("") : null);
  }

  function dispatchInput(inputType: string, data: string | null): void {
    dispatchingInput = true;
    try {
      input.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          composed: true,
          data,
          inputType,
          isComposing: composition !== undefined,
        }),
      );
    } finally {
      dispatchingInput = false;
    }
  }

  function restoreSnapshot(snapshot: Snapshot, destination: Snapshot[], inputType: string): void {
    destination.push({ value, ...selection() });
    value = snapshot.value;
    dirtySinceFocus = true;
    render({ start: snapshot.start, end: snapshot.end });
    dispatchInput(inputType, null);
  }

  function beginComposition({ end, start }: Selection): CompositionState {
    const nextComposition = {
      end,
      start,
      originalText: splitGraphemes(value).slice(start, end).join(""),
    };
    composition = nextComposition;
    return nextComposition;
  }

  function commitComposition(text: string): boolean {
    const currentComposition = composition;
    if (!currentComposition) {
      return false;
    }

    composition = undefined;
    replace(currentComposition.start, currentComposition.end, text, "insertFromComposition");
    return true;
  }

  function executeEdit(edit: Edit): void {
    const { data, inputType } = edit;
    let { end, start } = edit;

    if (historyGroup && historyGroup.inputType !== inputType) {
      breakHistoryGroup();
    }

    if (isDisabled(input) || input.readOnly) {
      render({ start, end });
      return;
    }

    const parts = splitGraphemes(value);
    let insertedText = "";
    switch (inputType) {
      case "historyUndo": {
        const snapshot = undoStack.pop();
        if (snapshot) {
          restoreSnapshot(snapshot, redoStack, inputType);
        }
        return;
      }
      case "historyRedo": {
        const snapshot = redoStack.pop();
        if (snapshot) {
          restoreSnapshot(snapshot, undoStack, inputType);
        }
        return;
      }
      case "insertCompositionText": {
        const currentComposition = composition ?? beginComposition({ start, end });
        currentComposition.currentText = data ?? "";
        const draftLength = splitGraphemes(currentComposition.currentText).length;
        const caret = currentComposition.start + draftLength;
        render(collapsed(caret));
        return;
      }
      case "insertFromComposition": {
        if (skipCompositionCommit) {
          skipCompositionCommit = false;
          render();
          return;
        }
        if (commitComposition(data ?? "")) {
          return;
        }
        insertedText = data ?? "";
        break;
      }
      case "insertFromDrop":
      case "insertFromPaste":
      case "insertFromPasteAsQuotation":
      case "insertFromYank":
      case "insertText":
        insertedText = data ?? "";
        break;
      case "deleteContentBackward":
        start = start === end ? Math.max(start - 1, 0) : start;
        break;
      case "deleteContentForward":
        end = start === end ? Math.min(end + 1, parts.length) : end;
        break;
      case "deleteWordBackward":
        start = start === end ? previousWordBoundary(parts, start) : start;
        break;
      case "deleteWordForward":
        end = start === end ? nextWordBoundary(parts, end) : end;
        break;
      case "deleteByDrag":
      case "deleteContent":
        break;
      case "deleteByCut":
        if (redacted) {
          render({ start, end });
          return;
        }
        break;
      case "deleteHardLineBackward":
      case "deleteSoftLineBackward":
        start = 0;
        break;
      case "deleteHardLineForward":
      case "deleteSoftLineForward":
        end = parts.length;
        break;
      case "deleteEntireSoftLine":
        start = 0;
        end = parts.length;
        break;
      default:
        // Autocorrection, autofill-like replacement, and unknown mutations do
        // not become secret state.
        render({ start, end });
        return;
    }

    replace(start, end, insertedText, inputType);
  }

  function setPendingEdit(edit: Edit): void {
    pendingEdit = edit;
    queueMicrotask(() => {
      if (pendingEdit === edit) {
        pendingEdit = undefined;
      }
    });
  }

  function captureTransfer(data: string, inputType: "insertFromDrop" | "insertFromPaste"): void {
    setPendingEdit({ ...selection(), data, inputType });
  }

  function handleBeforeInput(event: InputEvent): void {
    const pending = pendingEdit;
    const edit: Edit = {
      ...selection(),
      data: event.dataTransfer?.getData("text/plain") ?? pending?.data ?? event.data,
      inputType: event.inputType,
    };
    pendingEdit = undefined;

    if (!event.cancelable) {
      setPendingEdit(edit);
      return;
    }

    event.preventDefault();
    executeEdit(edit);
  }

  function handleKeyDown(event: KeyboardEvent): void {
    const key = event.key.toLowerCase();
    const hasModifier = event.ctrlKey || event.metaKey;
    if (
      key.startsWith("arrow") ||
      key === "home" ||
      key === "end" ||
      key === "pageup" ||
      key === "pagedown" ||
      (hasModifier && key === "a")
    ) {
      breakHistoryGroup();
    }

    if (event.defaultPrevented || event.isComposing || event.altKey) {
      return;
    }

    let inputType: "historyRedo" | "historyUndo" | undefined;

    if (hasModifier && key === "z") {
      inputType = event.shiftKey ? "historyRedo" : "historyUndo";
    } else if (event.ctrlKey && !event.metaKey && !event.shiftKey && key === "y") {
      inputType = "historyRedo";
    }

    if (!inputType) {
      return;
    }

    event.preventDefault();
    executeEdit({ ...selection(), data: null, inputType });
  }

  function handleNativeInput(event: InputEvent): void {
    if (dispatchingInput) {
      return;
    }

    event.stopImmediatePropagation();
    const pending = pendingEdit;
    pendingEdit = undefined;

    if (pending) {
      executeEdit(pending);
      return;
    }

    breakHistoryGroup();
    render(selection());
  }

  function handleNativeChange(event: Event): void {
    if (dispatchingChange) {
      return;
    }

    event.stopImmediatePropagation();
    breakHistoryGroup();
    render(selection());
  }

  function preventExport(event: Event): void {
    if (redacted) {
      event.preventDefault();
    }
  }

  function breakHistoryGroup(): void {
    historyGroup = undefined;
  }

  function handlePaste(event: ClipboardEvent): void {
    if (event.clipboardData) {
      captureTransfer(event.clipboardData.getData("text/plain"), "insertFromPaste");
    }
  }

  function handleDrop(event: DragEvent): void {
    if (event.dataTransfer) {
      captureTransfer(event.dataTransfer.getData("text/plain"), "insertFromDrop");
    }
  }

  function handleCompositionStart(event: CompositionEvent): void {
    event.preventDefault();
    breakHistoryGroup();
    beginComposition(selection());
  }

  function handleCompositionEnd(event: CompositionEvent): void {
    const currentComposition = composition;
    if (!currentComposition) {
      return;
    }

    const committedText = event.data || currentComposition.originalText;
    commitComposition(committedText);
    skipCompositionCommit = true;
    queueMicrotask(() => {
      skipCompositionCommit = false;
    });
  }

  function handleFocus(): void {
    installDocumentHandlers(input.ownerDocument);
    dirtySinceFocus = false;
    render();
  }

  function handleBlur(): void {
    composition = undefined;
    pendingEdit = undefined;
    skipCompositionCommit = false;
    breakHistoryGroup();
    render();
    if (!dirtySinceFocus) {
      return;
    }

    dirtySinceFocus = false;
    dispatchingChange = true;
    try {
      input.dispatchEvent(new Event("change", { bubbles: true }));
    } finally {
      dispatchingChange = false;
    }
  }

  return {
    reset,
    state,
  };
}

export function mask(input: HTMLInputElement, options: MaskOptions = {}): SecretInput {
  const masked = input as SecretInput;
  if (controllers.has(input)) {
    return masked;
  }

  const value = sanitize(String(options.value ?? options.defaultValue ?? ""));
  const defaultValue = sanitize(String(options.defaultValue ?? value));
  const redacted = options.redacted ?? true;

  input.type = "text";
  input.autocomplete = "off";
  for (const [name, attributeValue] of Object.entries(passwordManagerAttributes)) {
    input.setAttribute(name, attributeValue);
  }
  setDefaultAttribute(input, "autocapitalize", "off");
  setDefaultAttribute(input, "autocorrect", "off");
  setDefaultAttribute(input, "spellcheck", "false");
  input.style.setProperty("ime-mode", "disabled");

  // Current Chromium remembers text controls that have contained at least two
  // mask characters and gives them password-style input-method protection.
  input.value = MASK.repeat(2);
  const controller = createController(input, value, defaultValue, redacted);
  Object.defineProperty(masked, secretInput, { value: controller.state });
  controllers.set(input, controller);

  installDocumentHandlers(input.ownerDocument);
  return masked;
}
