import { act, createElement, createRef, useState } from "react";
import type { InputEvent } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { SecretInput } from "../src/react.ts";
import type { SecretInput as SecretInputElement } from "../src/index.ts";
import { beforeInput, composition, formDataFor, insertText } from "./edit.ts";

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
    const inputRef = createRef<SecretInputElement>();
    const presentedValues: string[] = [];
    const onInput = vi.fn((_value: string, event: InputEvent<HTMLInputElement>) => {
      presentedValues.push(event.currentTarget.value);
    });

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
            onInput,
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
    expect(onInput).toHaveBeenCalledWith("first!", expect.anything());
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
    const ref = createRef<SecretInputElement>();
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
      return createElement(SecretInput, { onInput: setValue, value });
    }

    await act(async () => root.render(createElement(Fixture)));
    const input = container.querySelector("input")!;

    await act(async () => insertText(input, "!"));
    expect(input.value).toBe("••••••");

    await act(async () => beforeInput(input, "historyUndo"));
    expect(input.value).toBe("•••••");
  });

  it("does not surface browser-written DOM values", async () => {
    const onChange = vi.fn();
    const onInput = vi.fn();
    await act(async () => {
      root.render(createElement(SecretInput, { onChange, onInput, value: "kept" }));
    });

    const input = container.querySelector("input")!;
    input.value = "browser-filled";
    input.dispatchEvent(new InputEvent("input", { bubbles: true }));

    expect(onChange).not.toHaveBeenCalled();
    expect(onInput).not.toHaveBeenCalled();
    expect(input.value).toBe("••••");
  });

  it("reports input immediately and change on blur", async () => {
    const onChange = vi.fn();
    const onInput = vi.fn();
    await act(async () => {
      root.render(
        createElement(SecretInput, {
          defaultValue: "first",
          onChange,
          onInput,
        }),
      );
    });

    const input = container.querySelector("input")!;
    input.focus();
    await act(async () => insertText(input, "!"));

    expect(onInput).toHaveBeenCalledWith("first!", expect.anything());
    expect(onChange).not.toHaveBeenCalled();

    input.blur();
    expect(onChange).toHaveBeenCalledWith("first!", expect.any(Event));
  });
  it("preserves a composition while synchronizing an unchanged controlled value", async () => {
    const ref = createRef<SecretInputElement>();
    await act(async () => root.render(createElement(SecretInput, { ref, value: "ab" })));
    const input = ref.current!;
    input.setSelectionRange(1, 2);
    composition(input, "compositionstart");
    beforeInput(input, "insertCompositionText", "ni");
    await act(async () =>
      root.render(createElement(SecretInput, { ref, value: "ab", defaultValue: "reset" })),
    );
    expect(input.value).toBe("•••");
    const received = vi.fn();
    input.addEventListener("input", received);
    await act(async () => {
      composition(input, "compositionend", "你");
    });
    expect(received).toHaveBeenCalledOnce();
    expect(input.secretValue).toBe("ab");
  });
  it("keeps redo through controlled renders and discards it on a new branch", async () => {
    const ref = createRef<SecretInputElement>();
    function Fixture() {
      const [value, setValue] = useState("base");
      return createElement(SecretInput, { ref, value, onInput: setValue });
    }
    await act(async () => root.render(createElement(Fixture)));
    const input = ref.current!;
    await act(async () => insertText(input, "x"));
    await act(async () => beforeInput(input, "historyUndo"));
    expect(input.secretValue).toBe("base");
    await act(async () => beforeInput(input, "historyRedo"));
    expect(input.secretValue).toBe("basex");
    await act(async () => beforeInput(input, "historyUndo"));
    await act(async () => insertText(input, "y"));
    await act(async () => beforeInput(input, "historyRedo"));
    expect(input.secretValue).toBe("basey");
    await act(async () => beforeInput(input, "historyUndo"));
    expect(input.secretValue).toBe("base");
  });
});
