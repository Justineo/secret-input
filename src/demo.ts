import { findPasswordManager } from "./password-manager.ts";

type ComparisonModule = typeof import("./comparison.ts");

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new TypeError(`Missing demo element: ${selector}`);
  }
  return element;
}

const storageKey = "secret-input:credential-ready";
const root = requiredElement<HTMLElement>("#demo-root");
const setupTemplate = requiredElement<HTMLTemplateElement>("#setup-template");
let comparison: Promise<ComparisonModule> | undefined;

function loadComparison(): Promise<ComparisonModule> {
  return (comparison ??= import("./comparison.ts"));
}

let credentialReady = false;
try {
  credentialReady = localStorage.getItem(storageKey) === "true";
} catch {
  // The setup remains available when the browser blocks site storage.
}

if (credentialReady) {
  void showComparison();
} else {
  initializeSetup();
}

function renderComparison(module: ComparisonModule): void {
  module.initializeComparison(root, () => {
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // Returning to setup must also work if storage becomes unavailable.
    }
    initializeSetup();
    if (location.hash === "#compare") {
      history.replaceState(history.state, "", "#try-it");
    }
    requiredElement<HTMLElement>("#setup-title").focus({ preventScroll: true });
  });
}

async function showComparison(): Promise<void> {
  root.setAttribute("aria-busy", "true");
  try {
    renderComparison(await loadComparison());
  } catch {
    const message = document.createElement("p");
    message.className = "caption";
    message.setAttribute("role", "status");
    message.textContent = "The comparison could not load. Check your connection and try again.";
    const retry = document.createElement("button");
    retry.className = "form-button";
    retry.type = "button";
    retry.textContent = "Reload comparison";
    retry.addEventListener("click", () => {
      location.reload();
    });
    root.replaceChildren(message, retry);
  } finally {
    root.setAttribute("aria-busy", "false");
  }
}

function initializeSetup(): void {
  root.replaceChildren(setupTemplate.content.cloneNode(true));
  root.setAttribute("aria-busy", "false");
  const form = requiredElement<HTMLFormElement>("#credential-form");
  const submit = requiredElement<HTMLButtonElement>("#continue-setup");
  const warning = requiredElement<HTMLElement>("#password-manager-warning");
  let manager: string | undefined;

  const observer = new MutationObserver(blockPasswordManager);

  function blockPasswordManager(): boolean {
    manager ??= findPasswordManager(document);
    if (!manager) {
      return false;
    }

    observer.disconnect();
    submit.disabled = true;
    warning.hidden = false;
    warning.textContent = `${manager} appears to be active. Disable it for this site and reload before continuing.`;
    return true;
  }

  observer.observe(document.documentElement, {
    attributes: true,
    childList: true,
    subtree: true,
  });

  if (!blockPasswordManager()) {
    window.setTimeout(() => {
      submit.disabled = blockPasswordManager();
    }, 500);
  }

  // Fetch the comparison on intent without inserting its fields before setup is submitted.
  form.addEventListener("focusin", () => void loadComparison().catch(() => {}), { once: true });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (blockPasswordManager() || submit.disabled) {
      return;
    }

    submit.disabled = true;
    root.setAttribute("aria-busy", "true");
    try {
      let module: ComparisonModule;
      try {
        module = await loadComparison();
      } catch {
        warning.hidden = false;
        warning.textContent =
          "The comparison could not load. Check your connection and reload to try again.";
        return;
      }
      if (blockPasswordManager()) return;

      try {
        localStorage.setItem(storageKey, "true");
      } catch {
        warning.hidden = false;
        warning.textContent =
          "Allow site storage in your browser and try again. Your test credentials have not been stored by this page.";
        return;
      }
      observer.disconnect();
      renderComparison(module);
      // Form removal plus same-document navigation signals a completed login to password managers.
      history.replaceState(history.state, "", "#compare");
      requiredElement<HTMLElement>("#comparison-title").focus({ preventScroll: true });
    } finally {
      root.setAttribute("aria-busy", "false");
      if (form.isConnected) submit.disabled = !!manager;
    }
  });
}
