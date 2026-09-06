import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";

const html = await readFile(new URL("../dist/index.html", import.meta.url), "utf8");
const firstPaintHTML = html.replace(/<template\b[^>]*>[\s\S]*?<\/template>/g, "");
assert.match(firstPaintHTML, /<h1\b/, "The product heading must not depend on JavaScript.");
const example = firstPaintHTML.match(/<pre\b[^>]*class="shiki\b[^>]*>([\s\S]*?)<\/pre>/);
assert.ok(example?.[1], "Shiki must render the example before the HTML is served.");
assert.match(
  example[1].replace(/<[^>]+>/g, ""),
  /createSecretInput\(element,/,
  "Highlighting must preserve the example text.",
);
assert.doesNotMatch(
  html,
  /<link\b[^>]*rel="stylesheet"/,
  "Home styles must not add a blocking request.",
);
assert.doesNotMatch(
  html,
  /<link\b[^>]*href="[^"]*comparison/,
  "Comparison assets must stay deferred.",
);

const entry = html.match(/<script\b[^>]*src="([^"]+)"/);
assert.ok(entry?.[1], "The production entry must exist.");
const manifest = JSON.parse(
  await readFile(new URL("../dist/.vite/manifest.json", import.meta.url), "utf8"),
);
const initialChunks = new Set();
function includeStaticImports(key) {
  if (initialChunks.has(key)) return;
  assert.ok(manifest[key], `Missing build manifest entry: ${key}`);
  initialChunks.add(key);
  for (const dependency of manifest[key].imports ?? []) includeStaticImports(dependency);
}
includeStaticImports("index.html");
assert.equal(`/${manifest["index.html"].file}`, entry[1]);
let initialJavaScript = 0;
for (const key of initialChunks) {
  const chunk = await readFile(new URL(`../dist/${manifest[key].file}`, import.meta.url));
  initialJavaScript += gzipSync(chunk).length;
}
const sizes = {
  "HTML including critical CSS (gzip)": [gzipSync(html).length, 7_000],
  "Initial JavaScript including static imports (gzip)": [initialJavaScript, 3_000],
  "Geist font": [
    (await readFile(new URL("../dist/fonts/geist-latin.woff2", import.meta.url))).length,
    32_000,
  ],
  "Geist Mono code font": [
    (await readFile(new URL("../dist/fonts/geist-mono-code.woff2", import.meta.url))).length,
    7_000,
  ],
};
for (const [label, [bytes, budget]] of Object.entries(sizes)) {
  assert.ok(bytes <= budget, `${label}: ${bytes} bytes exceeds the ${budget}-byte budget.`);
  console.log(`${label}: ${bytes} / ${budget} bytes`);
}
