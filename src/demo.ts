import { findPasswordManager } from "./password-manager.ts";

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

function setStage(stage: "setup" | "compare"): void {
  requiredElement<HTMLElement>("#try-it").dataset.stage = stage;
  for (const name of ["setup", "compare"]) {
    const step = requiredElement<HTMLElement>(`#${name}-step`);
    if (name === stage) step.setAttribute("aria-current", "step");
    else step.removeAttribute("aria-current");
  }
  root.setAttribute("aria-busy", "false");
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

async function showComparison(): Promise<void> {
  setStage("compare");
  root.setAttribute("aria-busy", "true");
  try {
    const { initializeComparison } = await import("./comparison.ts");
    initializeComparison(root, () => {
      try {
        localStorage.removeItem(storageKey);
      } catch {
        // Returning to setup must also work if storage becomes unavailable.
        initializeSetup();
        return;
      }
      location.reload();
    });
    setStage("compare");
  } catch {
    root.setAttribute("aria-busy", "false");
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
  }
}

function initializeSetup(): void {
  root.replaceChildren(setupTemplate.content.cloneNode(true));
  setStage("setup");
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

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (blockPasswordManager() || submit.disabled) {
      return;
    }

    try {
      localStorage.setItem(storageKey, "true");
    } catch {
      warning.hidden = false;
      warning.textContent =
        "Allow site storage in your browser and try again. Your test credentials have not been stored by this page.";
      return;
    }
    observer.disconnect();
    location.reload();
  });
}
