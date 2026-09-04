import { defineConfig } from "vite-plus";
import Vue from "unplugin-vue/vite";
import VueRolldown from "unplugin-vue/rolldown";

export default defineConfig({
  plugins: [Vue()],
  server: {
    host: "127.0.0.1",
  },
  pack: {
    entry: ["src/index.ts", "src/react.ts", "src/vue.ts"],
    dts: {
      vue: true,
    },
    exports: true,
    plugins: [VueRolldown({ isProduction: true })],
  },
  lint: {
    plugins: ["typescript"],
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {
    semi: true,
  },
  test: {
    environment: "happy-dom",
    include: ["tests/**/*.test.ts"],
  },
});
