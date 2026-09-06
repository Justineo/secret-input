import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const html = readFileSync("index.html", "utf8");
const storageKey = "secret-input:credential-ready";

function element<T extends Element>(selector: string): T {
  const result = document.querySelector<T>(selector);
  if (!result) throw new Error(`Missing ${selector}`);
  return result;
}

beforeEach(() => {
  vi.resetModules();
  vi.doUnmock("../src/comparison.ts");
  vi.useFakeTimers();
  history.replaceState(null, "", "/");
  const entries = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => {
      entries.set(key, value);
    },
    removeItem: (key: string) => {
      entries.delete(key);
    },
    get length() {
      return entries.size;
    },
  });
  const fixture = document.createElement("template");
  fixture.innerHTML = html;
  for (const resource of fixture.content.querySelectorAll("script, link")) resource.remove();
  document.body.replaceChildren(fixture.content.cloneNode(true));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe("demo initialization", () => {
  it("delivers the product explanation and usage example before JavaScript runs", () => {
    expect(element("h1").textContent).toContain("autofill");
    expect(element(".integration pre").textContent).toContain("createSecretInput(element");
    expect(document.querySelector("#setup-username")).toBeNull();
    expect(document.querySelector("#masked-signing-secret")).toBeNull();
  });

  it("renders setup when reading site storage is blocked", async () => {
    vi.spyOn(localStorage, "getItem").mockImplementation(() => {
      throw new DOMException("Blocked", "SecurityError");
    });
    await import("../src/demo.ts");
    expect(element("#page-title").textContent).toContain("autofill");
    expect(element("#setup-title").textContent).toContain("Save a test login");
    expect(document.querySelector("#masked-signing-secret")).toBeNull();
    expect(document.querySelector(".loading-message")).toBeNull();
    await vi.advanceTimersByTimeAsync(500);
    expect(element<HTMLButtonElement>("#continue-setup").disabled).toBe(false);
  });

  it("keeps setup values and explains a blocked storage write without submitting credentials", async () => {
    vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new DOMException("Blocked", "SecurityError");
    });
    await import("../src/demo.ts");
    await vi.advanceTimersByTimeAsync(500);
    element<HTMLInputElement>("#setup-username").value = "disposable";
    element<HTMLInputElement>("#setup-password").value = "test-only";
    const submit = new Event("submit", { bubbles: true, cancelable: true });
    element("#credential-form").dispatchEvent(submit);
    await vi.dynamicImportSettled();
    expect(submit.defaultPrevented).toBe(true);
    expect(element<HTMLElement>("#password-manager-warning").hidden).toBe(false);
    expect(element("#password-manager-warning").textContent).toContain("Allow site storage");
    expect(element<HTMLInputElement>("#setup-password").value).toBe("test-only");
    expect(localStorage.length).toBe(0);
  });

  it("warms comparison on focus and switches setup and reset within the same page", async () => {
    const hero = element(".hero");
    const reload = vi.spyOn(location, "reload");
    await import("../src/demo.ts");
    await vi.advanceTimersByTimeAsync(500);
    element<HTMLInputElement>("#setup-username").focus();
    await vi.dynamicImportSettled();
    expect(document.querySelector("#masked-signing-secret")).toBeNull();

    for (let round = 0; round < 2; round += 1) {
      const form = element<HTMLFormElement>("#credential-form");
      element<HTMLInputElement>("#setup-username").value = "disposable";
      element<HTMLInputElement>("#setup-password").value = "test-only";
      const submit = new Event("submit", { bubbles: true, cancelable: true });
      form.dispatchEvent(submit);
      expect(submit.defaultPrevented).toBe(true);
      expect(element<HTMLButtonElement>("#continue-setup").disabled).toBe(true);
      await vi.dynamicImportSettled();
      expect(form.isConnected).toBe(false);
      expect(element(".hero")).toBe(hero);
      expect(document.activeElement).toBe(element("#comparison-title"));
      expect(localStorage.getItem(storageKey)).toBe("true");
      expect(location.hash).toBe("#compare");
      expect(element("#demo-root").getAttribute("aria-busy")).toBe("false");
      element<HTMLButtonElement>("#reset-demo").click();
      expect(element(".hero")).toBe(hero);
      expect(document.activeElement).toBe(element("#setup-title"));
      expect(localStorage.getItem(storageKey)).toBeNull();
      expect(location.hash).toBe("#try-it");
      await vi.advanceTimersByTimeAsync(500);
    }
    expect(reload).not.toHaveBeenCalled();
  });

  it("keeps setup intact when comparison loading fails", async () => {
    vi.doMock("../src/comparison.ts", () => {
      throw new Error("Offline");
    });
    await import("../src/demo.ts");
    await vi.advanceTimersByTimeAsync(500);
    element<HTMLInputElement>("#setup-username").value = "disposable";
    element<HTMLInputElement>("#setup-password").value = "test-only";
    element("#credential-form").dispatchEvent(new Event("submit", { cancelable: true }));
    await vi.dynamicImportSettled();
    expect(element<HTMLInputElement>("#setup-password").value).toBe("test-only");
    expect(element("#password-manager-warning").textContent).toContain("could not load");
    expect(localStorage.getItem(storageKey)).toBeNull();
    expect(element<HTMLButtonElement>("#continue-setup").disabled).toBe(false);
    expect(element("#demo-root").getAttribute("aria-busy")).toBe("false");
  });

  it("rechecks the extension guard after waiting for the comparison", async () => {
    let resolve!: () => void;
    const gate = new Promise<void>((done) => {
      resolve = done;
    });
    vi.doMock("../src/comparison.ts", async () => {
      await gate;
      return vi.importActual("../src/comparison.ts");
    });
    await import("../src/demo.ts");
    await vi.advanceTimersByTimeAsync(500);
    element<HTMLInputElement>("#setup-password").value = "test-only";
    element("#credential-form").dispatchEvent(new Event("submit", { cancelable: true }));
    expect(element("#demo-root").getAttribute("aria-busy")).toBe("true");
    expect(element<HTMLInputElement>("#setup-password").value).toBe("test-only");
    expect(localStorage.getItem(storageKey)).toBeNull();
    document.body.append(document.createElement("com-1password-button"));
    resolve();
    await vi.dynamicImportSettled();
    expect(element<HTMLButtonElement>("#continue-setup").disabled).toBe(true);
    expect(element("#password-manager-warning").textContent).toContain("1Password");
    expect(document.querySelector("#masked-signing-secret")).toBeNull();
    expect(localStorage.getItem(storageKey)).toBeNull();
  });

  it("exposes comparison details to focus and click and can reset with blocked storage", async () => {
    localStorage.setItem(storageKey, "true");
    await import("../src/demo.ts");
    // Module evaluation can settle before the startup render finishes.
    await vi.waitFor(() => {
      expect(element("#demo-root").getAttribute("aria-busy")).toBe("false");
    });
    expect(document.querySelector("#setup-username")).toBeNull();
    expect(document.querySelectorAll("#support-matrix tr")).toHaveLength(6);
    const button = element<HTMLButtonElement>(".browser-detail");
    button.focus();
    expect(element("#support-detail").textContent).toBe("Both fields are filled automatically.");
    expect(button.getAttribute("aria-current")).toBe("true");
    const last = document.querySelector<HTMLButtonElement>(
      ".browser-support .browser-detail:last-child",
    )!;
    last.click();
    expect(
      [...document.querySelectorAll(".support-detail-notes li")].map((item) => item.textContent),
    ).toEqual(["No automatic fill observed.", "Password suggestions appear on interaction."]);
    expect(button.hasAttribute("aria-current")).toBe(false);
    expect(last.getAttribute("aria-current")).toBe("true");
    expect(document.querySelectorAll(".browser-detail[aria-current]")).toHaveLength(1);
    vi.spyOn(localStorage, "removeItem").mockImplementation(() => {
      throw new DOMException("Blocked", "SecurityError");
    });
    element<HTMLButtonElement>("#reset-demo").click();
    expect(document.querySelector("#setup-username")).not.toBeNull();
    expect(document.querySelector("#masked-signing-secret")).toBeNull();
  });

  it("blocks setup when an extension injects a known marker", async () => {
    await import("../src/demo.ts");
    document.body.append(document.createElement("com-1password-button"));
    await vi.advanceTimersByTimeAsync(500);
    expect(element<HTMLButtonElement>("#continue-setup").disabled).toBe(true);
    expect(element("#password-manager-warning").textContent).toContain("1Password");
    const submit = new Event("submit", { bubbles: true, cancelable: true });
    element("#credential-form").dispatchEvent(submit);
    expect(submit.defaultPrevented).toBe(true);
    expect(localStorage.getItem(storageKey)).toBeNull();
  });

  it("keeps the saved stage recoverable if its deferred module cannot load", async () => {
    localStorage.setItem(storageKey, "true");
    vi.doMock("../src/comparison.ts", () => {
      throw new Error("Offline");
    });
    await import("../src/demo.ts");
    await vi.waitFor(() => {
      expect(element("#demo-root").getAttribute("aria-busy")).toBe("false");
    });
    expect(element("#demo-root [role=status]").textContent).toContain("could not load");
    expect(element("#demo-root button").textContent).toBe("Reload comparison");
    expect(document.querySelector("#masked-signing-secret")).toBeNull();
    expect(localStorage.getItem(storageKey)).toBe("true");
  });
});
