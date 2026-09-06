import "./comparison.css";
import chromeIcon from "./assets/browser-logos/chrome.png";
import edgeIcon from "./assets/browser-logos/edge.png";
import firefoxIcon from "./assets/browser-logos/firefox.png";
import safariIcon from "./assets/browser-logos/safari.png";
import { createSecretInput } from "./index.ts";

import { initializeTextareaExperiment } from "./textarea-experiment.ts";

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
  solutions: readonly [
    BrowserSupport,
    BrowserSupport,
    BrowserSupport,
    BrowserSupport,
    BrowserSupport,
  ];
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

const nativeValueConcealment = allBrowsers("supported", "The actual value is not read out.");

const nativePasswordAccessibility = allBrowsers(
  "supported",
  "Recognized as a password field by assistive technology.",
  "Typing feedback uses sounds rather than speaking the entered characters.",
);

const cssValueConcealment: BrowserSupport = [
  ["supported", "The actual value is not read out.", "Typing feedback announces bullets."],
  ["supported", "The actual value is not read out.", "Typing feedback announces bullets."],
  ["supported", "The actual value is not read out.", "Typing feedback announces bullets."],
  ["unsupported", "The actual characters are read out."],
];

const supportMatrix = [
  {
    label: "Stops automatic autofill",
    solutions: [
      [
        ["unsupported", "Both fields are filled automatically."],
        ["unsupported", "Both fields are filled automatically."],
        ["unsupported", "Both fields are filled automatically."],
        ["supported", "No automatic fill observed.", "Password suggestions appear on interaction."],
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
        ["supported", "No automatic fill observed.", "Password suggestions appear on interaction."],
      ],
      allBrowsers("supported", "No automatic fill observed."),
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
        ["unsupported", "Both fields show password suggestions on focus."],
      ],
      [
        ["unsupported", "Secret field shows password suggestions on focus."],
        ["unsupported", "Secret field shows password suggestions on focus."],
        [
          "unsupported",
          "Both fields show password suggestions on focus.",
          "Secret field offers new passwords.",
        ],
        ["unsupported", "New-password suggestions appear on focus."],
      ],
      [
        ["supported", "No password suggestions observed."],
        ["supported", "No password suggestions observed."],
        ["supported", "No password suggestions observed."],
        ["unsupported", "Both fields show password suggestions on focus."],
      ],
      allBrowsers("supported", "No password suggestions observed."),
      allBrowsers("supported", "No password suggestions observed."),
    ],
  },
  {
    label: "Hides actual value from assistive tech*",
    solutions: [
      nativeValueConcealment,
      nativeValueConcealment,
      cssValueConcealment,
      cssValueConcealment,
      [
        [
          "supported",
          "The actual value is not read out.",
          "Newly typed characters may still be announced.",
        ],
        [
          "supported",
          "The actual value is not read out.",
          "Newly typed characters may still be announced.",
        ],
        [
          "supported",
          "The actual value is not read out.",
          "Newly typed characters may still be announced.",
        ],
        [
          "supported",
          "The actual value is not read out.",
          "Typing feedback says bullet for the first character, then comma for subsequent characters.",
        ],
      ],
    ],
  },
  {
    label: "Undo/redo",
    solutions: [
      allBrowsers("supported", "Standard browser undo/redo."),
      allBrowsers("supported", "Standard browser undo/redo."),
      allBrowsers("supported", "Standard browser undo/redo."),
      allBrowsers("supported", "Standard browser undo/redo."),
      allBrowsers(
        "best-effort",
        "Keyboard undo/redo supported.",
        "Which edits are undone together and menu support may differ from native inputs.",
      ),
    ],
  },
  {
    label: "Disables IME",
    solutions: [
      allBrowsers("supported", "IME input is disabled."),
      allBrowsers("supported", "IME input is disabled."),
      [
        [
          "best-effort",
          "IME input is disabled after text is entered.",
          "May remain available while empty.",
        ],
        ["unsupported", "IME input remains available."],
        ["supported", "IME input is disabled."],
        ["unsupported", "IME input remains available."],
      ],
      [
        [
          "best-effort",
          "IME input is disabled after text is entered.",
          "May remain available while empty.",
        ],
        ["unsupported", "IME input remains available."],
        ["supported", "IME input is disabled."],
        ["unsupported", "IME input remains available."],
      ],
      [
        [
          "supported",
          "IME input is disabled, including while empty.",
          "Initialization primes the field with two mask characters, then immediately restores its value.",
        ],
        [
          "best-effort",
          "IME input remains available.",
          "Only confirmed text changes the secret, without duplicate characters.",
        ],
        ["supported", "IME input is disabled."],
        [
          "best-effort",
          "IME input remains available.",
          "Only confirmed text changes the secret, without duplicate characters.",
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
        "Recognized as a regular text field by assistive technology.",
        "Password-specific screen reader settings may not apply.",
      ),
      allBrowsers(
        "unsupported",
        "Recognized as a regular text field by assistive technology.",
        "Password-specific screen reader settings may not apply.",
      ),
      allBrowsers(
        "unsupported",
        "Recognized as a regular text field by assistive technology.",
        "Password-specific screen reader settings may not apply.",
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

  createSecretInput(requiredElement<HTMLInputElement>("#masked-signing-secret"));
  const textarea = requiredElement<HTMLTextAreaElement>("#textarea-signing-secret");
  const textareaStatus = requiredElement<HTMLElement>("#textarea-status");
  initializeTextareaExperiment(textarea, textareaStatus);
  const cssMasked = requiredElement<HTMLInputElement>("#css-signing-secret");

  cssMasked.style.setProperty("ime-mode", "disabled");
  cssMasked.addEventListener("compositionstart", (event) => {
    event.preventDefault();
  });

  if (CSS.supports("-webkit-text-security", "disc")) {
    cssMasked.style.setProperty("-webkit-text-security", "disc");
  }

  requiredElement<HTMLElement>(".comparison-page").addEventListener("submit", (event) => {
    event.preventDefault();
    if (event.target === textarea.form) {
      textareaStatus.textContent = "Test form submitted. Nothing was sent.";
    }
  });

  requiredElement<HTMLButtonElement>("#reset-demo").addEventListener("click", onReset);
}

function renderSupportMatrix(): void {
  const body = requiredElement<HTMLTableSectionElement>("#support-matrix");
  const detailOutput = requiredElement<HTMLElement>("#support-detail");
  const solutions = [
    "Autocomplete off",
    "New-password",
    "CSS masking",
    "Textarea + CSS",
    "Secret Input",
  ];
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
