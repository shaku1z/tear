import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BUILD_TARGETS } from "../../scripts/build-targets.mjs";
import { FIREBASE_APP_CHECK_SITE_KEY } from "../../src/platform/firebase-config";
import { OWN_PRIVACY_PAGE } from "../../src/platform/privacy-stance";

const page = readFileSync(join(__dirname, "..", "..", "public", `${OWN_PRIVACY_PAGE.slice(1)}.html`), "utf8");

describe("the privacy page the standalone build links to", () => {
  it("is a file the link resolves to", () => {
    expect(page).toContain("<title>Privacy - TEAR: BLADE</title>");
  });

  it.each([
    "What the game collects",
    "Why, and the legal basis",
    "Who receives the data",
    "How long it is kept",
    "Your rights",
    "Children",
    "Effective 19 November 2026",
  ])("covers %s", (heading) => {
    expect(page).toContain(heading);
  });

  it("names every service the build sends data to, and the anonymous-statistics switch", () => {
    for (const phrase of ["Firebase", "Cloudflare", "United States", "Share anonymous run statistics", "under 13"])
      expect(page).toContain(phrase);
  });

  it("names reCAPTCHA exactly when App Check has a site key, so the page lists it while the build loads it", () => {
    expect(page.includes("reCAPTCHA")).toBe(FIREBASE_APP_CHECK_SITE_KEY.length > 0);
  });

  it("names the developer only by the public repository, with no email address or personal name", () => {
    expect(page).not.toMatch(/mailto:|[\w.+-]+@[\w-]+\.[\w.]+/u);
    expect(page).toContain("https://github.com/shaku1z/tear/issues");
  });

  it("loads nothing from another site", () => {
    expect(page).not.toMatch(/<(?:script|link|img|iframe)\b[^>]*(?:src|href)="https?:/u);
  });

  it("ships with the standalone build only, which the stance and the build table both say", () => {
    expect(BUILD_TARGETS.standalone.staticPages).toEqual([OWN_PRIVACY_PAGE.slice(1)]);
    expect(BUILD_TARGETS.crazygames.staticPages).toEqual([]);
    expect(BUILD_TARGETS.itch.staticPages).toEqual([]);
  });
});
