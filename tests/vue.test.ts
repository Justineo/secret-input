import { createApp, defineComponent, h, nextTick, ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { SecretInput } from "../src/vue.ts";
import { beforeInput, formDataFor, insertText } from "./edit.ts";

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

  it("bridges v-model and forwards native input attributes", async () => {
    const change = vi.fn();
    const value = ref("first");
    const update = vi.fn((next: string) => {
      value.value = next;
    });
    const presentedValues: string[] = [];
    const app = createApp(
      defineComponent(
        () => () =>
          h("form", null, [
            h(SecretInput, {
              autocomplete: "current-password",
              class: "field",
              "data-form-type": "password",
              modelValue: value.value,
              name: "token",
              onChange: change,
              onInput: (event: Event) => {
                if (event.currentTarget instanceof HTMLInputElement) {
                  presentedValues.push(event.currentTarget.value);
                }
              },
              "onUpdate:modelValue": update,
              type: "password",
              value: "must-not-reach-dom",
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
    expect(change).toHaveBeenCalledOnce();

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

  it("supports an uncontrolled default value and reveal state", () => {
    const app = createApp(SecretInput, { defaultValue: "visible", redacted: false });
    app.mount(container);
    unmount = () => app.unmount();

    expect(container.querySelector("input")?.value).toBe("visible");
  });

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
});
