const graphemeSegmenter =
  typeof Intl.Segmenter === "function"
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
    : undefined;

export function splitGraphemes(value: string): string[] {
  if (!graphemeSegmenter) {
    // Current supported browsers have Intl.Segmenter. Array.from is a safe
    // code-point fallback for older embedding environments.
    return Array.from(value);
  }

  return Array.from(graphemeSegmenter.segment(value), ({ segment }) => segment);
}

const wordCharacter = /^[\p{Letter}\p{Mark}\p{Number}_]+$/u;

type CharacterKind = "space" | "word" | "other";

function characterKind(value: string): CharacterKind {
  if (/^\s+$/u.test(value)) {
    return "space";
  }

  return wordCharacter.test(value) ? "word" : "other";
}

export function previousWordBoundary(parts: readonly string[], caret: number): number {
  let index = Math.min(Math.max(caret, 0), parts.length);

  while (index > 0 && characterKind(parts[index - 1] ?? "") === "space") {
    index -= 1;
  }

  const kind = index > 0 ? characterKind(parts[index - 1] ?? "") : undefined;
  while (index > 0 && characterKind(parts[index - 1] ?? "") === kind) {
    index -= 1;
  }

  return index;
}

export function nextWordBoundary(parts: readonly string[], caret: number): number {
  let index = Math.min(Math.max(caret, 0), parts.length);

  while (index < parts.length && characterKind(parts[index] ?? "") === "space") {
    index += 1;
  }

  const kind = index < parts.length ? characterKind(parts[index] ?? "") : undefined;
  while (index < parts.length && characterKind(parts[index] ?? "") === kind) {
    index += 1;
  }

  return index;
}
