import { describe, expect, it } from "vitest";

import { CAMPAIGN_STAGE_IDS, STAGES } from "../../src/gameplay/stages";

describe("Verdant stage catalog", () => {
  it("owns the locked chapter IV identity, palette, pool, and layout", () => {
    const stage = STAGES.find((candidate) => candidate.id === "verdant-sanctum");

    expect(stage).toEqual({
      id: "verdant-sanctum",
      name: "The Verdant Sanctum",
      blurb: "Where nothing is allowed to die.",
      musicId: "verdant-sanctum",
      boss: "rootbound",
      chapter: {
        number: "IV",
        title: "THE MERCY THAT WOULD NOT END",
        symbol: "✣",
        intro: "MERCY TOOK ROOT AND FORGOT TO LET GO.",
        transition: "bloom",
        pages: [
          {
            label: "THE SANCTUARY",
            text: "After the Fields burned, the wounded were carried here. The tree healed flesh first, then memory, then whatever remained.",
          },
          {
            label: "THE PRESERVATION",
            text: "The keeper refused the final loss. One by one, the sanctuary joined the roots until mercy and captivity became the same command.",
          },
        ],
        bossOutro: {
          label: "THE NAMEPLATES",
          text: "Healers. Soldiers. Children. Every name marks the day they entered the garden. None records the day they left. At the center: ‘I kept every promise except the one that mattered. I did not let them go.’",
        },
      },
      chapterArt: { composition: "right", wash: "light" },
      bg: "#dff2d6",
      plat: "#234a36",
      accent: "#e4c95a",
      pool: [
        ["flyer", 0.75, 1],
        ["ranged", 0.70, 1],
        ["charger", 0.55, 1],
        ["rootbinder", 0.50, 2],
        ["mender", 0.32, 3],
        ["anchor", 0.28, 4],
        ["armored", 0.35, 4],
        ["chimera", 0.25, 6],
      ],
      layout: [
        { x: 150, y: 645, w: 330, h: 24, oneway: true },
        { x: 1120, y: 645, w: 330, h: 24, oneway: true },
        { x: 350, y: 485, w: 280, h: 24, oneway: true },
        { x: 970, y: 485, w: 280, h: 24, oneway: true },
        { x: 655, y: 335, w: 290, h: 24, oneway: true },
        { x: 1030, y: 250, w: 180, h: 24, oneway: true },
      ],
    });
    expect(CAMPAIGN_STAGE_IDS).toEqual([
      "grounds", "undercroft", "crimson-fields", "verdant-sanctum", "voidspire", "tear",
    ]);
    expect(STAGES.map((entry) => entry.chapter.number)).toEqual(["I", "II", "III", "IV", "V", "VI"]);
  });
});
