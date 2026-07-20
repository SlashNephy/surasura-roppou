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
    // 同梱 Web フォントはプリキャッシュせず、描画で使ったチャンクだけを取得後にキャッシュする。
    // 全書体・全サブセットのプリキャッシュは起動時のキャッシュ容量を圧迫するため、
    // OCR 資産（globIgnores）と同じオンデマンド方針を取る。
    runtimeCaching: [
      {
        // Vite が emit する自オリジンのフォントチャンク（/assets/*.woff2）に限定する。
        urlPattern: /\/assets\/[^/]+\.woff2$/,
        handler: "CacheFirst",
        options: {
          cacheName: "fonts",
          expiration: {
            // 日本語フォントは 1 書体が百数十のサブセットに分割されるため、
            // 本文・UI の 2 書体を常用しても収まる数を確保する。
            maxEntries: 512,
            // ファイル名にハッシュが付き内容が変わらないため、1 年の長期保持でよい。
            maxAgeSeconds: 60 * 60 * 24 * 365,
          },
        },
      },
    ],
  },
} satisfies Partial<VitePWAOptions>;
