import { describe, expect, it } from "vitest";
import { buildHudSnapshot } from "../../src/presentation/world/hud-snapshot";

describe("HUD snapshot", () => {
  it("projects lag, pop, loadout and boss phase state without drawing", () => {
    const boss = { hp: 50, maxHp: 100, _phaseFlashT: 0.5 };
    const result = buildHudSnapshot({ player: { hp: 50, maxHp: 100, dashCd: 0, shield: 0, maxShield: 0 },
      run: { mode: "endless", wave: 2, score: 40, runTime: 12, mult: 2, comboTimer: 1, spawnQueue: [1], owned: { cut: 2 } },
      boss, upgrades: [{ id: "cut", name: "CUT" }], enemyCount: 3, previousLagHp: 1, previousMultiplier: 1,
      multiplierPop: 0, nowMilliseconds: 0, flashScale: 1, deltaSeconds: 0.1, stageAccent: "#abc", fallbackAccent: "#def",
      bossColor: "#f00", dashCooldown: 1, dashColor: "#0ff", shieldColor: "#00f", trickDecay: 2,
      formatTime: String, trickColor: () => "#fff", ease: (value) => value });
    expect(result.snapshot.player.abilities).toEqual(["CUT ×2"]);
    expect(result.snapshot.run.remaining).toBe(4);
    expect(result.snapshot.boss?.hpFraction).toBe(0.5);
    expect(result.bossPhaseFlashTime).toBe(0.4);
  });
});
