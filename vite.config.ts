/// <reference types="vitest/config" />

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

import { surasuraPwaOptions } from "./src/core/pwa/config";

export default defineConfig({
  plugins: [react(), tailwindcss(), VitePWA(surasuraPwaOptions)],
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
