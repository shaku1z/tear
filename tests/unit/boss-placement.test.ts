import { describe, expect, it } from "vitest";

import { CONFIG } from "../../src/config/game-config";
import { BOSS_IDENTITY_IDS } from "../../src/gameplay/run/boss-definitions";
import { planBossPlacement } from "../../src/gameplay/run/boss-placement";

describe("boss placement", () => {
  it("places every boss where the shipped game always has", () => {
    // Spawn placement is canonical world state: these values are pinned so a
    // definition edit cannot move a boss without this test saying so.
    expect(
      Object.fromEntries(BOSS_IDENTITY_IDS.map((id) => [id, planBossPlacement(id, CONFIG.view.w, CONFIG)])),
    ).toEqual({
      warden: { factoryId: "warden", x: 800, y: 660 },
      colossus: { factoryId: "colossus", x: 800, y: 725 },
      aldric: { factoryId: "aldric", x: 800, y: 734 },
      rootbound: { factoryId: "rootbound", x: 800, y: 741 },
      "white-hart": { factoryId: "white-hart", x: 800, y: 748 },
      echo: { factoryId: "echo", x: 800, y: 775 },
      source: { factoryId: "source", x: 800, y: 500 },
    });
  });

  it("refuses an id that is not a boss instead of building a stand-in", () => {
    expect(() => planBossPlacement("", CONFIG.view.w, CONFIG)).toThrow(RangeError);
    expect(() => planBossPlacement("boss", CONFIG.view.w, CONFIG)).toThrow(RangeError);
  });
});
