import { createElement, useState } from "react";
import type { FormEvent } from "react";
import { flushSync } from "react-dom";
import { createRoot, hydrateRoot } from "react-dom/client";
import { renderToString as renderReactToString } from "react-dom/server";
import { createApp, createSSRApp, h, nextTick, ref } from "vue";
import { renderToString as renderVueToString } from "vue/server-renderer";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser/context";

import type { ValidationMessages } from "../../src/index.ts";
import { SecretInput as ReactSecretInput } from "../../src/react.ts";
import { SecretInput as VueSecretInput } from "../../src/vue.ts";

let container: HTMLDivElement;
let unmount: () => void;

function field(): HTMLInputElement {
  return container.querySelector<HTMLInputElement>("input")!;
}

describe("framework input browser contract", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
  });
  afterEach(() => {
    unmount();
    container.remove();
  });

  it.each(["React", "Vue"])(
    "%s blocks editing until hydration attaches the controller",
    async (framework) => {
      const changes: string[] = [];
      let hydrate: () => void;
      unmount = () => {};
      if (framework === "React") {
        const element = createElement(ReactSecretInput, {
          defaultValue: "",
          onChange: (value) => changes.push(value),
        });
        container.innerHTML = renderReactToString(element);
        hydrate = () => {
          const root = hydrateRoot(container, element);
          unmount = () => root.unmount();
        };
      } else {
        const props = {
          "onUpdate:modelValue": (value: string | undefined) => changes.push(value ?? ""),
        };
        container.innerHTML = await renderVueToString(createSSRApp(VueSecretInput, props));
        hydrate = () => {
          const app = createSSRApp(VueSecretInput, props);
          app.mount(container);
          unmount = () => app.unmount();
        };
      }
      const input = field();
      expect(input.readOnly).toBe(true);
      expect(input.type).toBe("text");
      await page.elementLocator(input).click();
      await userEvent.keyboard("before");
      expect(input.value).toBe("");
      expect(changes).toEqual([]);
      hydrate();
      await expect.poll(() => input.readOnly).toBe(false);
      expect(field()).toBe(input);
      expect(document.activeElement).toBe(input);
      await userEvent.keyboard("after");
      expect(input.value).toBe("•••••");
      expect(changes.at(-1)).toBe("after");
    },
  );

  it.each(["React", "Vue"])(
    "%s updates, removes, and revalidates rule props without replacing the field or its history",
    async (framework) => {
      type Rules = {
        pattern?: string;
        minlength?: number;
        maxlength?: number;
        required?: boolean;
        customValidity?: string;
        validationMessages?: ValidationMessages;
        class?: string;
      };
      const initial: Rules = { pattern: "[A-F0-9]+", minlength: 4, maxlength: 8, required: true };
      const form = document.createElement("form");
      const host = document.createElement("div");
      form.append(host);
      container.append(form);
      const changes: string[] = [];
      const submitted: FormDataEntryValue[] = [];
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        submitted.push(new FormData(form).get("secret")!);
      });
      let update: (rules: Rules) => Promise<void>;
      if (framework === "React") {
        const root = createRoot(host);
        unmount = () => root.unmount();
        update = async (rules) => {
          flushSync(() =>
            root.render(
              createElement(ReactSecretInput, {
                defaultValue: "ABCD",
                name: "secret",
                onChange: (value) => changes.push(value),
                pattern: rules.pattern,
                minLength: rules.minlength,
                maxLength: rules.maxlength,
                required: rules.required,
                customValidity: rules.customValidity,
                validationMessages: rules.validationMessages,
                className: rules.class,
              }),
            ),
          );
        };
        await update(initial);
      } else {
        const rules = ref(initial);
        const value = ref("ABCD");
        const app = createApp(() =>
          h(VueSecretInput, {
            ...rules.value,
            modelValue: value.value,
            name: "secret",
            "onUpdate:modelValue": (next: string | undefined) => {
              value.value = next ?? "";
              changes.push(value.value);
            },
          }),
        );
        app.mount(host);
        unmount = () => app.unmount();
        update = async (next) => {
          rules.value = next;
          await nextTick();
        };
      }

      const input = field();
      expect(input.checkValidity()).toBe(true);
      input.focus();
      input.setSelectionRange(4, 4);
      await userEvent.keyboard("E");
      expect(new FormData(input.form!).get("secret")).toBe("ABCDE");
      expect(changes).toEqual(["ABCDE"]);
      input.setSelectionRange(1, 3, "backward");
      await update({ pattern: "[0-9]+", minlength: 6, maxlength: 8, required: true });
      expect(field()).toBe(input);
      expect(new FormData(input.form!).get("secret")).toBe("ABCDE");
      expect(input.value).toBe("•••••");
      expect(document.activeElement).toBe(input);
      expect([input.selectionStart, input.selectionEnd, input.selectionDirection]).toEqual([
        1,
        3,
        "backward",
      ]);
      expect(input.matches(":invalid")).toBe(true);
      expect(form.checkValidity()).toBe(false);
      form.requestSubmit();
      expect(submitted).toEqual([]);
      await update({ minlength: 6, maxlength: 8, required: true });
      expect(input.hasAttribute("data-secret-pattern")).toBe(false);
      expect(input.checkValidity()).toBe(false);
      expect(input.validationMessage).toBe("The value is too short.");
      await update({ minlength: 6, validationMessages: { tooShort: "内容长度不足" } });
      expect(input.validationMessage).toBe("内容长度不足");
      expect(input.hasAttribute("validationmessages")).toBe(false);
      await update({
        minlength: 6,
        validationMessages: {
          tooShort: ({ valueLength, minLength }) => `Length ${valueLength}/${minLength}`,
        },
      });
      expect(input.validationMessage).toBe("Length 5/6");
      await update({ minlength: 6 });
      expect(input.validationMessage).toBe("The value is too short.");
      await update({ maxlength: 8, required: true });
      expect(input.hasAttribute("data-secret-minlength")).toBe(false);
      expect(input.checkValidity()).toBe(true);
      form.requestSubmit();
      expect(submitted).toEqual(["ABCDE"]);
      await update({ maxlength: 3, required: true });
      expect(new FormData(input.form!).get("secret")).toBe("ABCDE");
      expect(input.checkValidity()).toBe(false);
      expect(input.validationMessage).toBe("The value is too long.");
      await update({ maxlength: 3, validationMessages: { tooLong: "内容超过允许长度" } });
      expect(input.validationMessage).toBe("内容超过允许长度");
      expect(input.hasAttribute("validationmessages")).toBe(false);
      await update({ maxlength: 3 });
      expect(input.validationMessage).toBe("The value is too long.");
      await update({});
      expect(input.maxLength).toBe(-1);
      expect(input.required).toBe(false);
      expect(input.checkValidity()).toBe(true);
      expect(changes).toEqual(["ABCDE"]);
      input.focus();
      await userEvent.keyboard("{Ctrl>}z{/Ctrl}");
      expect(new FormData(input.form!).get("secret")).toBe("ABCD");
      await update({ ...initial, customValidity: "Server error" });
      expect(input.validationMessage).toBe("Server error");
      expect(input.checkValidity()).toBe(false);
      await update({ ...initial, customValidity: "Server error", class: "changed" });
      expect(input.className).toBe("changed");
      expect(input.validationMessage).toBe("Server error");
      expect(input.hasAttribute("customvalidity")).toBe(false);
      form.requestSubmit();
      expect(submitted).toEqual(["ABCDE"]);
      expect(document.activeElement).toBe(input);
      expect(input.reportValidity()).toBe(false);
      expect(input.matches(":invalid")).toBe(true);
      form.reset();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(input.validationMessage).toBe("Server error");
      await update({ ...initial, pattern: "[0-9]+" });
      expect(input.validationMessage).not.toBe("Server error");
      expect(input.checkValidity()).toBe(false);
      await update(initial);
      expect(input.validationMessage).toBe("");
      expect(input.checkValidity()).toBe(true);
    },
    30_000,
  );

  it("keeps React controlled state through real typing, Enter, resets and unrelated renders", async () => {
    const changes: string[] = [];
    const submissions: FormDataEntryValue[] = [];
    let resetParent = false;
    function Fixture() {
      const [value, setValue] = useState("base");
      const [className, setClassName] = useState("first");
      return createElement(
        "form",
        {
          onReset: () => {
            if (resetParent) setValue("base");
          },
          onSubmit: (event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            submissions.push(new FormData(event.currentTarget).get("secret")!);
          },
        },
        createElement(ReactSecretInput, {
          value,
          className,
          name: "secret",
          "aria-label": "Secret",
          onChange: (value) => {
            changes.push(value);
            setValue(value);
          },
        }),
        createElement("output", null, value),
        createElement("button", { type: "submit" }, "Submit"),
        createElement("button", { type: "reset" }, "Native reset"),
        createElement("button", { type: "button", onClick: () => setValue("base") }, "Reset model"),
        createElement(
          "button",
          { type: "button", onClick: () => setClassName("changed") },
          "Change class",
        ),
      );
    }
    const root = createRoot(container);
    unmount = () => root.unmount();
    flushSync(() => root.render(createElement(Fixture)));
    const input = field();
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    await userEvent.keyboard("x");
    expect(new FormData(input.form!).get("secret")).toBe("basex");
    expect(container.querySelector("output")!.textContent).toBe("basex");
    expect(changes).toEqual(["basex"]);
    await userEvent.keyboard("{Enter}");
    expect(document.activeElement).toBe(input);
    expect(submissions).toEqual(["basex"]);
    expect(changes).toEqual(["basex"]);
    input.setSelectionRange(1, 3, "backward");
    await page.getByRole("button", { name: "Change class" }).click();
    expect(input.className).toBe("changed");
    expect(input.value).toBe("•••••");
    expect([input.selectionStart, input.selectionEnd]).toEqual([1, 3]);
    await page.getByRole("button", { name: "Native reset" }).click();
    await expect.poll(() => input.value).toBe("•••••");
    expect(new FormData(input.form!).get("secret")).toBe("basex");
    expect(new FormData(input.form!).get("secret")).toBe("basex");
    expect(changes).toEqual(["basex"]);
    resetParent = true;
    await page.getByRole("button", { name: "Native reset" }).click();
    await expect.poll(() => new FormData(input.form!).get("secret")).toBe("base");
    expect(input.value).toBe("••••");
    expect(changes).toEqual(["basex"]);
  }, 30_000);

  it("lets native reset restore React uncontrolled defaults and respects cancellation", async () => {
    const changes: string[] = [];
    let cancelReset = false;
    function Fixture() {
      return createElement(
        "form",
        {
          onReset: (event) => {
            if (cancelReset) event.preventDefault();
          },
        },
        createElement(ReactSecretInput, {
          defaultValue: "base",
          name: "secret",
          onChange: (value) => changes.push(value),
        }),
        createElement("button", { type: "reset" }, "Reset"),
      );
    }
    const root = createRoot(container);
    unmount = () => root.unmount();
    flushSync(() => root.render(createElement(Fixture)));
    const input = field();
    input.focus();
    input.setSelectionRange(4, 4);
    await userEvent.keyboard("x");
    cancelReset = true;
    await page.getByRole("button", { name: "Reset", exact: true }).click();
    expect(new FormData(input.form!).get("secret")).toBe("basex");
    expect(input.value).toBe("•••••");
    cancelReset = false;
    await page.getByRole("button", { name: "Reset", exact: true }).click();
    await expect.poll(() => new FormData(input.form!).get("secret")).toBe("base");
    expect(input.value).toBe("••••");
    expect(new FormData(input.form!).get("secret")).toBe("base");
    expect(changes).toEqual(["basex"]);
  });

  it("keeps Vue defineModel synchronized through typing, reset and attribute updates", async () => {
    const value = ref("base");
    const className = ref("first");
    const changes: string[] = [];
    const app = createApp(() =>
      h("form", null, [
        h(VueSecretInput, {
          modelValue: value.value,
          name: "secret",
          class: className.value,
          "onUpdate:modelValue": (next: string | undefined) => {
            changes.push(next ?? "");
            value.value = next ?? "";
          },
        }),
        h("button", { type: "reset" }, "Native reset"),
        h(
          "button",
          {
            type: "button",
            onClick: () => {
              value.value = "base";
            },
          },
          "Reset model",
        ),
        h(
          "button",
          {
            type: "button",
            onClick: () => {
              className.value = "changed";
            },
          },
          "Change class",
        ),
      ]),
    );
    app.mount(container);
    unmount = () => app.unmount();
    const input = field();
    input.focus();
    input.setSelectionRange(4, 4);
    await userEvent.keyboard("x");
    expect(value.value).toBe("basex");
    expect(input.value).toBe("•••••");
    input.setSelectionRange(1, 3, "backward");
    await page.getByRole("button", { name: "Change class" }).click();
    expect(input.className).toBe("changed");
    expect(input.value).toBe("•••••");
    expect([input.selectionStart, input.selectionEnd]).toEqual([1, 3]);
    await page.getByRole("button", { name: "Native reset" }).click();
    await expect.poll(() => input.value).toBe("•••••");
    expect(value.value).toBe("basex");
    expect(new FormData(input.form!).get("secret")).toBe("basex");
    expect(changes).toEqual(["basex"]);
    await page.getByRole("button", { name: "Reset model" }).click();
    expect(input.value).toBe("••••");
    expect(new FormData(input.form!).get("secret")).toBe("base");
  });
});
