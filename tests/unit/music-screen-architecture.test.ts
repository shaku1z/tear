// The MUSIC screen's one layout rule: every page is a list of scroll blocks, and the chrome (rail,
// header, transport, footer) and the choice between desktop and phone live only in the frame,
// `screens/music/index.ts`. A new page is one more blocks function, never a second layout.
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const DIRECTORY = "src/presentation/screens/music";
const FRAME = "index.ts";
const pages = readdirSync(DIRECTORY).filter((file) => file.endsWith(".ts") && file !== FRAME);
const source = (file: string): string => readFileSync(`${DIRECTORY}/${file}`, "utf8");

/** What only the frame may do: read the density, lay out the page and its footer, open the scroll page. */
const FRAME_ONLY: readonly (readonly [string, RegExp])[] = [
  ["read the density", /\bdensity\b\s*\./u],
  ["lay out the page", /\bpageLayout\s*\(/u],
  ["draw the footer", /\bpageFooter\s*\(/u],
  ["open the scroll page", /\bcreateCompactPage\s*\(/u],
  ["draw the header", /\.header\s*\(/u],
  ["place the transport", /\bdrawTransport\s*\(/u],
];

describe("the MUSIC screen is one frame over pages of blocks", () => {
  it("has page files besides the frame", () => {
    expect(pages.length).toBeGreaterThan(0);
    expect(source(FRAME)).toContain("Music pages are pageBlocks only");
  });

  it.each(pages)("%s draws no chrome and does not branch on density", (file) => {
    // The transport file defines the transport; only the frame places it.
    const text = source(file).replace(/export function drawTransport\s*\(/u, "");
    const broken = FRAME_ONLY.filter(([, pattern]) => pattern.test(text)).map(([what]) => what);
    expect(broken).toEqual([]);
    // Page files take only the scroll block types from the scroll page, never its layout.
    for (const line of text.split(/\r?\n/u).filter((entry) => entry.includes('from "../compact-page"')))
      expect(line).toMatch(/^import type /u);
  });

  it("chooses every page in one place: the frame's pageBlocks", () => {
    const frame = source(FRAME);
    for (const blocks of ["homeBlocks", "radioBlocks", "collectionBlocks", "settingsBlocks"])
      expect(frame).toMatch(new RegExp(`return ${blocks}\\(`, "u"));
  });
});
