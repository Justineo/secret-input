import { defineConfig } from "vitest/config";
import { webdriverio } from "@vitest/browser-webdriverio";
import Vue from "unplugin-vue/vite";

const supportedBrowsers = ["chrome", "edge", "firefox", "safari"] as const;

function driverCapabilities(): WebdriverIO.Capabilities {
  const binary = process.env.WEBDRIVER_BINARY;
  if (!binary) {
    return {};
  }

  switch (process.env.BROWSER) {
    case "chrome":
      return { "wdio:chromedriverOptions": { binary } };
    case "edge":
      return {
        "ms:edgeOptions": {
          args: ["--disable-dev-shm-usage", "--no-sandbox"],
        },
        "wdio:edgedriverOptions": { binary },
      };
    case "firefox":
      return { "wdio:geckodriverOptions": { binary } };
    default:
      return {};
  }
}

function selectedBrowsers(): (typeof supportedBrowsers)[number][] {
  const requested = process.env.BROWSER;
  if (requested) {
    const browser = supportedBrowsers.find((candidate) => candidate === requested);
    if (!browser) {
      throw new Error(`Unsupported BROWSER: ${requested}`);
    }
    return [browser];
  }

  return process.platform === "darwin"
    ? [...supportedBrowsers]
    : supportedBrowsers.filter((browser) => browser !== "safari");
}

// Keep Vitest 5 isolated from Vite+'s bundled Vitest 4 resolver.
export default defineConfig(({ mode }) => {
  const browserMode = mode === "browser";

  return {
    ...(browserMode
      ? {
          optimizeDeps: {
            include: [
              "react",
              "react-dom",
              "react-dom/client",
              "react-dom/server",
              "vue",
              "vue/server-renderer",
            ],
          },
        }
      : {}),
    plugins: [Vue()],
    server: { host: "127.0.0.1" },
    test: browserMode
      ? {
          browser: {
            connectTimeout: 180_000,
            enabled: true,
            instances: selectedBrowsers().map((browser) => ({
              browser,
              headless: browser !== "safari",
            })),
            provider: webdriverio({
              capabilities: driverCapabilities(),
              outputDir: ".vitest-attachments/webdriver",
            }),
            ui: false,
          },
          include: ["tests/browser/**/*.test.ts"],
        }
      : {
          environment: "happy-dom",
          include: ["tests/*.test.ts"],
        },
  };
});
