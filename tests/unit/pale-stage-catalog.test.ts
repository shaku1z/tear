import { describe, expect, it } from "vitest";

import { CAMPAIGN_STAGE_IDS, STAGES } from "../../src/gameplay/stages";

describe("Pale stage catalog", () => {
  it("owns the chapter V identity, palette, pool, horizontal layout, and authored order", () => {
    const stage = STAGES.find((candidate) => candidate.id === "pale-traverse");
    expect(stage).toMatchObject({
      id: "pale-traverse", name: "The Pale Traverse", blurb: "Where every road returns.",
      musicId: "pale-traverse", boss: "white-hart",
      chapter: { number: "V", title: "THE ROAD THAT RETURNED", transition: "aurora" },
      chapterArt: { composition: "left", wash: "light" },
      bg: "#dfe8f7", plat: "#1f3557", accent: "#ef8da8",
      pool: [["rimehound", 0.85, 1], ["ranged", 0.75, 1], ["charger", 0.65, 1], ["flyer", 0.60, 1], ["armored", 0.55, 1],
        ["bomber", 0.40, 2], ["wraith", 0.35, 3], ["anchor", 0.22, 4], ["chimera", 0.30, 6]],
      layout: [
        { x: 140, y: 640, w: 400, h: 24, oneway: true }, { x: 1060, y: 640, w: 400, h: 24, oneway: true },
        { x: 560, y: 510, w: 480, h: 24, oneway: true }, { x: 190, y: 350, w: 300, h: 24, oneway: true },
        { x: 1110, y: 350, w: 300, h: 24, oneway: true }, { x: 700, y: 255, w: 200, h: 24, oneway: true },
      ],
    });
    expect(CAMPAIGN_STAGE_IDS).toEqual([
      "grounds", "undercroft", "crimson-fields", "verdant-sanctum", "pale-traverse", "voidspire", "tear",
    ]);
    expect(STAGES.map((entry) => entry.chapter.number)).toEqual(["I", "II", "III", "IV", "V", "VI", "VII"]);
  });
});
