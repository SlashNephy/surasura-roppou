import { describe, expect, it } from "vitest";

import { surasuraPwaManifest } from "@/core/pwa/config";

import manifestText from "../../public/manifest.webmanifest?raw";

const manifest = JSON.parse(manifestText) as {
  name?: string;
  start_url?: string;
  display?: string;
};

describe("PWA manifest", () => {
  it("uses the agreed app name and route start URL", () => {
    expect(manifest).toEqual(surasuraPwaManifest);
  });
});
