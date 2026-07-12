/// <reference types="vitest/config" />

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { viteStaticCopy } from "vite-plugin-static-copy";

import { surasuraPwaOptions } from "./src/core/pwa/config";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA(surasuraPwaOptions),
    viteStaticCopy({
      targets: [
        // tesseract.js-core の wasm 一式を自オリジンへ配置し corePath="/tesseract" から解決させる。
        // LICENSE/README/index.js/package.json 等の不要ファイルを除外し wasm と wasm.js のみを配信する。
        // pnpm のシムリンク構造をストリップして dest 直下にフラット展開するため stripBase を使う。
        {
          src: "node_modules/tesseract.js-core/*.wasm*",
          dest: "tesseract",
          rename: { stripBase: true },
        },
        // worker スクリプトを自オリジンへ配置し workerPath="/tesseract/worker.min.js" から解決させる。
        // pnpm のシムリンク構造をストリップして dest 直下に配置するため stripBase を使う。
        {
          src: "node_modules/tesseract.js/dist/worker.min.js",
          dest: "tesseract",
          rename: { stripBase: true },
        },
      ],
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.ts",
  },
});
