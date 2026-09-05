# Home page performance

The site stays on Vite with native HTML, CSS, and TypeScript. Product copy and the usage example render without JavaScript. The setup entry handles stage selection and the extension guard. The comparison module and stylesheet warm on the first setup focus, while its fields and browser icons appear only after submission. Native scrolling replaces the scrollbar runtime.

The production build inlines the small home stylesheet to remove a render-blocking request. Geist remains a self-hosted variable font. The Geist Mono code sample uses a 5,980-byte regular-weight ASCII/bullet subset. Both use optional font display, with system fallbacks when a font arrives too late.

## Setup transitions

Setup uses a native form and cancels its POST. After the comparison is ready, it removes the login form and uses `history.replaceState()` to signal completion without a document navigation. This follows [Chromium’s password-form guidance](https://www.chromium.org/developers/design-documents/create-amazing-password-forms/). The page shell and loaded fonts remain intact. Reset also switches in place.

Loading begins when a user focuses the setup form, so it normally finishes while they type. If loading is still pending at submission, the form stays visible with its values intact and the submit button is disabled. Failed imports or storage writes leave setup recoverable. Only the explicit recovery action for an initial failed comparison load reloads the document.

Local Chrome diagnostics confirmed the password manager’s `SAME_DOCUMENT_NAVIGATION` success signal and save-prompt request. Firefox displayed its native Save notification and preserved the document through setup and reset. Safari’s native save prompt still needs manual verification. A production transition check recorded no new document or font requests and unchanged hero dimensions. The warmed setup-to-comparison DOM switch took about 6ms in one local run. This is a lab observation, not a timing guarantee.

## Local measurements

Measured on September 5, 2026 against production previews of `05a1c3e` and the optimized site, using Chrome with disabled cache, 150ms network latency, 200,000 bytes/s download throughput, and 4× CPU throttling. Each viewport's timing is the median of three navigations. Transfer totals count the HTML and unique loaded resource URLs, including fonts, and exclude response headers.

| Metric                        |  Before |   After |
| ----------------------------- | ------: | ------: |
| Initial JavaScript, gzip      | 31.9 KB |  2.1 KB |
| Initial transferred resources | 73.4 KB | 43.0 KB |
| Mobile LCP, 390px viewport    |   724ms |   304ms |
| Desktop LCP, 1440px viewport  |   712ms |   304ms |
| Mobile CLS                    |       0 |       0 |
| Desktop CLS                   |       0 |  <0.001 |

These are local lab measurements, not production field data or guarantees for every device. A one-pixel headline text adjustment during font completion accounts for the remaining desktop shift in the throttled run.

## Verification and budgets

Production browser checks cover first-visit asset loading, the native setup submission without credential POSTs, deferred-import failure and reload recovery, masking and rejected browser writes, reset, disabled JavaScript, dark mode, and 320–1440px layouts. Firefox also passes a production smoke test for setup, comparison, masking, and detail controls.

After `vp build`, run `vp run check:site`. CI checks static first-paint content and limits initial HTML with critical CSS to 7,000 gzip bytes, initial JavaScript including static imports to 3,000 gzip bytes, Geist to 32,000 bytes, and the code font to 7,000 bytes. Deferred comparison assets must not be preloaded by the initial HTML. These limits leave room for small edits while detecting a return to loading the entire demo on a first visit.
