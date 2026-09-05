import {
  graphemeIndexAtOffset,
  nextWordBoundary,
  offsetAtGraphemeIndex,
  previousWordBoundary,
  splitGraphemes,
} from "./graphemes.ts";
import { passwordManagerAttributes } from "./password-manager.ts";

const MASK = "•";

function sanitize(value: string): string {
  return value.replace(/[\r\n]/gu, "");
}

export function redact(value: string): string {
  return MASK.repeat(splitGraphemes(sanitize(value)).length);
}

interface State {
  defaultValue: string;
  redacted: boolean;
  value: string;
}

export interface SecretInput extends HTMLInputElement {
  /** Value restored by form reset. Assignments are quiet and do not edit the current value. */
  defaultSecretValue: string;
  /** Whether the DOM shows bullets. Explicitly set false to expose the secret as text. */
  redacted: boolean;
  /** Authoritative value. Assignments are quiet; changing it clears edit history and composition. */
  secretValue: string;
}

export interface MaskOptions {
  /** Reset value; also initializes the current value when value is omitted. */
  defaultValue?: string;
  /** Initial presentation, true by default. */
  redacted?: boolean;
  /** Initial secret; defaults to defaultValue, then the empty string. Never read from the DOM. */
  value?: string;
}

interface Selection {
  direction?: "forward" | "backward" | "none";
  end: number;
  start: number;
}

interface Snapshot extends Selection {
  value: string;
}

interface Edit extends Selection {
  isComposing?: boolean;
  source?: Event;
  data: string | null;
  inputType: string;
}

interface CompositionState extends Selection {
  currentText?: string;
  originalText: string;
}

interface HistoryEntry {
  readonly before: Snapshot;
  after: Snapshot;
  readonly inputType: string;
}

interface Controller {
  readonly state: State;
  reset(): void;
}

const controllers = new WeakMap<HTMLInputElement, Controller>();
const installedRoots = new WeakSet<Node>();
const handledFormEvents = new WeakSet<Event>();

function isFormDataEvent(event: Event): event is FormDataEvent {
  return "formData" in event;
}

function isForm(target: EventTarget | null): target is HTMLFormElement {
  const element = target as Element | null;
  return element?.localName === "form" && element.namespaceURI === "http://www.w3.org/1999/xhtml";
}

function installFormHandlers(input: HTMLInputElement): void {
  for (const root of [input.ownerDocument, input.getRootNode(), input.form]) {
    if (root) {
      installRootHandlers(root);
    }
  }
}

function installRootHandlers(root: Node): void {
  if (installedRoots.has(root)) {
    return;
  }
  installedRoots.add(root);

  root.addEventListener(
    "formdata",
    (event) => {
      if (!isFormDataEvent(event) || !isForm(event.target) || handledFormEvents.has(event)) {
        return;
      }

      handledFormEvents.add(event);
      const byName = new Map<string, string[]>();
      for (const element of event.target.elements) {
        if (element.localName !== "input") {
          continue;
        }

        const input = element as HTMLInputElement;
        const controller = controllers.get(input);
        if (!controller || !input.name || isDisabled(input) || input.closest("datalist")) {
          continue;
        }

        const group = byName.get(input.name) ?? [];
        group.push(controller.state.value);
        byName.set(input.name, group);
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

  root.addEventListener(
    "reset",
    (event) => {
      if (!isForm(event.target) || handledFormEvents.has(event)) {
        return;
      }

      handledFormEvents.add(event);
      const form = event.target;
      queueMicrotask(() => {
        if (event.defaultPrevented) {
          return;
        }

        for (const element of form.elements) {
          if (element.localName === "input") {
            controllers.get(element as HTMLInputElement)?.reset();
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

function createController(
  input: HTMLInputElement,
  initialValue: string,
  initialDefaultValue: string,
  initialRedacted: boolean,
): Controller {
  let composition: CompositionState | undefined;
  let defaultValue = initialDefaultValue;
  let dirtySinceFocus = false;
  let dispatchingChange: Event | undefined;
  let dispatchingInput: InputEvent | undefined;
  let historyGroup: HistoryEntry | undefined;
  let pendingEdit: Edit | undefined;
  let redacted = initialRedacted;
  const redoStack: HistoryEntry[] = [];
  let skipCompositionCommit = false;
  const undoStack: HistoryEntry[] = [];
  let value = initialValue;
  let valueAtFocus = value;
  let segmentedValue = value;
  let valueParts = splitGraphemes(value);
  let displayParts = valueParts;

  function getParts(): readonly string[] {
    if (segmentedValue !== value) {
      segmentedValue = value;
      valueParts = splitGraphemes(value);
    }
    return valueParts;
  }

  const state: State = {
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
  input.addEventListener("input", handleNativeInput, true);
  input.addEventListener("change", handleNativeChange, true);
  input.addEventListener("copy", preventExport);
  input.addEventListener("cut", preventExport);
  input.addEventListener("paste", handlePaste);
  input.addEventListener("pointerdown", breakHistoryGroup);
  input.addEventListener("select", handleSelectionChange);
  input.addEventListener("selectionchange", handleSelectionChange);
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
    composition = undefined;
    pendingEdit = undefined;
    skipCompositionCommit = false;
    setValue(defaultValue);
    valueAtFocus = value;
    clearHistory();
    dirtySinceFocus = false;
  }

  function selection(): Selection {
    const length = getParts().length;
    const startOffset = input.selectionStart ?? length;
    const endOffset = input.selectionEnd ?? startOffset;
    const start = redacted ? startOffset : graphemeIndexAtOffset(displayParts, startOffset);
    const end = redacted
      ? endOffset
      : graphemeIndexAtOffset(displayParts, endOffset, endOffset > startOffset);
    const safeStart = clamp(start, 0, length);

    return {
      direction: input.selectionDirection ?? "none",
      start: safeStart,
      end: clamp(end, safeStart, length),
    };
  }

  function setValue(nextValue: string): void {
    if (nextValue === value) {
      render();
      return;
    }

    composition = undefined;
    pendingEdit = undefined;
    skipCompositionCommit = false;
    clearHistory();
    value = nextValue;
    const length = getParts().length;
    render(collapsed(length));
  }

  function render(selection?: Selection): void {
    const currentComposition = composition;
    const parts = getParts();
    const revealedValue =
      currentComposition?.currentText === undefined
        ? value
        : [
            ...parts.slice(0, currentComposition.start),
            currentComposition.currentText,
            ...parts.slice(currentComposition.end),
          ].join("");
    displayParts =
      currentComposition?.currentText === undefined ? valueParts : splitGraphemes(revealedValue);
    const presentation = redacted ? MASK.repeat(displayParts.length) : revealedValue;
    if (input.value !== presentation) {
      input.value = presentation;
    }

    if (selection) {
      renderSelection(selection);
    }
  }

  function renderSelection(selection: Selection): void {
    if (redacted) {
      input.setSelectionRange(selection.start, selection.end, selection.direction);
      return;
    }

    input.setSelectionRange(
      offsetAtGraphemeIndex(displayParts, selection.start),
      offsetAtGraphemeIndex(displayParts, selection.end),
      selection.direction,
    );
  }

  function replace(edit: Edit, insertedText: string, start = edit.start, end = edit.end): void {
    const { inputType } = edit;
    const parts = getParts();
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
    // Segmentation can change across either splice boundary (combining marks,
    // regional indicators, ZWJ sequences). Map the resulting UTF-16 offset.
    const nextOffset = offsetAtGraphemeIndex(parts, safeStart) + insertedParts.join("").length;
    const nextParts = splitGraphemes(nextValue);
    const nextCaret = graphemeIndexAtOffset(nextParts, nextOffset, true);

    if (nextValue === value) {
      breakHistoryGroup();
      render(collapsed(nextCaret));
      return;
    }

    const groupable =
      inputType === "insertText" ||
      inputType === "deleteContentBackward" ||
      inputType === "deleteContentForward";
    const after = { value: nextValue, ...collapsed(nextCaret) };
    if (
      groupable &&
      edit.start === edit.end &&
      historyGroup?.inputType === inputType &&
      edit.start === historyGroup.after.start
    ) {
      historyGroup.after = after;
    } else {
      const entry: HistoryEntry = {
        before: {
          value,
          start: edit.start,
          end: edit.end,
          direction: edit.direction ?? "none",
        },
        after,
        inputType,
      };
      undoStack.push(entry);
      historyGroup = groupable ? entry : undefined;
    }
    redoStack.length = 0;

    value = nextValue;
    segmentedValue = value;
    valueParts = nextParts;
    dirtySinceFocus = true;
    render(collapsed(nextCaret));
    dispatchInput(inputType, insertedParts.length > 0 ? insertedParts.join("") : null);
  }

  function dispatchInput(inputType: string, data: string | null): void {
    const event = new InputEvent("input", {
      bubbles: true,
      composed: true,
      data,
      inputType,
      isComposing: composition !== undefined,
    });
    const previous = dispatchingInput;
    dispatchingInput = event;
    try {
      input.dispatchEvent(event);
    } finally {
      dispatchingInput = previous;
    }
  }

  function traverseHistory(inputType: "historyUndo" | "historyRedo", edit: Edit): void {
    breakHistoryGroup();
    pendingEdit = undefined;
    if (composition || edit.isComposing || isDisabled(input) || input.readOnly) {
      render();
      return;
    }

    const undo = inputType === "historyUndo";
    const source = undo ? undoStack : redoStack;
    const destination = undo ? redoStack : undoStack;
    const entry = source.pop();
    if (!entry) {
      render(edit);
      return;
    }

    // Move the same transaction; later caret movement must not rewrite history.
    destination.push(entry);
    const snapshot = undo ? entry.before : entry.after;
    value = snapshot.value;
    dirtySinceFocus = true;
    render(snapshot);
    dispatchInput(inputType, null);
  }

  function beginComposition(selection: Selection): CompositionState {
    const { start, end } = selection;
    const nextComposition = {
      start,
      end,
      direction: selection.direction ?? "none",
      originalText: getParts().slice(start, end).join(""),
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
    pendingEdit = undefined;
    if (isDisabled(input) || input.readOnly) {
      render(currentComposition);
      return true;
    }
    replace({ ...currentComposition, data: text, inputType: "insertFromComposition" }, text);
    return true;
  }

  function executeEdit(edit: Edit): void {
    const { data, inputType } = edit;
    let { end, start } = edit;

    if (inputType === "historyUndo" || inputType === "historyRedo") {
      traverseHistory(inputType, edit);
      return;
    }

    if (historyGroup && historyGroup.inputType !== inputType) {
      breakHistoryGroup();
    }

    if (isDisabled(input) || input.readOnly) {
      render({ start, end });
      return;
    }

    const parts = getParts();
    let insertedText = "";
    switch (inputType) {
      case "insertCompositionText": {
        const currentComposition = composition ?? beginComposition(edit);
        currentComposition.currentText = sanitize(data ?? "");
        render();
        const offset =
          offsetAtGraphemeIndex(parts, currentComposition.start) +
          currentComposition.currentText.length;
        renderSelection(collapsed(graphemeIndexAtOffset(displayParts, offset, true)));
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
        if (!data) {
          render({ start, end });
          return;
        }
        insertedText = data;
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

    replace(edit, insertedText, start, end);
  }

  function setPendingEdit(edit: Edit): void {
    pendingEdit = edit;
    queueMicrotask(() => {
      if (pendingEdit === edit) {
        pendingEdit = undefined;
      }
    });
  }

  function captureTransfer(
    data: string,
    inputType: "insertFromDrop" | "insertFromPaste",
    source: Event,
  ): void {
    setPendingEdit({ ...selection(), data, inputType, source });
  }

  function handleBeforeInput(event: InputEvent): void {
    const pending = pendingEdit;
    pendingEdit = undefined;
    if (event.defaultPrevented) {
      breakHistoryGroup();
      render();
      return;
    }
    const transfer =
      pending?.source && pending.inputType === event.inputType && !pending.source.defaultPrevented
        ? pending.data
        : null;
    const edit: Edit = {
      ...selection(),
      data: event.dataTransfer?.getData("text/plain") ?? transfer ?? event.data,
      inputType: event.inputType,
      isComposing: event.isComposing,
    };

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

    if (event.defaultPrevented || event.isComposing || composition || event.altKey) {
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
    if (event === dispatchingInput) {
      return;
    }

    event.stopImmediatePropagation();
    const pending = pendingEdit;
    pendingEdit = undefined;

    if (pending && pending.inputType === event.inputType && !pending.source?.defaultPrevented) {
      executeEdit(pending);
      return;
    }

    breakHistoryGroup();
    render(selection());
  }

  function handleNativeChange(event: Event): void {
    if (event === dispatchingChange) {
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

  function handleSelectionChange(): void {
    if (!historyGroup) {
      return;
    }
    const { start, end } = selection();
    if (start !== end || start !== historyGroup.after.start) {
      breakHistoryGroup();
    }
  }

  function breakHistoryGroup(): void {
    historyGroup = undefined;
  }

  function handlePaste(event: ClipboardEvent): void {
    if (event.clipboardData) {
      captureTransfer(event.clipboardData.getData("text/plain"), "insertFromPaste", event);
    }
  }

  function handleDrop(event: DragEvent): void {
    if (event.dataTransfer) {
      captureTransfer(event.dataTransfer.getData("text/plain"), "insertFromDrop", event);
    }
  }

  function handleCompositionStart(event: CompositionEvent): void {
    event.preventDefault();
    breakHistoryGroup();
    pendingEdit = undefined;
    skipCompositionCommit = false;
    composition = undefined;
    if (!event.defaultPrevented && !isDisabled(input) && !input.readOnly) {
      beginComposition(selection());
    }
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
    installFormHandlers(input);
    breakHistoryGroup();
    valueAtFocus = value;
    dirtySinceFocus = false;
    render();
  }

  function handleBlur(): void {
    composition = undefined;
    pendingEdit = undefined;
    skipCompositionCommit = false;
    breakHistoryGroup();
    render();
    const changed = dirtySinceFocus && value !== valueAtFocus;
    dirtySinceFocus = false;
    if (!changed) {
      return;
    }
    const event = new Event("change", { bubbles: true });
    const previous = dispatchingChange;
    dispatchingChange = event;
    try {
      input.dispatchEvent(event);
    } finally {
      dispatchingChange = previous;
    }
  }

  return {
    reset,
    state,
  };
}

/**
 * Enhance and return the same native input. Options apply only on the first call;
 * subsequent calls refresh form bindings without changing secret state.
 */
export function mask(input: HTMLInputElement, options: MaskOptions = {}): SecretInput {
  const masked = input as SecretInput;
  if (controllers.has(input)) {
    installFormHandlers(input);
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
  Object.defineProperties(masked, {
    defaultSecretValue: {
      get: () => controller.state.defaultValue,
      set: (nextValue: string) => {
        controller.state.defaultValue = nextValue;
      },
    },
    redacted: {
      get: () => controller.state.redacted,
      set: (nextValue: boolean) => {
        controller.state.redacted = nextValue;
      },
    },
    secretValue: {
      get: () => controller.state.value,
      set: (nextValue: string) => {
        controller.state.value = nextValue;
      },
    },
  });
  controllers.set(input, controller);

  installFormHandlers(input);
  return masked;
}
