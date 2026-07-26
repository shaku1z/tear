import { describe, expect, it } from "vitest";
import { MUSIC_CONTEXT_SCHEMA_VERSION, type MusicContextSnapshot } from "../../src/audio/music-contracts";
import { tierFromSnapshot } from "../../src/audio/stems/tier-from-snapshot";

function snapshot(scene: MusicContextSnapshot["scene"], biomeId: string): MusicContextSnapshot {
  return {
    schemaVersion: MUSIC_CONTEXT_SCHEMA_VERSION, sequence: 1, timeMs: 0, scene,
    modeId: "endless", difficultyId: "normal", biomeId, stageId: "0", wave: 1, totalWaves: 5,
    bossActive: false, bossId: null, bossPhase: null, playerHealthRatio: 1,
    comboRankId: "", playerMoving: false,
  };
}

describe("music tier routing", () => {
  it("plays the full arrangement only in the real shell", () => {
    expect(tierFromSnapshot(snapshot("main-menu", "menu"))).toBe(4);
    expect(tierFromSnapshot(snapshot("main-menu", "ruins"))).toBe(0);
  });
});
