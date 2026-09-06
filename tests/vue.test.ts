import { createApp, createSSRApp, defineComponent, h, nextTick, ref } from "vue";
import { renderToString } from "vue/server-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { SecretInput } from "../src/vue.ts";
import { createSecretInput } from "../src/index.ts";
import type { ValidationMessages } from "../src/index.ts";
import { beforeInput, composition, formDataFor, insertText } from "./edit.ts";

describe("Vue SecretInput", () => {
  let container: HTMLDivElement;
  let unmount: (() => void) | undefined;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
  });

  afterEach(() => {
    unmount?.();
    document.body.replaceChildren();
  });

  it("preserves controller presentation and selection when unrelated attributes change", async () => {
    const value = ref("base");
    const className = ref("first");
    const app = createApp(
      defineComponent(
        () => () =>
          h(SecretInput, {
            modelValue: value.value,
            class: className.value,
            "onUpdate:modelValue": (next: string | undefined) => {
              value.value = next ?? "";
            },
          }),
      ),
    );
    app.mount(container);
    unmount = () => app.unmount();
    const input = container.querySelector("input")!;
    insertText(input, "x");
    await nextTick();
    input.setSelectionRange(1, 3, "backward");
    className.value = "changed";
    await nextTick();
    expect(input.className).toBe("changed");
    expect(value.value).toBe("basex");
    expect(input.value).toBe("•••••");
    expect([input.selectionStart, input.selectionEnd, input.selectionDirection]).toEqual([
      1,
      3,
      "backward",
    ]);
  });

  it("bridges v-model and forwards native input attributes", async () => {
    const change = vi.fn();
    const value = ref("first");
    const update = vi.fn((next: string | undefined) => {
      value.value = next ?? "";
    });
    const presentedValues: string[] = [];
    const app = createApp(
      defineComponent(
        () => () =>
          h("form", null, [
            h(SecretInput, {
              autocomplete: "current-password",
              autocapitalize: "words",
              autocorrect: "on",
              class: "field",
              "data-form-type": "password",
              modelValue: value.value,
              name: "token",
              spellcheck: "true",
              onChange: change,
              onInput: (event: Event) => {
                if (event.currentTarget instanceof HTMLInputElement) {
                  presentedValues.push(event.currentTarget.value);
                }
              },
              "onUpdate:modelValue": update,
              type: "password",
            }),
          ]),
      ),
    );
    app.mount(container);
    unmount = () => app.unmount();

    const input = container.querySelector("input");
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

    input!.focus();
    insertText(input!, "!");
    await nextTick();
    expect(update).toHaveBeenCalledWith("first!");
    expect(presentedValues).toEqual(["••••••"]);
    expect(value.value).toBe("first!");
    expect(input?.value).toBe("••••••");

    input!.blur();
    expect(change).toHaveBeenCalledExactlyOnceWith(expect.any(Event));

    input!.focus();
    beforeInput(input!, "historyUndo");
    await nextTick();
    expect(update).toHaveBeenLastCalledWith("first");
    expect(value.value).toBe("first");
    expect(input?.value).toBe("•••••");

    value.value = "next";
    await nextTick();
    expect(input?.value).toBe("••••");
  });

  it("supports an initial model value and reveal state", () => {
    const app = createApp(SecretInput, { modelValue: "visible", revealed: true });
    app.mount(container);
    unmount = () => app.unmount();

    expect(container.querySelector("input")?.value).toBe("visible");
  });

  it("server-renders the initial masked presentation and discards pre-hydration values", async () => {
    const value = "a👩‍💻e\u0301";
    const props = {
      modelValue: value,
      customValidity: "Server error",
      validationMessages: { tooShort: "Minimum length message", tooLong: "Maximum length message" },
    };
    const markup = await renderToString(createSSRApp(SecretInput, props));
    container.innerHTML = markup;
    const input = container.querySelector("input")!;

    expect(input.type).toBe("text");
    expect(input.autocomplete).toBe("off");
    expect(input.getAttribute("autocapitalize")).toBe("off");
    expect(input.hasAttribute("data-1p-ignore")).toBe(true);
    expect(input.getAttribute("value")).toBe("•••");
    expect(markup).not.toContain(value);
    expect(markup).not.toContain("Server error");
    expect(markup).not.toContain("Minimum length message");
    expect(markup).not.toContain("Maximum length message");

    input.value = "browser-filled";
    const app = createSSRApp(SecretInput, props);
    app.mount(container);
    unmount = () => app.unmount();

    expect(container.querySelector("input")).toBe(input);
    expect(input.value).toBe("•••");
    expect(input.validity.customError).toBe(true);
  });

  it("keeps plaintext out of server output before revealing on hydration", async () => {
    const value = "visible";
    const markup = await renderToString(
      createSSRApp(SecretInput, { revealed: true, modelValue: value }),
    );
    container.innerHTML = markup;

    expect(container.querySelector("input")?.value).toBe("•••••••");
    expect(markup).not.toContain(value);

    const app = createSSRApp(SecretInput, { revealed: true, modelValue: value });
    app.mount(container);
    unmount = () => app.unmount();

    expect(container.querySelector("input")?.value).toBe(value);
  });

  it.each([false, true])(
    "protects pending SSR input and restores readonly=%s",
    async (readonly) => {
      const locked = ref(readonly);
      const fixture = () => h(SecretInput, { readonly: locked.value, modelValue: "" });
      container.innerHTML = await renderToString(createSSRApp(fixture));
      const input = container.querySelector("input")!;
      expect(input.readOnly).toBe(true);
      expect(input.type).toBe("text");
      const app = createSSRApp(fixture);
      app.mount(container);
      unmount = () => app.unmount();
      await nextTick();
      expect(container.querySelector("input")).toBe(input);
      expect(input.readOnly).toBe(readonly);
      locked.value = !readonly;
      await nextTick();
      expect(input.readOnly).toBe(!readonly);
    },
  );

  it("does not surface browser-written DOM values", async () => {
    const onChange = vi.fn();
    const update = vi.fn();
    const onInput = vi.fn();
    const app = createApp(SecretInput, {
      modelValue: "kept",
      onChange,
      onInput,
      "onUpdate:modelValue": update,
    });
    app.mount(container);
    unmount = () => app.unmount();

    const input = container.querySelector("input")!;
    input.value = "browser-filled";
    input.dispatchEvent(new InputEvent("input", { bubbles: true }));
    input.value = "browser-filled";
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await nextTick();

    expect(update).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
    expect(onInput).not.toHaveBeenCalled();
    expect(input.value).toBe("••••");
  });
  it("preserves a composition while synchronizing an unchanged model value", async () => {
    const className = ref("first");
    const update = vi.fn();
    const app = createApp(
      defineComponent(
        () => () =>
          h(SecretInput, {
            modelValue: "ab",
            class: className.value,
            "onUpdate:modelValue": update,
          }),
      ),
    );
    app.mount(container);
    unmount = () => app.unmount();
    const input = container.querySelector("input")!;
    input.setSelectionRange(1, 2);
    composition(input, "compositionstart");
    beforeInput(input, "insertCompositionText", "ni");
    className.value = "changed";
    await nextTick();
    expect(input.value).toBe("••");
    composition(input, "compositionend", "你");
    await nextTick();
    expect(update).toHaveBeenCalledExactlyOnceWith("a你");
    expect(input.value).toBe("••");
  });
  it("keeps redo through model synchronization and discards it on a new branch", async () => {
    const value = ref("base");
    const app = createApp(
      defineComponent(
        () => () =>
          h(SecretInput, {
            modelValue: value.value,
            "onUpdate:modelValue": (next: string | undefined) => (value.value = next ?? ""),
          }),
      ),
    );
    app.mount(container);
    unmount = () => app.unmount();
    const input = container.querySelector("input")!;
    insertText(input, "x");
    await nextTick();
    beforeInput(input, "historyUndo");
    await nextTick();
    expect(value.value).toBe("base");
    beforeInput(input, "historyRedo");
    await nextTick();
    expect(value.value).toBe("basex");
    beforeInput(input, "historyUndo");
    await nextTick();
    insertText(input, "y");
    await nextTick();
    beforeInput(input, "historyRedo");
    await nextTick();
    expect(value.value).toBe("basey");
    beforeInput(input, "historyUndo");
    await nextTick();
    expect(value.value).toBe("base");
  });
  it("keeps the model authoritative across native reset and parent reset", async () => {
    const value = ref("base");
    const update = vi.fn((next: string | undefined) => {
      value.value = next ?? "";
    });
    const app = createApp(() =>
      h("form", null, [
        h(SecretInput, {
          modelValue: value.value,
          "onUpdate:modelValue": update,
          name: "token",
        }),
      ]),
    );
    app.mount(container);
    unmount = () => app.unmount();
    const input = container.querySelector("input")!;
    insertText(input, "x");
    await nextTick();
    input.form!.reset();
    await nextTick();
    expect(value.value).toBe("basex");
    expect(input.value).toBe("•••••");
    expect(formDataFor(input.form!).get("token")).toBe("basex");
    expect(update).toHaveBeenCalledTimes(1);
    value.value = "base";
    await nextTick();
    expect(input.value).toBe("••••");
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("uses defineModel local state when no model binding is supplied", async () => {
    const app = createApp(() => h("form", null, [h(SecretInput)]));
    app.mount(container);
    unmount = () => app.unmount();
    const input = container.querySelector("input")!;
    insertText(input, "local");
    await nextTick();
    expect(input.value).toBe("•••••");
    input.form!.reset();
    await nextTick();
    expect(input.value).toBe("•••••");
  });

  it("restores a rejected model update and exposes the native input", async () => {
    const field = ref<{ input?: HTMLInputElement }>();
    const update = vi.fn();
    const app = createApp(() =>
      h(SecretInput, {
        ref: field,
        modelValue: "kept",
        "onUpdate:modelValue": update,
      }),
    );
    app.mount(container);
    unmount = () => app.unmount();
    const input = container.querySelector("input")!;
    expect(field.value?.input).toBe(input);
    insertText(input, "x");
    await nextTick();
    expect(update).toHaveBeenCalledExactlyOnceWith("keptx");
    expect(createSecretInput(field.value!.input!).value).toBe("kept");
    expect(input.value).toBe("••••");
  });

  it.each([true, false])(
    "retains custom validity through renders, reset, and model acceptance=%s",
    async (accept) => {
      const value = ref("AB");
      const props = ref<{ customValidity?: string; pattern?: string; class?: string }>({
        customValidity: "Server error",
        pattern: "[A-Z]+",
      });
      const app = createApp(() =>
        h("form", null, [
          h(SecretInput, {
            ...props.value,
            modelValue: value.value,
            "onUpdate:modelValue": (next: string | undefined) => {
              if (accept) value.value = next ?? "";
            },
          }),
        ]),
      );
      app.mount(container);
      unmount = () => app.unmount();
      const input = container.querySelector("input")!;
      expect(input.validationMessage).toBe("Server error");
      expect(input.hasAttribute("customvalidity")).toBe(false);
      insertText(input, "C");
      await nextTick();
      expect(createSecretInput(input).value).toBe(accept ? "ABC" : "AB");
      expect(input.validationMessage).toBe("Server error");
      input.setSelectionRange(0, 1, "backward");
      props.value = { ...props.value, class: "changed" };
      await nextTick();
      expect(container.querySelector("input")).toBe(input);
      expect(input.validationMessage).toBe("Server error");
      expect([input.selectionStart, input.selectionEnd, input.selectionDirection]).toEqual([
        0,
        1,
        "backward",
      ]);
      input.form!.reset();
      await nextTick();
      expect(input.validationMessage).toBe("Server error");
      props.value = { pattern: "[0-9]+" };
      await nextTick();
      expect(input.validationMessage).not.toBe("Server error");
      expect(input.checkValidity()).toBe(false);
      props.value = {};
      await nextTick();
      expect(input.checkValidity()).toBe(true);
    },
  );

  it("synchronizes reactive message-map entries and formatter changes", async () => {
    const messages = ref<ValidationMessages>({ tooShort: "First" });
    const app = createApp(() =>
      h(SecretInput, {
        modelValue: "👩‍💻",
        minlength: 6,
        validationMessages: messages.value,
      }),
    );
    app.mount(container);
    unmount = () => app.unmount();
    const input = container.querySelector("input")!;
    expect(input.validationMessage).toBe("First");
    expect(input.hasAttribute("validationmessages")).toBe(false);
    input.setSelectionRange(0, 1, "backward");
    messages.value.tooShort = ({ valueLength, minLength }) => `${valueLength}/${minLength}`;
    await nextTick();
    expect(input.validationMessage).toBe("5/6");
    expect(container.querySelector("input")).toBe(input);
    expect(input.selectionDirection).toBe("backward");
    delete messages.value.tooShort;
    await nextTick();
    expect(input.validationMessage).toBe("The value is too short.");
  });

  it("lets the model callback clear an application error without suppressing remaining rules", async () => {
    const value = ref("AB");
    const error = ref("Server error");
    const app = createApp(() =>
      h(SecretInput, {
        modelValue: value.value,
        customValidity: error.value,
        minlength: 4,
        "onUpdate:modelValue": (next: string | undefined) => {
          value.value = next ?? "";
          error.value = "";
        },
      }),
    );
    app.mount(container);
    unmount = () => app.unmount();
    const input = container.querySelector("input")!;
    insertText(input, "C");
    await nextTick();
    expect(createSecretInput(input).value).toBe("ABC");
    expect(input.validationMessage).not.toBe("Server error");
    expect(input.checkValidity()).toBe(false);
    insertText(input, "D");
    await nextTick();
    expect(createSecretInput(input).value).toBe("ABCD");
    expect(input.checkValidity()).toBe(true);
  });
});
