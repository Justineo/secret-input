import { defineConfig } from "vite-plus";
import { webdriverio } from "vite-plus/test/browser-webdriverio";
import Vue from "unplugin-vue/vite";
import VueRolldown from "unplugin-vue/rolldown";

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
    plugins: [
      Vue(),
      {
        name: "highlight-home-example",
        async transformIndexHtml(html) {
          const example = html.match(
            /<pre data-highlight="javascript"><code>([\s\S]*?)<\/code><\/pre>/,
          );
          if (!example?.[1]) return html;
          // Run only in Vite's Node process, for both development and production HTML.
          const { codeToHtml } = await import("shiki");
          const entities: Record<string, string> = {
            "&amp;": "&",
            "&lt;": "<",
            "&gt;": ">",
            "&quot;": '"',
            "&#39;": "'",
          };
          const code = example[1].replace(
            /&(amp|lt|gt|quot|#39);/g,
            (entity) => entities[entity] ?? entity,
          );
          const highlighted = await codeToHtml(code, {
            lang: "javascript",
            themes: { light: "github-light", dark: "github-dark" },
            defaultColor: false,
          });
          return html.replace(example[0], () => highlighted);
        },
      },
      {
        name: "inline-home-styles",
        apply: "build",
        generateBundle: {
          order: "post",
          handler(_options, bundle) {
            const html = bundle["index.html"];
            if (html?.type !== "asset" || typeof html.source !== "string") return;
            // The small home stylesheet needs no extra request. Comparison CSS stays deferred.
            html.source = html.source.replace(
              /<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g,
              (tag: string, href: string) => {
                const css = bundle[href.replace(/^\//, "")];
                return css?.type === "asset" && typeof css.source === "string"
                  ? `<style>${css.source}</style>`
                  : tag;
              },
            );
          },
        },
      },
    ],
    build: {
      assetsInlineLimit: 0,
      manifest: true,
    },
    server: {
      host: "127.0.0.1",
    },
    pack: {
      entry: ["src/index.ts", "src/react.ts", "src/vue.ts"],
      deps: {
        dts: {
          neverBundle: true,
        },
        neverBundle: true,
        onlyImport: ["react", "vue"],
      },
      dts: {
        vue: true,
      },
      exports: true,
      plugins: [
        VueRolldown({ isProduction: true }),
        {
          name: "public-vue-type-imports",
          renderChunk(code, chunk) {
            if (!/\.d\.[cm]?ts$/.test(chunk.fileName)) return;
            // The declaration generator names Vue's internal packages. All
            // referenced types are re-exported by our only public peer, vue.
            return code.replace(/import\("@vue\/(?:runtime-core|reactivity)"\)/g, 'import("vue")');
          },
        },
      ],
    },
    lint: {
      ignorePatterns: ["tests/package/**"],
      plugins: ["typescript"],
      options: {
        typeAware: true,
        typeCheck: true,
      },
    },
    fmt: {
      semi: true,
    },
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
