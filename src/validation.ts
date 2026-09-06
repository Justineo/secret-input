export interface ValidationMessageContext {
  readonly type: "valueMissing" | "patternMismatch" | "tooShort" | "tooLong";
  readonly defaultMessage: string;
  /** Length of the actual value in UTF-16 code units. */
  readonly valueLength: number;
  readonly minLength: number;
  readonly maxLength: number | undefined;
  readonly pattern: string | undefined;
}

export type ValidationMessages = {
  [Type in ValidationMessageContext["type"]]?:
    | string
    | ((context: ValidationMessageContext) => string | undefined)
    | undefined;
};

export interface ValidationRules {
  pattern?: string | undefined;
  minLength?: number | undefined;
  maxLength?: number | undefined;
  /** Per-rule message overrides. Empty results or formatter exceptions use the default. */
  validationMessages?: ValidationMessages | undefined;
}

type Failure = Pick<ValidationMessageContext, "type" | "defaultMessage">;

export function createValidation(
  input: HTMLInputElement,
): (value: string, rules: ValidationRules) => string {
  let validator: HTMLInputElement | undefined;
  let previous: readonly unknown[] | undefined;
  let failure: Failure | undefined;

  function nativeMessage(value: string, pattern: string | undefined, required = false): string {
    if (!validator || validator.ownerDocument !== input.ownerDocument) {
      validator = input.ownerDocument.createElement("input");
      validator.type = "password";
    }
    const probe = validator;
    probe.title = input.title;
    probe.lang = input.lang;
    probe.required = required;
    if (pattern === undefined) probe.removeAttribute("pattern");
    else probe.pattern = pattern;
    try {
      probe.value = value;
      return probe.validationMessage;
    } finally {
      probe.value = "";
    }
  }

  function getFailure(
    value: string,
    pattern: string | undefined,
    minLength: number,
    maxLength: number | undefined,
    needsRequiredMessage: boolean,
  ): Failure | undefined {
    if (!value) {
      if (!input.required) return;
      return {
        type: "valueMissing",
        defaultMessage: needsRequiredMessage ? nativeMessage("", undefined, true) : "",
      };
    }
    if (pattern !== undefined) {
      const defaultMessage = nativeMessage(value, pattern);
      if (defaultMessage) return { type: "patternMismatch", defaultMessage };
    }
    // Scripted values cannot trigger native tooShort/tooLong messages.
    if (value.length < minLength) {
      return { type: "tooShort", defaultMessage: "The value is too short." };
    }
    if (maxLength !== undefined && value.length > maxLength) {
      return { type: "tooLong", defaultMessage: "The value is too long." };
    }
  }

  return (value, { pattern, minLength = 0, maxLength, validationMessages }): string => {
    const needsRequiredMessage = typeof validationMessages?.valueMissing === "function";
    const dependencies = [
      value,
      pattern,
      minLength,
      maxLength,
      input.required,
      needsRequiredMessage,
      input.title,
      input.lang,
      input.ownerDocument,
    ];
    if (!previous?.every((dependency, index) => dependency === dependencies[index])) {
      failure = getFailure(value, pattern, minLength, maxLength, needsRequiredMessage);
      previous = dependencies;
    }
    if (!failure) return "";
    const override = validationMessages?.[failure.type];
    // Re-evaluate formatters on synchronization, while caching native checks.
    const fallback = failure.type === "valueMissing" ? "" : failure.defaultMessage;
    try {
      const message =
        typeof override === "function"
          ? override({ ...failure, valueLength: value.length, minLength, maxLength, pattern })
          : override;
      return message || fallback;
    } catch {
      // Optional wording must not interrupt editing or bypass the failing rule.
      return fallback;
    }
  };
}
