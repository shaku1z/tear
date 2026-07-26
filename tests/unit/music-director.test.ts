import { describe, expect, it, vi } from "vitest";

import { MusicDirector, resolveMusicBossPhase, resolveMusicScene, type MusicContextObservation } from "../../src/audio/music-director";

function observation(timeMs: number, overrides: Partial<MusicContextObservation> = {}): MusicContextObservation {
  return {
    timeMs,
    scene: "combat",
    modeId: "endless",
    difficultyId: "normal",
    biomeId: "ruins",
    stageId: "0",
    wave: 1,
    totalWaves: 0,
    bossActive: false,
    bossId: null,
    bossPhase: null,
    playerHealthRatio: 1,
    comboRankId: "",
    playerMoving: false,
    ...overrides,
  };
}

describe("MusicDirector", () => {
  it("bounds routine snapshots to 8 Hz while sending semantic changes immediately", () => {
    const port = {
      beginMusicRun: vi.fn(), updateMusicContext: vi.fn(), emitMusicEvent: vi.fn(), endMusicRun: vi.fn(),
    };
    const director = new MusicDirector(port);
    director.begin({ runId: "run-1", runSeed: "1", rulesetVersion: "rules", gameVersion: "game", scoreVersion: "score" });
    director.update(observation(0));
    director.update(observation(50));
    director.update(observation(124));
    director.update(observation(125));
    director.update(observation(126, { comboRankId: "NICE" }));

    expect(port.updateMusicContext).toHaveBeenCalledTimes(3);
    expect(port.emitMusicEvent).toHaveBeenCalledWith(expect.objectContaining({ type: "combo-rank-changed", rankId: "NICE", timeMs: 126 }));
  });

  it("keeps an in-run settings observation alive and ends only at the real shell", () => {
    const port = {
      beginMusicRun: vi.fn(), updateMusicContext: vi.fn(), emitMusicEvent: vi.fn(), endMusicRun: vi.fn(),
    };
    const director = new MusicDirector(port);
    director.begin({ runId: "run-1", runSeed: "1", rulesetVersion: "rules", gameVersion: "game", scoreVersion: "score" });
    director.update(observation(10, { scene: "main-menu" }));
    expect(director.active).toBe(true);
    expect(port.endMusicRun).not.toHaveBeenCalled();

    director.update(observation(20, { scene: "combat" }));
    expect(port.updateMusicContext).toHaveBeenCalledWith(expect.objectContaining({ scene: "combat", biomeId: "ruins" }));

    director.update(observation(30, { scene: "main-menu", biomeId: "menu" }));
    director.end();
    expect(port.endMusicRun).toHaveBeenCalledTimes(1);
  });
});

describe("music observation rules", () => {
  it("maps screens and boss health to stable scenes and phases", () => {
    expect(resolveMusicScene("paused", false)).toBe("paused");
    expect(resolveMusicScene("playing", true)).toBe("boss");
    expect(resolveMusicBossPhase(24, 100, [0.75, 0.5, 0.25])).toBe(4);
  });
});
