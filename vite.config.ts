import { defineConfig } from "vite-plus";
import Vue from "unplugin-vue/vite";
import VueRolldown from "unplugin-vue/rolldown";

export default defineConfig({
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
});
