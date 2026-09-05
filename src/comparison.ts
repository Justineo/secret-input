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
type Assessment = readonly [status: Support, detail: string, ...details: string[]];
type BrowserSupport = readonly [Assessment, Assessment, Assessment, Assessment];
type MatrixRow = {
  label: string;
  solutions: readonly [BrowserSupport, BrowserSupport, BrowserSupport, BrowserSupport];
};

function allBrowsers(status: Support, ...details: [string, ...string[]]): BrowserSupport {
  const assessment = [status, ...details] as const;
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
  ["supported", "Protected value without plaintext."],
  ["supported", "Protected value without plaintext."],
  ["supported", "Protected password value."],
  ["supported", "AXSecureTextField with bullets."],
] as const satisfies BrowserSupport;

const nativePasswordAccessibility = [
  ["supported", "Native password semantics and secure typing echo."],
  ["supported", "Native password semantics and secure typing echo."],
  ["supported", "Native protected-field semantics."],
  ["supported", "Native AXSecureTextField semantics."],
] as const satisfies BrowserSupport;

const supportMatrix = [
  {
    label: "Stops automatic autofill",
    solutions: [
      [
        ["unsupported", "Both fields autofill despite autocomplete=off."],
        ["unsupported", "Both fields autofill despite autocomplete=off."],
        ["unsupported", "Both fields autofill despite autocomplete=off."],
        ["supported", "No automatic fill.", "Interaction opens a password picker."],
      ],
      allBrowsers(
        "supported",
        "No automatic fill observed.",
        "Password suggestions may still appear on interaction.",
      ),
      [
        ["supported", "No automatic fill observed."],
        ["supported", "No automatic fill observed."],
        ["supported", "No automatic fill observed."],
        ["supported", "No automatic fill.", "Interaction opens a password picker."],
      ],
      allBrowsers("supported", "No automatic fill observed."),
    ],
  },
  {
    label: "Avoids autofill UI",
    solutions: [
      [
        ["unsupported", "Password suggestions remain available."],
        ["unsupported", "Password suggestions remain available."],
        ["unsupported", "Password suggestions remain available."],
        ["unsupported", "Either field opens a password picker on focus."],
      ],
      [
        ["unsupported", "Secret field opens password suggestions on focus."],
        ["unsupported", "Secret field opens password suggestions on focus."],
        [
          "unsupported",
          "Both fields show password suggestions on focus.",
          "Secret field offers new passwords.",
        ],
        ["unsupported", "Focus opens a new-password picker."],
      ],
      [
        ["supported", "No password suggestions observed."],
        ["supported", "No password suggestions observed."],
        ["supported", "No password suggestions observed."],
        ["unsupported", "Either field opens a password picker on focus."],
      ],
      allBrowsers("supported", "No password suggestions observed."),
    ],
  },
  {
    label: "Hides actual value from assistive tech",
    solutions: [
      nativeValueProtection,
      nativeValueProtection,
      allBrowsers(
        "unsupported",
        "Visual masking only.",
        "Assistive technology receives plaintext.",
      ),
      allBrowsers(
        "supported",
        "Accessible value contains bullets.",
        "Typing echo may announce new input.",
      ),
    ],
  },
  {
    label: "Undo/redo",
    solutions: [
      allBrowsers("supported", "Native browser history."),
      allBrowsers("supported", "Native browser history."),
      allBrowsers("supported", "Native browser history."),
      allBrowsers(
        "best-effort",
        "Keyboard and beforeinput undo/redo supported.",
        "Grouping and context menus may differ.",
      ),
    ],
  },
  {
    label: "Disables IME",
    solutions: [
      allBrowsers("supported", "Native password behavior blocks composition."),
      allBrowsers("supported", "Native password behavior blocks composition."),
      [
        ["best-effort", "IME blocked after text is entered.", "Unreliable while empty."],
        ["unsupported", "IME stays enabled.", "Canceling compositionstart has no effect."],
        ["supported", "ime-mode: disabled blocks composition."],
        [
          "unsupported",
          "IME stays enabled.",
          "ime-mode and compositionstart cancellation have no effect.",
        ],
      ],
      [
        ["supported", "Custom-password primer blocks IME switching."],
        [
          "best-effort",
          "IME stays enabled. Drafts leave the secret unchanged.",
          "Committed text applied once.",
        ],
        ["supported", "ime-mode: disabled blocks composition."],
        [
          "best-effort",
          "IME stays enabled. Drafts leave the secret unchanged.",
          "Committed text applied once.",
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
        "Ordinary text-field semantics.",
        "CSS adds no secure accessibility behavior.",
      ),
      allBrowsers(
        "unsupported",
        "Ordinary text-field semantics.",
        "ARIA cannot add native password behavior.",
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
  let selectedButton: HTMLButtonElement | undefined;

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

      for (const [browserIndex, [status, ...details]] of statuses.entries()) {
        const browser = browsers[browserIndex];
        if (!browser) {
          throw new RangeError(`Missing browser at index ${browserIndex}.`);
        }

        const description = `${browser.name}: ${supportLabels[status]}`;
        const icon = document.createElement("img");
        icon.className = "browser-icon";
        icon.src = browser.icon;
        icon.alt = "";
        icon.width = 18;
        icon.height = 18;
        icon.dataset.support = status;
        icon.title = `${description}. ${details.join(" ")}`;
        const button = document.createElement("button");
        button.type = "button";
        button.className = "browser-detail";
        button.setAttribute("aria-label", description);
        button.append(icon);
        const showDetail = () => {
          if (selectedButton === button) return;
          selectedButton?.removeAttribute("aria-current");
          button.setAttribute("aria-current", "true");
          selectedButton = button;

          const notes = document.createElement("ul");
          notes.className = "support-detail-notes";
          for (const detail of details) {
            const note = document.createElement("li");
            note.textContent = detail;
            notes.append(note);
          }
          detailOutput.replaceChildren(notes);
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
