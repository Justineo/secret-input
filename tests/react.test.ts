import { act, createElement, createRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { SecretInput } from "../src/react.ts";
import { beforeInput, formDataFor, insertText } from "./edit.ts";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true });

describe("React SecretInput", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    document.body.replaceChildren();
  });

  it("bridges controlled values and keeps the native input surface", async () => {
    const inputRef = createRef<HTMLInputElement>();
    const onValueChange = vi.fn();
    const presentedValues: string[] = [];

    await act(async () => {
      root.render(
        createElement(
          "form",
          null,
          createElement(SecretInput, {
            className: "field",
            name: "token",
            onInput: (event) => presentedValues.push(event.currentTarget.value),
            onValueChange,
            ref: inputRef,
            value: "first",
          }),
        ),
      );
    });

    const input = inputRef.current;
    expect(input).toBeInstanceOf(HTMLInputElement);
    expect(input?.className).toBe("field");
    expect(input?.name).toBe("token");
    expect(input?.type).toBe("text");
    expect(input?.value).toBe("•••••");
    expect(formDataFor(input!.form!).get("token")).toBe("first");

    await act(async () => {
      insertText(input!, "!");
    });
    expect(onValueChange).toHaveBeenCalledWith("first!");
    expect(presentedValues).toEqual(["••••••"]);
    expect(input?.value).toBe("•••••");

    await act(async () => {
      root.render(
        createElement("form", null, createElement(SecretInput, { ref: inputRef, value: "next" })),
      );
    });
    expect(inputRef.current).toBe(input);
    expect(input?.value).toBe("••••");
  });

  it("supports an uncontrolled default value and reveal state", async () => {
    await act(async () => {
      root.render(createElement(SecretInput, { defaultValue: "visible", redacted: false }));
    });

    expect(container.querySelector("input")?.value).toBe("visible");
  });

  it("preserves undo when a controlled owner accepts an edit", async () => {
    function Fixture() {
      const [value, setValue] = useState("first");
      return createElement(SecretInput, { onValueChange: setValue, value });
    }

    await act(async () => root.render(createElement(Fixture)));
    const input = container.querySelector("input")!;

    await act(async () => insertText(input, "!"));
    expect(input.value).toBe("••••••");

    await act(async () => beforeInput(input, "historyUndo"));
    expect(input.value).toBe("•••••");
  });

  it("does not surface browser-written DOM values", async () => {
    const onInput = vi.fn();
    const onValueChange = vi.fn();
    await act(async () => {
      root.render(createElement(SecretInput, { onInput, onValueChange, value: "kept" }));
    });

    const input = container.querySelector("input")!;
    input.value = "browser-filled";
    input.dispatchEvent(new InputEvent("input", { bubbles: true }));

    expect(onValueChange).not.toHaveBeenCalled();
    expect(onInput).not.toHaveBeenCalled();
    expect(input.value).toBe("••••");
  });
});
