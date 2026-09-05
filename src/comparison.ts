import "./comparison.css";
import chromeIcon from "./assets/browser-logos/chrome.png";
import edgeIcon from "./assets/browser-logos/edge.png";
import firefoxIcon from "./assets/browser-logos/firefox.png";
import safariIcon from "./assets/browser-logos/safari.png";
import { mask } from "./index.ts";

import comparisonHTML from "./comparison.html?raw";

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new TypeError(`Missing demo element: ${selector}`);
  }
  return element;
}

type Support = "supported" | "best-effort" | "unsupported";
type Assessment = readonly [status: Support, detail: string];
type BrowserSupport = readonly [Assessment, Assessment, Assessment, Assessment];
type MatrixRow = {
  label: string;
  solutions: readonly [BrowserSupport, BrowserSupport, BrowserSupport, BrowserSupport];
};

function allBrowsers(status: Support, detail: string): BrowserSupport {
  const assessment = [status, detail] as const;
  return [assessment, assessment, assessment, assessment];
}

const browsers = [
  {
    name: "Chrome",
    icon: chromeIcon,
  },
  {
    name: "Edge",
    icon: edgeIcon,
  },
  {
    name: "Firefox",
    icon: firefoxIcon,
  },
  {
    name: "Safari",
    icon: safariIcon,
  },
] as const;

const supportLabels: Record<Support, string> = {
  supported: "Supported",
  "best-effort": "Best effort",
  unsupported: "Unsupported",
};

const nativeValueProtection = [
  ["supported", "The native password control is exposed as protected instead of plaintext."],
  ["supported", "The native password control is exposed as protected instead of plaintext."],
  ["supported", "The native password control exposes the protected password state."],
  ["supported", "The native password control is exposed as AXSecureTextField with bullets."],
] as const satisfies BrowserSupport;

const nativePasswordAccessibility = [
  ["supported", "The native control provides platform password semantics and secure echo rules."],
  ["supported", "The native control provides platform password semantics and secure echo rules."],
  ["supported", "The native control exposes protected password-field semantics."],
  ["supported", "The native control exposes AXSecureTextField semantics."],
] as const satisfies BrowserSupport;

const supportMatrix = [
  {
    label: "Stops automatic autofill",
    solutions: [
      [
        ["unsupported", "Automatically fills both fields despite autocomplete=off."],
        ["unsupported", "Automatically fills both fields despite autocomplete=off."],
        ["unsupported", "Automatically fills both fields despite autocomplete=off."],
        [
          "supported",
          "Safari does not fill automatically; it waits for interaction before showing a picker.",
        ],
      ],
      allBrowsers(
        "supported",
        "No automatic fill was observed; interaction-triggered password UI is evaluated separately.",
      ),
      [
        ["supported", "No automatic fill was observed."],
        ["supported", "No automatic fill was observed."],
        ["supported", "No automatic fill was observed."],
        [
          "supported",
          "Safari does not fill automatically; it waits for interaction before showing a picker.",
        ],
      ],
      allBrowsers("supported", "No automatic fill was observed."),
    ],
  },
  {
    label: "Avoids autofill UI",
    solutions: [
      [
        ["unsupported", "The native password field remains eligible for password-manager UI."],
        ["unsupported", "The native password field remains eligible for password-manager UI."],
        ["unsupported", "The native password field remains eligible for password-manager UI."],
        ["unsupported", "Focusing either field opens the password picker."],
      ],
      [
        ["unsupported", "Focusing the secret opens password-manager UI."],
        ["unsupported", "Focusing the secret opens password-manager UI."],
        [
          "unsupported",
          "Focusing either field opens password-manager UI; the secret gets a new-password picker.",
        ],
        ["unsupported", "Focusing the fields opens the new-password picker."],
      ],
      [
        ["supported", "No password-manager UI was observed."],
        ["supported", "No password-manager UI was observed."],
        ["supported", "No password-manager UI was observed."],
        ["unsupported", "Focusing either field opens the password picker."],
      ],
      allBrowsers("supported", "No password-manager UI was observed."),
    ],
  },
  {
    label: "Hides actual value from assistive tech",
    solutions: [
      nativeValueProtection,
      nativeValueProtection,
      allBrowsers(
        "unsupported",
        "CSS changes painting only; accessibility APIs still receive the text input's plaintext value.",
      ),
      allBrowsers(
        "supported",
        "The accessible value contains bullets because the DOM value is masked; typing echo may still announce new input.",
      ),
    ],
  },
  {
    label: "Undo/redo",
    solutions: [
      allBrowsers("supported", "Uses the browser's native editing history."),
      allBrowsers("supported", "Uses the browser's native editing history."),
      allBrowsers("supported", "Uses the browser's native editing history."),
      allBrowsers(
        "best-effort",
        "Keyboard and beforeinput undo/redo are simulated in controller state; grouping and context-menu integration can differ from native behavior.",
      ),
    ],
  },
  {
    label: "Disables IME",
    solutions: [
      allBrowsers("supported", "Native password-field behavior prevents normal IME composition."),
      allBrowsers("supported", "Native password-field behavior prevents normal IME composition."),
      [
        [
          "best-effort",
          "After text exists, Chrome treats the field as password-like and blocks IME switching; the first empty-field interaction is unreliable.",
        ],
        [
          "unsupported",
          "IME remains switchable; preventing compositionstart does not stop composition.",
        ],
        ["supported", "Firefox honors ime-mode: disabled and prevents composition."],
        [
          "unsupported",
          "Safari ignores ime-mode and preventing compositionstart does not stop composition.",
        ],
      ],
      [
        [
          "supported",
          "The custom-password primer makes current Chrome block IME switching for the masked field.",
        ],
        [
          "best-effort",
          "IME cannot be disabled, but composition drafts do not change the secret and the committed result is applied once.",
        ],
        ["supported", "Firefox honors ime-mode: disabled and prevents composition."],
        [
          "best-effort",
          "IME cannot be disabled, but composition drafts do not change the secret and the committed result is applied once.",
        ],
      ],
    ],
  },
  {
    label: "Native password accessibility",
    solutions: [
      nativePasswordAccessibility,
      nativePasswordAccessibility,
      allBrowsers(
        "unsupported",
        "The control remains an ordinary text field; visual CSS masking adds no secure accessibility semantics.",
      ),
      allBrowsers(
        "unsupported",
        "The control remains an ordinary text field, and no standard ARIA role can restore native password semantics.",
      ),
    ],
  },
] as const satisfies readonly MatrixRow[];

export function initializeComparison(root: HTMLElement, onReset: () => void): void {
  const template = document.createElement("template");
  template.innerHTML = comparisonHTML;
  for (const icon of template.content.querySelectorAll<HTMLImageElement>(".legend img")) {
    icon.src = chromeIcon;
  }
  root.replaceChildren(template.content.cloneNode(true));
  renderSupportMatrix();

  mask(requiredElement<HTMLInputElement>("#masked-signing-secret"));
  const cssMasked = requiredElement<HTMLInputElement>("#css-signing-secret");

  cssMasked.style.setProperty("ime-mode", "disabled");
  cssMasked.addEventListener("compositionstart", (event) => {
    event.preventDefault();
  });

  if (CSS.supports("-webkit-text-security", "disc")) {
    cssMasked.style.setProperty("-webkit-text-security", "disc");
  }

  root.addEventListener("submit", (event) => {
    event.preventDefault();
  });

  requiredElement<HTMLButtonElement>("#reset-demo").addEventListener("click", onReset);
}

function renderSupportMatrix(): void {
  const body = requiredElement<HTMLTableSectionElement>("#support-matrix");
  const detailOutput = requiredElement<HTMLElement>("#support-detail");
  const solutions = ["Autocomplete off", "New-password", "CSS masking", "Secret Input"];

  for (const row of supportMatrix) {
    const tableRow = document.createElement("tr");
    const heading = document.createElement("th");
    heading.scope = "row";
    heading.textContent = row.label;
    tableRow.append(heading);

    for (const [solutionIndex, statuses] of row.solutions.entries()) {
      const cell = document.createElement("td");
      if (solutionIndex === row.solutions.length - 1) {
        cell.dataset.recommended = "true";
      }

      const group = document.createElement("span");
      group.className = "browser-support";
      group.setAttribute("role", "group");

      for (const [browserIndex, [status, detail]] of statuses.entries()) {
        const browser = browsers[browserIndex];
        if (!browser) {
          throw new RangeError(`Missing browser at index ${browserIndex}.`);
        }

        const description = `${browser.name}: ${supportLabels[status]}. ${detail}`;
        const icon = document.createElement("img");
        icon.className = "browser-icon";
        icon.src = browser.icon;
        icon.alt = "";
        icon.width = 18;
        icon.height = 18;
        icon.dataset.support = status;
        icon.title = description;
        const button = document.createElement("button");
        button.type = "button";
        button.className = "browser-detail";
        button.setAttribute("aria-label", description);
        button.append(icon);
        const showDetail = () => {
          detailOutput.textContent = `${row.label} · ${solutions[solutionIndex]} · ${description}`;
        };
        button.addEventListener("focus", showDetail);
        button.addEventListener("click", showDetail);
        group.append(button);
      }

      group.setAttribute("aria-label", `${row.label}: ${solutions[solutionIndex]}`);
      cell.append(group);
      tableRow.append(cell);
    }

    body.append(tableRow);
  }
}
