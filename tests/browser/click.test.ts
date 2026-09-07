import { expect, it } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser/context";
import { clickOptions } from "./click.ts";

it("delivers trusted pointer activation and native reset without a controller", async () => {
  const form = document.createElement("form");
  form.innerHTML = '<input value="initial"><button type="reset">Reset</button>';
  document.body.append(form);
  try {
    const input = form.querySelector("input")!;
    const button = form.querySelector("button")!;
    const events: string[] = [];
    for (const type of ["mousedown", "mouseup", "click", "reset"]) {
      form.addEventListener(type, (event) => {
        events.push(`${event.type}:${event.isTrusted}`);
      });
    }
    input.value = "changed";
    input.focus();
    input.setSelectionRange(1, 3);
    await userEvent.click(button, clickOptions);
    expect(events).toEqual(["mousedown:true", "mouseup:true", "click:true", "reset:true"]);
    expect(input.value).toBe("initial");
  } finally {
    form.remove();
  }
});
