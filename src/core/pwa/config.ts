import type { ManifestOptions, VitePWAOptions } from "vite-plugin-pwa";

export const surasuraPwaManifest = {
  name: "すらすら六法",
  short_name: "すら六",
  description: "法令を読みやすく閲覧し、条文参照をすぐ確認できる Web/PWA アプリです。",
  start_url: "/",
  scope: "/",
  display: "standalone",
  background_color: "#fafafa",
  theme_color: "#4f46e5",
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
  },
} satisfies Partial<VitePWAOptions>;
