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

export function graphemeIndexAtOffset(
  graphemes: readonly string[],
  offset: number,
  roundUp = false,
): number {
  let currentOffset = 0;

  for (const [index, grapheme] of graphemes.entries()) {
    const nextOffset = currentOffset + grapheme.length;
    if (offset < nextOffset) {
      return roundUp && offset > currentOffset ? index + 1 : index;
    }
    if (offset === nextOffset) {
      return index + 1;
    }
    currentOffset = nextOffset;
  }

  return graphemes.length;
}

export function offsetAtGraphemeIndex(graphemes: readonly string[], index: number): number {
  let offset = 0;
  for (let position = 0; position < Math.min(index, graphemes.length); position += 1) {
    offset += graphemes[position]!.length;
  }
  return offset;
}
