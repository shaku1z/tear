import { describe, expect, it } from "vitest";

import { CONFIG } from "../../src/config/game-config";
import { BOSS_IDENTITY_IDS } from "../../src/gameplay/run/boss-definitions";
import { planBossPlacement } from "../../src/gameplay/run/boss-placement";

describe("boss placement", () => {
  it("places every boss where the shipped game always has", () => {
    // Spawn placement is canonical world state: these values are pinned so a
    // definition edit cannot move a boss without this test saying so.
    expect(
      Object.fromEntries(BOSS_IDENTITY_IDS.map((id) => [id, planBossPlacement(id, CONFIG.view.w, CONFIG, 200)])),
    ).toEqual({
      warden: { factoryId: "warden", x: 800, y: 660 },
      colossus: { factoryId: "colossus", x: 800, y: 725 },
      aldric: { factoryId: "aldric", x: 800, y: 734 },
      rootbound: { factoryId: "rootbound", x: 800, y: 741 },
      "white-hart": { factoryId: "white-hart", x: 800, y: 748 },
      echo: { factoryId: "echo", x: 800, y: 775 },
      source: { factoryId: "source", x: 800, y: 500 },
      "rootbound-rebuild": { factoryId: "rootbound-rebuild", x: 800, y: 741 },
    });
  });

  it("enters a boss with a start gap at least that far from the player, on the side with more room", () => {
    const x = (playerX: number) => planBossPlacement("rootbound-rebuild", CONFIG.view.w, CONFIG, playerX).x;
    expect([x(800), x(900), x(300), x(440), x(1160)]).toEqual([440, 540, 660, 800, 800]);
    for (const playerX of [0, 120, 500, 799, 801, 1100, 1600]) expect(Math.abs(x(playerX) - playerX)).toBeGreaterThanOrEqual(360);
    // A boss without a gap enters at the centre wherever the player stands.
    expect(planBossPlacement("aldric", CONFIG.view.w, CONFIG, 800).x).toBe(800);
  });

  it("refuses an id that is not a boss instead of building a stand-in", () => {
    expect(() => planBossPlacement("", CONFIG.view.w, CONFIG, 800)).toThrow(RangeError);
    expect(() => planBossPlacement("boss", CONFIG.view.w, CONFIG, 800)).toThrow(RangeError);
  });
});
