import { describe, expect, it } from "vite-plus/test";

import { nextWordBoundary, previousWordBoundary, splitGraphemes } from "../src/graphemes.ts";

describe("splitGraphemes", () => {
  it("keeps surrogate pairs and combining sequences intact", () => {
    expect(splitGraphemes("A🔐e\u0301")).toEqual(["A", "🔐", "e\u0301"]);
  });

  it("keeps emoji ZWJ sequences intact", () => {
    expect(splitGraphemes("👩‍💻")).toEqual(["👩‍💻"]);
  });
});

describe("word boundaries", () => {
  const parts = splitGraphemes("one  two!");

  it("finds the previous editable word", () => {
    expect(previousWordBoundary(parts, 8)).toBe(5);
  });

  it("finds the next editable word", () => {
    expect(nextWordBoundary(parts, 3)).toBe(8);
  });
});
