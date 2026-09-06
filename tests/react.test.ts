import { act, createElement, createRef, StrictMode, useState } from "react";
import type { InputEvent } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { SecretInput } from "../src/react.ts";
import { createSecretInput } from "../src/index.ts";
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
    const inputRef = createRef<HTMLInputElement>();
    const presentedValues: string[] = [];
    const onInput = vi.fn((event: InputEvent<HTMLInputElement>) => {
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
            onChange: () => {},
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
    expect(onInput).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ type: "input" }));
    expect(presentedValues).toEqual(["••••••"]);
    expect(input?.value).toBe("•••••");

    await act(async () => {
      root.render(
        createElement(
          "form",
          null,
          createElement(SecretInput, { ref: inputRef, value: "next", onChange: () => {} }),
        ),
      );
    });
    expect(inputRef.current).toBe(input);
    expect(input?.value).toBe("••••");
  });

  it("supports an uncontrolled default value and reveal state", async () => {
    await act(async () => {
      root.render(createElement(SecretInput, { defaultValue: "visible", revealed: true }));
    });

    expect(container.querySelector("input")?.value).toBe("visible");
  });

  it("server-renders the initial masked presentation and discards pre-hydration values", async () => {
    const value = "a👩‍💻e\u0301";
    const ref = createRef<HTMLInputElement>();
    const element = createElement(SecretInput, {
      ref,
      value,
      readOnly: true,
      customValidity: "Server error",
    });
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
    expect(markup).not.toContain("Server error");

    input.value = "browser-filled";
    const hydratedRoot = hydrateRoot(serverContainer, element);
    await act(async () => {});

    expect(ref.current).toBe(input);
    expect(input.value).toBe("•••");
    expect(input.validity.customError).toBe(true);

    await act(async () => hydratedRoot.unmount());
  });

  it("keeps plaintext out of server output before revealing on hydration", async () => {
    const value = "visible";
    const element = createElement(SecretInput, { revealed: true, value, readOnly: true });
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
      return createElement(SecretInput, {
        onChange: setValue,
        value,
      });
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

  it("reports the actual value immediately and does not repeat it on Enter or blur", async () => {
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

    expect(onInput).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ type: "input" }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith("first!");
    beforeInput(input, "insertLineBreak");
    input.blur();
    expect(onChange).toHaveBeenCalledTimes(1);
  });
  it("preserves a composition while synchronizing an unchanged controlled value", async () => {
    const ref = createRef<HTMLInputElement>();
    await act(async () =>
      root.render(createElement(SecretInput, { ref, value: "ab", onChange: () => {} })),
    );
    const input = ref.current!;
    input.setSelectionRange(1, 2);
    composition(input, "compositionstart");
    beforeInput(input, "insertCompositionText", "ni");
    await act(async () =>
      root.render(
        createElement(SecretInput, { ref, value: "ab", onChange: () => {}, className: "changed" }),
      ),
    );
    expect(input.value).toBe("••");
    const received = vi.fn();
    input.addEventListener("input", received);
    await act(async () => {
      composition(input, "compositionend", "你");
    });
    expect(received).toHaveBeenCalledOnce();
    expect(createSecretInput(input).value).toBe("ab");
  });
  it("keeps redo through controlled renders and discards it on a new branch", async () => {
    const ref = createRef<HTMLInputElement>();
    function Fixture() {
      const [value, setValue] = useState("base");
      return createElement(SecretInput, {
        ref,
        value,
        onChange: setValue,
      });
    }
    await act(async () => root.render(createElement(Fixture)));
    const input = ref.current!;
    await act(async () => insertText(input, "x"));
    await act(async () => beforeInput(input, "historyUndo"));
    expect(createSecretInput(input).value).toBe("base");
    await act(async () => beforeInput(input, "historyRedo"));
    expect(createSecretInput(input).value).toBe("basex");
    await act(async () => beforeInput(input, "historyUndo"));
    await act(async () => insertText(input, "y"));
    await act(async () => beforeInput(input, "historyRedo"));
    expect(createSecretInput(input).value).toBe("basey");
    await act(async () => beforeInput(input, "historyUndo"));
    expect(createSecretInput(input).value).toBe("base");
  });
  it("preserves controlled state on reset and lets the parent reset it", async () => {
    const inputRef = createRef<HTMLInputElement>();
    const change = vi.fn();
    function Fixture() {
      const [value, setValue] = useState("base");
      return createElement(
        "form",
        { onReset: () => {} },
        createElement(SecretInput, {
          ref: inputRef,
          name: "token",
          value,
          onChange: (value) => {
            change(value);
            setValue(value);
          },
        }),
        createElement("button", { type: "button", onClick: () => setValue("base") }, "Reset model"),
      );
    }
    await act(async () => root.render(createElement(Fixture)));
    const input = inputRef.current!;
    await act(async () => insertText(input, "x"));
    await act(async () => input.form!.reset());
    expect(createSecretInput(input).value).toBe("basex");
    expect(input.value).toBe("•••••");
    expect(formDataFor(input.form!).get("token")).toBe("basex");
    expect(change).toHaveBeenCalledExactlyOnceWith("basex");
    await act(async () => container.querySelector("button")!.click());
    expect(createSecretInput(input).value).toBe("base");
    expect(input.value).toBe("••••");
    expect(change).toHaveBeenCalledTimes(1);
  });

  it("updates an uncontrolled reset default without replacing the current edit", async () => {
    const inputRef = createRef<HTMLInputElement>();
    const onChange = vi.fn();
    const render = (defaultValue: string) =>
      root.render(
        createElement(
          "form",
          null,
          createElement(SecretInput, { ref: inputRef, defaultValue, onChange }),
        ),
      );
    await act(async () => render("base"));
    const input = inputRef.current!;
    await act(async () => insertText(input, "x"));
    await act(async () => render("next"));
    expect(createSecretInput(input).value).toBe("basex");
    await act(async () => input.form!.reset());
    expect(createSecretInput(input).value).toBe("next");
    expect(input.value).toBe("••••");
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("keeps selection and history when unrelated props and callback refs change", async () => {
    const inputRef = createRef<HTMLInputElement>();
    const cleanup = vi.fn();
    function Fixture({ className }: { className: string }) {
      const [value, setValue] = useState("base");
      return createElement(SecretInput, {
        className,
        value,
        onChange: setValue,
        ref: (element) => {
          inputRef.current = element;
          return cleanup;
        },
      });
    }
    await act(async () =>
      root.render(createElement(StrictMode, null, createElement(Fixture, { className: "first" }))),
    );
    const input = inputRef.current!;
    await act(async () => insertText(input, "x"));
    input.setSelectionRange(1, 3, "backward");
    await act(async () =>
      root.render(createElement(StrictMode, null, createElement(Fixture, { className: "next" }))),
    );
    expect(inputRef.current).toBe(input);
    expect(input.value).toBe("•••••");
    expect([input.selectionStart, input.selectionEnd, input.selectionDirection]).toEqual([
      1,
      3,
      "backward",
    ]);
    expect(cleanup).toHaveBeenCalled();
    await act(async () => beforeInput(input, "historyUndo"));
    expect(createSecretInput(input).value).toBe("base");
  });

  it.each([true, false])(
    "retains custom validity through renders, reset, and controlled acceptance=%s",
    async (accept) => {
      function Fixture(props: { customValidity?: string; pattern?: string; className?: string }) {
        const [value, setValue] = useState("AB");
        return createElement(
          "form",
          null,
          createElement(SecretInput, {
            ...props,
            value,
            onChange: accept ? setValue : () => {},
          }),
        );
      }
      const render = async (props: Parameters<typeof Fixture>[0]) => {
        await act(async () => root.render(createElement(Fixture, props)));
      };
      await render({ customValidity: "Server error", pattern: "[A-Z]+" });
      const input = container.querySelector("input")!;
      expect(input.validationMessage).toBe("Server error");
      expect(input.hasAttribute("customvalidity")).toBe(false);
      await act(async () => insertText(input, "C"));
      expect(createSecretInput(input).value).toBe(accept ? "ABC" : "AB");
      expect(input.validationMessage).toBe("Server error");
      input.setSelectionRange(0, 1, "backward");
      await render({ customValidity: "Server error", pattern: "[A-Z]+", className: "changed" });
      expect(container.querySelector("input")).toBe(input);
      expect(input.validationMessage).toBe("Server error");
      expect([input.selectionStart, input.selectionEnd, input.selectionDirection]).toEqual([
        0,
        1,
        "backward",
      ]);
      await act(async () => input.form!.reset());
      expect(input.validationMessage).toBe("Server error");
      await render({ pattern: "[0-9]+" });
      expect(input.validationMessage).not.toBe("Server error");
      expect(input.checkValidity()).toBe(false);
      await render({});
      expect(input.checkValidity()).toBe(true);
    },
  );

  it("lets the value callback clear an application error without suppressing remaining rules", async () => {
    function Fixture() {
      const [value, setValue] = useState("AB");
      const [error, setError] = useState("Server error");
      return createElement(SecretInput, {
        value,
        customValidity: error,
        minLength: 4,
        onChange: (next) => {
          setValue(next);
          setError("");
        },
      });
    }
    await act(async () => root.render(createElement(Fixture)));
    const input = container.querySelector("input")!;
    await act(async () => insertText(input, "C"));
    expect(createSecretInput(input).value).toBe("ABC");
    expect(input.validationMessage).not.toBe("Server error");
    expect(input.checkValidity()).toBe(false);
    await act(async () => insertText(input, "D"));
    expect(createSecretInput(input).value).toBe("ABCD");
    expect(input.checkValidity()).toBe(true);
  });
});
