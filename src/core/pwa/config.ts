import type { ManifestOptions, VitePWAOptions } from "vite-plugin-pwa";

export const surasuraPwaManifest = {
  name: "すらすら六法",
  short_name: "すら六",
  description: "法令を読みやすく閲覧し、条文参照をすぐ確認できる Web/PWA アプリです。",
  start_url: "/",
  scope: "/",
  display: "standalone",
  background_color: "#fcfbf8",
  theme_color: "#166534",
  lang: "ja",
  icons: [
    {
      src: "/pwa.svg",
      sizes: "any",
      type: "image/svg+xml",
      purpose: "any maskable",
    },
  ],
} satisfies Partial<ManifestOptions>;

export const surasuraPwaOptions = {
  injectRegister: false,
  registerType: "prompt",
  manifest: surasuraPwaManifest,
  workbox: {
    cleanupOutdatedCaches: true,
    clientsClaim: true,
    skipWaiting: false,
    navigateFallback: "/index.html",
    globPatterns: ["**/*.{js,css,html,ico,png,svg,webmanifest}"],
    // tesseract core/worker（数MB の wasm.js）と OCR モデル（2.4MB）は SW のプリキャッシュ対象外とする。
    // これらは OCR 初回実行時にオンデマンドで fetch されるため、起動時のキャッシュ容量を圧迫しない。
    globIgnores: ["tesseract/**", "tessdata/**"],
  },
} satisfies Partial<VitePWAOptions>;
