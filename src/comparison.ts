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

type Support = "supported" | "caveats" | "unsupported";
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
  caveats: "Supported with caveats",
  unsupported: "Unsupported",
};

const nativeValueConcealment = allBrowsers("supported", "The actual value is not read out.");

const nativePasswordRecognition = allBrowsers(
  "supported",
  "Recognized as a password field by assistive technology.",
);

const cssValueConcealment: BrowserSupport = [
  ["supported", "The actual value is not read out."],
  ["supported", "The actual value is not read out."],
  ["supported", "The actual value is not read out."],
  ["unsupported", "The actual characters are read out."],
];

const noAutomaticFill: BrowserSupport = [
  ["supported", "No automatic fill observed."],
  ["supported", "No automatic fill observed."],
  ["supported", "No automatic fill observed."],
  ["supported", "Safari requires user action to fill."],
];

const nativeClipboard = allBrowsers(
  "supported",
  "Copy and cut are blocked; menu items are disabled.",
);

const cssClipboard: BrowserSupport = [
  ["caveats", "Copies bullets; cut also deletes the selection."],
  ["caveats", "Copies bullets; cut also deletes the selection."],
  ["unsupported", "Copies the actual value; cut also deletes the selection."],
  ["caveats", "Copies bullets; cut also deletes the selection."],
];

const supportMatrix = [
  {
    label: "No automatic autofill",
    solutions: [
      [
        ["unsupported", "Both fields are filled automatically."],
        ["unsupported", "Both fields are filled automatically."],
        ["unsupported", "Both fields are filled automatically."],
        noAutomaticFill[3],
      ],
      noAutomaticFill,
      noAutomaticFill,
      noAutomaticFill,
      noAutomaticFill,
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
        ["unsupported", "Both fields show password suggestions on focus."],
        ["unsupported", "Password suggestions appear on focus."],
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
      allBrowsers("supported", "The actual value is not read out."),
    ],
  },
  {
    label: "Copy/cut",
    solutions: [
      nativeClipboard,
      nativeClipboard,
      cssClipboard,
      cssClipboard,
      allBrowsers("supported", "Copy and cut are blocked; menu items remain enabled."),
    ],
  },
  {
    label: "Undo/redo",
    solutions: [
      allBrowsers("supported", "Native undo/redo."),
      allBrowsers("supported", "Native undo/redo."),
      allBrowsers("supported", "Native undo/redo."),
      allBrowsers("supported", "Native undo/redo."),
      allBrowsers(
        "caveats",
        "Keyboard undo/redo supported.",
        "Edit grouping and menu support may differ from native inputs.",
      ),
    ],
  },
  {
    label: "IME handling",
    solutions: [
      allBrowsers("supported", "IME is disabled."),
      allBrowsers("supported", "IME is disabled."),
      [
        ["caveats", "IME is available initially, then disabled after two characters."],
        ["unsupported", "IME remains active; composition drafts are not filtered."],
        ["supported", "Disabled via ime-mode: disabled."],
        ["unsupported", "IME remains active; composition drafts are not filtered."],
      ],
      [
        ["supported", "Handled by the browser."],
        ["unsupported", "IME remains active; composition drafts are not filtered."],
        ["supported", "Disabled via ime-mode: disabled."],
        ["unsupported", "IME remains active; composition drafts are not filtered."],
      ],
      [
        ["supported", "Prewarmed with two mask characters to disable IME, even while empty."],
        ["caveats", "Confirmed text is committed once; composition drafts are not shown."],
        ["supported", "Disabled via ime-mode: disabled."],
        ["caveats", "Confirmed text is committed once; composition drafts are not shown."],
      ],
    ],
  },
  {
    label: "Recognized as a password field†",
    solutions: [
      nativePasswordRecognition,
      nativePasswordRecognition,
      allBrowsers("unsupported", "Recognized as a regular text field by assistive technology."),
      allBrowsers("unsupported", "Recognized as a text area by assistive technology."),
      allBrowsers("unsupported", "Recognized as a regular text field by assistive technology."),
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

  const masked = requiredElement<HTMLInputElement>("#masked-signing-secret");
  const controller = createSecretInput(masked);
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

  const showValues = requiredElement<HTMLInputElement>("#show-actual-values");
  const previews = [
    ...root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('[id$="-signing-secret"]'),
  ].map((field) => {
    const preview = document.createElement("p");
    preview.className = "actual-value";
    preview.hidden = true;
    const label = document.createElement("span");
    label.textContent = "Actual value";
    const value = document.createElement("code");
    preview.append(label, value);
    field.after(preview);

    const synchronize = () => {
      preview.hidden = !showValues.checked;
      value.textContent = showValues.checked
        ? JSON.stringify(field === masked ? controller.value : field.value)
        : "";
    };
    field.addEventListener("input", synchronize);
    field.addEventListener("change", synchronize);
    field.addEventListener("focus", synchronize);
    return synchronize;
  });
  showValues.addEventListener("change", () => {
    for (const synchronize of previews) synchronize();
  });

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
  let tabStop: HTMLButtonElement | undefined;
  const buttonRows: HTMLButtonElement[][] = [];

  for (const [rowIndex, row] of supportMatrix.entries()) {
    const rowButtons: HTMLButtonElement[] = [];
    buttonRows.push(rowButtons);
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
        button.tabIndex = tabStop ? -1 : 0;
        tabStop ??= button;
        const columnIndex = rowButtons.length;
        rowButtons.push(button);
        button.setAttribute("aria-label", description);
        if (status === "caveats") {
          const marker = document.createElement("span");
          marker.className = "browser-caveat";
          marker.append(icon);
          button.append(marker);
        } else {
          button.append(icon);
        }
        const showDetail = () => {
          if (tabStop) tabStop.tabIndex = -1;
          button.tabIndex = 0;
          tabStop = button;
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
        button.addEventListener("keydown", (event) => {
          if (
            event.defaultPrevented ||
            event.altKey ||
            event.ctrlKey ||
            event.metaKey ||
            event.shiftKey
          ) {
            return;
          }
          let nextRow = rowIndex;
          let nextColumn = columnIndex;
          switch (event.key) {
            case "ArrowLeft":
              nextColumn -= 1;
              break;
            case "ArrowRight":
              nextColumn += 1;
              break;
            case "ArrowUp":
              nextRow -= 1;
              break;
            case "ArrowDown":
              nextRow += 1;
              break;
            default:
              return;
          }
          event.preventDefault();
          const next = buttonRows[nextRow]?.[nextColumn];
          if (!next) return;
          next.focus({ preventScroll: true });
          next.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
        });
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
