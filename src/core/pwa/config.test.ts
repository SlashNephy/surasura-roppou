import { describe, expect, it } from "vitest";

import { surasuraPwaManifest, surasuraPwaOptions } from "./config";

describe("PWA configuration", () => {
  it("keeps the install manifest aligned with the public app contract", () => {
    expect(surasuraPwaManifest).toMatchObject({
      name: "すらすら六法",
      short_name: "すら六",
      start_url: "/",
      scope: "/",
      display: "standalone",
      lang: "ja",
      theme_color: "#166534",
      background_color: "#fcfbf8",
    });
    expect(surasuraPwaManifest.icons).toEqual([
      {
        src: "/pwa.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any maskable",
      },
    ]);
  });

  it("pre-caches the app shell and static assets with a navigation fallback", () => {
    expect(surasuraPwaOptions.registerType).toBe("prompt");
    expect(surasuraPwaOptions.injectRegister).toBe(false);
    expect(surasuraPwaOptions.workbox).toMatchObject({
      navigateFallback: "/index.html",
      cleanupOutdatedCaches: true,
      clientsClaim: true,
      skipWaiting: false,
    });
    expect(surasuraPwaOptions.workbox.globPatterns).toEqual([
      "**/*.{js,css,html,ico,png,svg,webmanifest}",
    ]);
  });
});
