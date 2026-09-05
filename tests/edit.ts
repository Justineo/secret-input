export function beforeInput(
  input: HTMLInputElement,
  inputType: string,
  data: string | null = null,
  cancelable = true,
): InputEvent {
  const event = new InputEvent("beforeinput", {
    bubbles: true,
    cancelable,
    composed: true,
    data,
    inputType,
  });
  input.dispatchEvent(event);
  return event;
}

export function insertText(input: HTMLInputElement, text: string): void {
  input.setSelectionRange(input.value.length, input.value.length);
  beforeInput(input, "insertText", text);
}

export function formDataFor(form: HTMLFormElement): FormData {
  const formData = new FormData(form);
  const event = new Event("formdata");
  Object.defineProperty(event, "formData", { value: formData });
  form.dispatchEvent(event);
  return formData;
}

export function composition(
  input: HTMLInputElement,
  type: "compositionend" | "compositionstart",
  data = "",
): void {
  const event = new CompositionEvent(type, { bubbles: true });
  Object.defineProperty(event, "data", { value: data });
  input.dispatchEvent(event);
}
