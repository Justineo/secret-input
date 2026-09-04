import { readFileSync } from "node:fs";

const packageJson = new URL("../package.json", import.meta.url);
const version = process.argv[2] ?? JSON.parse(readFileSync(packageJson, "utf8")).version;
const prerelease = version
  .replace(/^v/, "")
  .split("+", 1)[0]
  .match(/-(.+)$/)?.[1];
const tag = prerelease
  ?.split(".")
  .find((identifier) => /\D/.test(identifier))
  ?.toLowerCase();

if (prerelease && !tag) {
  throw new Error(`Cannot derive npm dist-tag from numeric prerelease "${prerelease}".`);
}

process.stdout.write(tag ?? "latest");
