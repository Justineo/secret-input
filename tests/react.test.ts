import { act, createElement, createRef, useState } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
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
            autoCapitalize: "words",
            autoComplete: "current-password",
            autoCorrect: "on",
            className: "field",
            name: "token",
            onInput: (event) => presentedValues.push(event.currentTarget.value),
            onValueChange,
            ref: inputRef,
            spellCheck: true,
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
    expect(input?.autocomplete).toBe("off");
    expect(input?.getAttribute("autocapitalize")).toBe("words");
    expect(input?.getAttribute("autocorrect")).toBe("on");
    expect(input?.getAttribute("spellcheck")).toBe("true");
    expect(input?.getAttribute("data-1p-ignore")).toBe("");
    expect(input?.getAttribute("data-form-type")).toBe("other");
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

  it("server-renders the initial masked presentation and discards pre-hydration values", async () => {
    const value = "a👩‍💻e\u0301";
    const ref = createRef<HTMLInputElement>();
    const element = createElement(SecretInput, { ref, value });
    const markup = renderToString(element);
    const serverContainer = document.createElement("div");
    serverContainer.innerHTML = markup;
    document.body.append(serverContainer);
    const input = serverContainer.querySelector("input")!;

    expect(input.type).toBe("text");
    expect(input.autocomplete).toBe("off");
    expect(input.getAttribute("autocapitalize")).toBe("off");
    expect(input.hasAttribute("data-1p-ignore")).toBe(true);
    expect(input.getAttribute("value")).toBe("•••");
    expect(markup).not.toContain(value);

    input.value = "browser-filled";
    const hydratedRoot = hydrateRoot(serverContainer, element);
    await act(async () => {});

    expect(ref.current).toBe(input);
    expect(input.value).toBe("•••");

    await act(async () => hydratedRoot.unmount());
  });

  it("keeps plaintext out of server output before revealing on hydration", async () => {
    const value = "visible";
    const element = createElement(SecretInput, { redacted: false, value });
    const serverContainer = document.createElement("div");
    serverContainer.innerHTML = renderToString(element);
    document.body.append(serverContainer);

    expect(serverContainer.querySelector("input")?.value).toBe("•••••••");
    expect(serverContainer.innerHTML).not.toContain(value);

    const hydratedRoot = hydrateRoot(serverContainer, element);
    await act(async () => {});

    expect(serverContainer.querySelector("input")?.value).toBe(value);
    await act(async () => hydratedRoot.unmount());
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
