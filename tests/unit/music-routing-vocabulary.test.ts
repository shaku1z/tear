import { describe, expect, it } from "vitest";
import routing from "../../public/audio/music-routing.json";
import { STAGES } from "../../src/gameplay/stages";

function biomeId(musicId: string): string {
  return `the-${musicId}`;
}

describe("music routing vocabulary parity", () => {
  it("never names a campaign biome or boss absent from the authored stage definitions", () => {
    const biomes = new Set(STAGES.map((stage) => biomeId(stage.musicId)));
    const bosses = new Set<string>(STAGES.map((stage) => stage.boss));
    for (const rule of routing.rules) {
      if (rule.match.biome) expect(biomes.has(rule.match.biome)).toBe(true);
      if (rule.match.bossId) expect(bosses.has(rule.match.bossId)).toBe(true);
    }
  });

  it("keeps campaign biome/boss pairing available for route validation", () => {
    expect(STAGES.map((stage) => [biomeId(stage.musicId), stage.boss])).toEqual([
      ["the-grounds", "warden"],
      ["the-undercroft", "colossus"],
      ["the-crimson-fields", "aldric"],
      ["the-voidspire", "echo"],
      ["the-tear", "source"],
    ]);
  });
});
