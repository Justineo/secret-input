import { describe, expect, it } from "vite-plus/test";

import { findPasswordManager } from "../src/password-manager.ts";

describe("findPasswordManager", () => {
  const markers = [
    ["com-1password-button", "", "1Password"],
    ["form", "data-bitwarden-watching", "Bitwarden"],
    ["div", "data-lastpass-icon-root", "LastPass"],
    ["input", "data-dashlane-rid", "Dashlane"],
    ["input", "data-keeper-lock-id", "Keeper"],
    ["div", "data-protonpass-role", "Proton Pass"],
  ] as const;

  for (const [tag, attribute, manager] of markers) {
    it(`recognizes ${manager}'s DOM marker`, () => {
      const root = document.createElement("div");
      const marker = document.createElement(tag);
      if (attribute) {
        marker.setAttribute(attribute, "");
      }
      root.append(marker);

      expect(findPasswordManager(root)).toBe(manager);
    });
  }

  it("does not infer an extension from page copy", () => {
    const root = document.createElement("div");
    root.textContent = "Disable 1Password, Bitwarden, or another password manager.";

    expect(findPasswordManager(root)).toBeUndefined();
  });
});
