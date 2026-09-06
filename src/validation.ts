export interface ValidationRules {
  pattern?: string | undefined;
  minLength?: number | undefined;
  maxLength?: number | undefined;
}

export function createValidation(
  input: HTMLInputElement,
): (value: string, rules: ValidationRules) => string {
  let validator: HTMLInputElement | undefined;
  let previous: readonly unknown[] | undefined;
  let message = "";

  function getMessage(value: string, pattern: string | undefined, invalidLength: boolean): string {
    if (!value || (pattern === undefined && !invalidLength)) {
      return "";
    }
    if (!validator || validator.ownerDocument !== input.ownerDocument) {
      validator = input.ownerDocument.createElement("input");
      validator.type = "password";
    }
    const probe = validator;
    probe.title = input.title;
    probe.lang = input.lang;
    try {
      if (pattern !== undefined) {
        probe.pattern = pattern;
        probe.value = value;
        const message = probe.validationMessage;
        if (message) return message;
      }
      if (!invalidLength) return "";
      // Scripted values cannot trigger native length messages. Use a fixed,
      // non-secret mismatch to obtain the browser's localized format message.
      probe.pattern = "(?!)";
      probe.value = "x";
      return probe.validationMessage;
    } finally {
      probe.value = "";
    }
  }

  return (value, { pattern, minLength = 0, maxLength }): string => {
    const dependencies = [
      value,
      pattern,
      minLength,
      maxLength,
      input.title,
      input.lang,
      input.ownerDocument,
    ];
    if (previous?.every((dependency, index) => dependency === dependencies[index])) {
      return message;
    }
    const invalidLength =
      value.length < minLength || (maxLength !== undefined && value.length > maxLength);
    message = getMessage(value, pattern, invalidLength);
    previous = dependencies;
    return message;
  };
}
