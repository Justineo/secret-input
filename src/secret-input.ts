import {
  graphemeIndexAtOffset,
  nextWordBoundary,
  offsetAtGraphemeIndex,
  previousWordBoundary,
  splitGraphemes,
} from "./graphemes.ts";
import { passwordManagerAttributes } from "./password-manager.ts";
import { createValidation } from "./validation.ts";
import type { ValidationRules } from "./validation.ts";

const MASK = "•";

function sanitize(value: string): string {
  return value.replace(/[\r\n]/gu, "");
}

export function redact(value: string): string {
  return MASK.repeat(splitGraphemes(sanitize(value)).length);
}

export interface SecretInputOptions extends ValidationRules {
  /** Actual value. At creation, defaults to defaultValue, then the empty string. */
  value?: string | undefined;
  /** Form-reset value. At creation, defaults to the initial actual value. */
  defaultValue?: string | undefined;
  /** Reveal plaintext explicitly. Defaults to false. */
  revealed?: boolean | undefined;
  /** Mirrors native requiredness on the input. Defaults to false. */
  required?: boolean | undefined;
  /** Application error, retained until explicitly cleared with an empty string or undefined. */
  customValidity?: string | undefined;
}

export interface SecretInputController {
  readonly input: HTMLInputElement;
  /** Authoritative secret; input.value is presentation only. */
  readonly value: string;
  readonly defaultValue: string;
  readonly revealed: boolean;
  /** Apply a synchronous patch. Omitted keys are unchanged; undefined clears a setting. */
  update(options: SecretInputOptions): void;
}

function validateLengths({ minLength, maxLength }: ValidationRules): void {
  for (const length of [minLength, maxLength]) {
    if (length !== undefined && (!Number.isInteger(length) || length < 0 || length > 2 ** 31 - 1)) {
      throw new RangeError("Length limits must be integers between 0 and 2147483647.");
    }
  }
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
  originalText: string;
}

interface HistoryEntry {
  readonly before: Snapshot;
  after: Snapshot;
  readonly inputType: string;
}

interface Controller extends SecretInputController {
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

// Count native entries only to locate managed fields; keep their values, files,
// and order from the browser's FormData rather than serializing the form again.
function entryCount(element: Element): number {
  if (element.matches(":disabled") || element.closest("datalist")) return 0;
  if (element.localName === "textarea") return 1;
  if (element.localName === "select") {
    return Array.from((element as HTMLSelectElement).selectedOptions).filter(
      (option) => !option.matches(":disabled"),
    ).length;
  }
  if (element.localName !== "input") return 0;
  const input = element as HTMLInputElement;
  switch (input.type) {
    case "button":
    case "reset":
    case "submit":
    case "image":
      return 0;
    case "checkbox":
    case "radio":
      return Number(input.checked);
    case "file":
      return Math.max(input.files?.length ?? 0, 1);
    default:
      return 1;
  }
}

function installRootHandlers(root: Node): void {
  if (installedRoots.has(root)) return;
  installedRoots.add(root);
  root.addEventListener("formdata", handleFormData, true);
  root.addEventListener("reset", handleFormReset, true);
}

function handleFormData(event: Event): void {
  if (!isFormDataEvent(event) || !isForm(event.target) || handledFormEvents.has(event)) {
    return;
  }

  handledFormEvents.add(event);
  const byName = new Map<string, (Controller | undefined)[]>();
  for (const element of event.target.elements) {
    const name = element.getAttribute("name");
    if (!name) continue;
    const count = entryCount(element);
    if (!count) continue;
    const group = byName.get(name) ?? [];
    const controller = controllers.get(element as HTMLInputElement);
    for (let index = 0; index < count; index++) group.push(controller);
    byName.set(name, group);
  }

  for (const [name, group] of byName) {
    if (!group.some(Boolean) || event.formData.getAll(name).length !== group.length) {
      // Submitters, dirname, custom elements, and earlier formdata listeners
      // must use separate names: their entries cannot be mapped to inputs.
      byName.delete(name);
    }
  }
  if (!byName.size) return;

  const entries = Array.from(event.formData, ([name, value]) => {
    const controller = byName.get(name)?.shift();
    return [name, controller?.value ?? value] as const;
  });
  for (const name of new Set(event.formData.keys())) event.formData.delete(name);
  for (const [name, value] of entries) event.formData.append(name, value);
}

function handleFormReset(event: Event): void {
  if (!isForm(event.target) || handledFormEvents.has(event)) {
    return;
  }

  handledFormEvents.add(event);
  const form = event.target;
  const finishReset = (): void => {
    if (event.defaultPrevented) {
      return;
    }

    // Native activation can run microtasks between reset listeners. Wait for
    // dispatch and the browser's own reset before restoring secret state.
    if (event.eventPhase !== Event.NONE) {
      setTimeout(finishReset, 0);
      return;
    }

    for (const element of form.elements) {
      if (element.localName === "input") {
        controllers.get(element as HTMLInputElement)?.reset();
      }
    }
  };
  queueMicrotask(finishReset);
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

function createController(input: HTMLInputElement, options: SecretInputOptions): Controller {
  let composition: CompositionState | undefined;
  let customValidity = String(options.customValidity ?? "");
  let defaultValue = sanitize(String(options.defaultValue ?? options.value ?? ""));
  let dirtySinceCommit = false;
  let dispatchingChange: Event | undefined;
  let dispatchingInput: InputEvent | undefined;
  let historyGroup: HistoryEntry | undefined;
  let pendingEdit: Edit | undefined;
  let revealed = options.revealed ?? false;
  const redoStack: HistoryEntry[] = [];
  let skipCompositionCommit = false;
  const undoStack: HistoryEntry[] = [];
  let value = sanitize(String(options.value ?? options.defaultValue ?? ""));
  const rules: ValidationRules = {
    pattern: options.pattern,
    minLength: options.minLength,
    maxLength: options.maxLength,
    validationMessages: options.validationMessages,
  };
  const validate = createValidation(input);
  input.required = options.required ?? false;
  let valueAtCommit = value;
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

  function update(options: SecretInputOptions): void {
    validateLengths(options);
    const currentSelection = selection();
    const nextValue = "value" in options ? sanitize(String(options.value ?? "")) : value;
    const nextRevealed = "revealed" in options ? Boolean(options.revealed) : revealed;
    const valueChanged = nextValue !== value;
    if (valueChanged) {
      clearPendingInput();
      clearHistory();
      value = nextValue;
    } else if (nextRevealed !== revealed) {
      clearPendingInput();
      historyGroup = undefined;
    }
    revealed = nextRevealed;
    if ("defaultValue" in options) defaultValue = sanitize(String(options.defaultValue ?? ""));
    if ("required" in options) input.required = options.required ?? false;
    if ("customValidity" in options) customValidity = String(options.customValidity ?? "");
    if ("pattern" in options) rules.pattern = options.pattern;
    if ("minLength" in options) rules.minLength = options.minLength;
    if ("maxLength" in options) rules.maxLength = options.maxLength;
    if ("validationMessages" in options) rules.validationMessages = options.validationMessages;
    installFormHandlers(input);
    render(valueChanged ? collapsed(getParts().length) : currentSelection);
  }

  input.addEventListener("beforeinput", handleBeforeInput);
  input.addEventListener("keydown", handleKeyDown);
  input.addEventListener("keypress", handleKeyPress);
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

  function clearPendingInput(): void {
    composition = undefined;
    pendingEdit = undefined;
    skipCompositionCommit = false;
  }

  function clearHistory(): void {
    historyGroup = undefined;
    undoStack.length = 0;
    redoStack.length = 0;
  }

  function reset(): void {
    clearPendingInput();
    value = defaultValue;
    render(collapsed(getParts().length));
    valueAtCommit = value;
    clearHistory();
    dirtySinceCommit = false;
  }

  function selection(): Selection {
    const length = getParts().length;
    const startOffset = input.selectionStart ?? length;
    const endOffset = input.selectionEnd ?? startOffset;
    const start = revealed ? graphemeIndexAtOffset(displayParts, startOffset) : startOffset;
    const end = revealed
      ? graphemeIndexAtOffset(displayParts, endOffset, endOffset > startOffset)
      : endOffset;
    const safeStart = clamp(start, 0, length);

    return {
      direction: input.selectionDirection ?? "none",
      start: safeStart,
      end: clamp(end, safeStart, length),
    };
  }

  function render(selection?: Selection): void {
    getParts();
    displayParts = valueParts;
    const presentation = revealed ? value : MASK.repeat(displayParts.length);
    if (input.value !== presentation) {
      input.value = presentation;
    }
    input.setCustomValidity(customValidity || validate(value, rules));

    if (selection) {
      renderSelection(selection);
    }
  }

  function renderSelection(selection: Selection): void {
    if (!revealed) {
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
    const prefix = parts.slice(0, safeStart).join("");
    const suffix = parts.slice(safeEnd).join("");
    let insertedParts = splitGraphemes(sanitize(insertedText));
    const maxLength = rules.maxLength ?? -1;

    if (maxLength >= 0) {
      const available = Math.max(maxLength - prefix.length - suffix.length, 0);
      let insertedLength = 0;
      const firstOverflow = insertedParts.findIndex((part) => {
        insertedLength += part.length;
        return insertedLength > available;
      });
      if (firstOverflow >= 0) {
        insertedParts = insertedParts.slice(0, firstOverflow);
      }
    }

    const inserted = insertedParts.join("");
    const nextValue = prefix + inserted + suffix;
    // Segmentation can change across either splice boundary (combining marks,
    // regional indicators, ZWJ sequences). Map the resulting UTF-16 offset.
    const nextOffset = prefix.length + inserted.length;
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
    dirtySinceCommit = true;
    render(collapsed(nextCaret));
    dispatchInput(inputType, inserted || null);
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
    dirtySinceCommit = true;
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
        // Replacing browser-written drafts can end the engine's composition.
        // Keep the original replacement range for either compositionend or the
        // ordinary insertText that some engines deliver after that interruption.
        render(currentComposition);
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
        if (composition && inputType === "insertText") {
          if (edit.isComposing) {
            render(composition);
          } else {
            commitComposition(data);
          }
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
        if (!revealed) {
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

  function setPendingEdit(edit: Edit, source: Event): void {
    pendingEdit = edit;
    const expire = (): void => {
      if (pendingEdit !== edit) {
        return;
      }
      // Native dispatch can run microtasks before its input/default action.
      // Synthetic dispatch still expires at the ordinary microtask boundary.
      if (source.eventPhase !== Event.NONE) {
        setTimeout(expire, 0);
        return;
      }
      pendingEdit = undefined;
    };
    queueMicrotask(expire);
  }

  function captureTransfer(
    data: string,
    inputType: "insertFromDrop" | "insertFromPaste",
    source: Event,
  ): void {
    setPendingEdit({ ...selection(), data, inputType, source }, source);
  }

  function handleBeforeInput(event: InputEvent): void {
    const pending = pendingEdit;
    pendingEdit = undefined;
    if (event.defaultPrevented) {
      breakHistoryGroup();
      render();
      return;
    }
    // Single-line inputs use this action for Enter/implicit submission.
    // There is no newline to insert, and canceling it can suppress submission.
    if (event.inputType === "insertLineBreak" || event.inputType === "insertParagraph") {
      if (!event.isComposing && !composition) {
        commitChange();
      }
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
      setPendingEdit(edit, event);
      return;
    }

    event.preventDefault();
    executeEdit(edit);
  }

  function handleKeyPress(event: KeyboardEvent): void {
    // Safari can submit a single-line input without a line-break beforeinput event.
    // keypress follows an uncanceled keydown and precedes native form validation.
    if (event.key === "Enter" && !event.defaultPrevented && !event.isComposing && !composition) {
      commitChange();
    }
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
    if (!revealed) {
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
    clearPendingInput();
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
    valueAtCommit = value;
    dirtySinceCommit = false;
    render();
  }

  function handleBlur(): void {
    clearPendingInput();
    breakHistoryGroup();
    render();
    commitChange();
  }

  function commitChange(): void {
    breakHistoryGroup();
    const changed = dirtySinceCommit && value !== valueAtCommit;
    dirtySinceCommit = false;
    valueAtCommit = value;
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
    input,
    get value() {
      return value;
    },
    get defaultValue() {
      return defaultValue;
    },
    get revealed() {
      return revealed;
    },
    update,
    reset,
  };
}

/** Create one controller per input. Repeated creation returns it without reinitializing. */
export function createSecretInput(
  input: HTMLInputElement,
  options: SecretInputOptions = {},
): SecretInputController {
  const existing = controllers.get(input);
  if (existing) return existing;
  validateLengths(options);

  input.type = "text";
  // These rules belong to the controller and must never validate presentation.
  // Existing native attributes are removed, not adopted as configuration.
  for (const name of ["pattern", "minlength", "maxlength"]) input.removeAttribute(name);
  input.autocomplete = "off";
  for (const [name, attributeValue] of Object.entries(passwordManagerAttributes)) {
    input.setAttribute(name, attributeValue);
  }
  setDefaultAttribute(input, "autocapitalize", "off");
  setDefaultAttribute(input, "autocorrect", "off");
  setDefaultAttribute(input, "spellcheck", "false");
  input.style.setProperty("ime-mode", "disabled");

  // Chromium's custom-password primer never remains as the visible value.
  input.value = MASK.repeat(2);
  const controller = createController(input, options);
  controllers.set(input, controller);
  installFormHandlers(input);
  return controller;
}
