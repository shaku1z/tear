import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BUILD_TARGET_NAMES } from "../../scripts/build-targets.mjs";
import { CREDIT_GROUPS, creditsFor } from "../../src/platform/credits";

const root = join(__dirname, "..", "..");
const fonts = join(root, "public", "fonts");
const allCredits = CREDIT_GROUPS.flatMap((group) => group.credits);
const fontCredits = CREDIT_GROUPS.find((group) => group.label === "FONTS")?.credits ?? [];
const idsFor = (target: Parameters<typeof creditsFor>[0]): string[] =>
  creditsFor(target).flatMap((group) => group.credits.map((credit) => credit.id));

describe("credits table", () => {
  it("has one entry per work, with every field the licence asks the game to show", () => {
    expect(new Set(allCredits.map((credit) => credit.id)).size).toBe(allCredits.length);
    for (const credit of allCredits) {
      expect(credit.name).not.toBe("");
      expect(credit.use).not.toBe("");
      expect(credit.notice).toMatch(/^©/u);
      expect(credit.licence).not.toBe("");
    }
  });

  it("credits every font file the game ships, so a new font fails here until it is listed", () => {
    const families = readdirSync(fonts)
      .filter((file) => file.endsWith(".woff2"))
      .map((file) => file.split("-")[0]);
    expect(families.length).toBeGreaterThan(0);
    const credited = new Set(fontCredits.map((credit) => credit.name.replaceAll(" ", "")));
    for (const family of families) expect(credited).toContain(family);
  });

  it("matches the font licence file the game ships: its text exists and names each holder", () => {
    const licence = readFileSync(join(fonts, "OFL.txt"), "utf8");
    expect(fontCredits.length).toBeGreaterThan(0);
    for (const credit of fontCredits) {
      expect(credit.licenceFile).not.toBeNull();
      expect(existsSync(join(root, "public", credit.licenceFile ?? ""))).toBe(true);
      expect(licence).toContain(credit.name);
      // "© 2017 The Barlow Project Authors" -> "The Barlow Project Authors"; "© 2017 IBM Corp." -> "IBM Corp."
      expect(licence).toContain(credit.notice.replace(/^© \d{4} /u, ""));
    }
  });

  it("lists each build's own works: libraries only the standalone build contains stay out of the portal builds", () => {
    expect([...BUILD_TARGET_NAMES].sort()).toEqual(["crazygames", "itch", "standalone"]);
    expect(idsFor("standalone")).toEqual(["barlow-condensed", "ibm-plex-mono", "vite", "workbox", "firebase"]);
    for (const target of ["crazygames", "itch"] as const)
      expect(idsFor(target)).toEqual(["barlow-condensed", "ibm-plex-mono", "vite"]);
  });

  it("never returns a group with nothing in it", () => {
    for (const target of BUILD_TARGET_NAMES)
      for (const group of creditsFor(target)) expect(group.credits.length).toBeGreaterThan(0);
  });
});
