/**
 * Who each overlay is for (src/app/world/overlay-audience.ts). A replay is watched, so it draws only what
 * happened in the run; the alarms and aids for the person playing (the red low-health screen first among
 * them) never reach it. The owner saw the low-health screen in a replay, squeezed into the replay's frame.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { CONFIG } from "../../src/config/game-config";
import { OVERLAY_LAYERS, shownTo, type OverlayViewer } from "../../src/app/world/overlay-audience";
import {
  createWorldIndicators,
  type WorldIndicatorState,
  type WorldIndicators,
} from "../../src/app/world/world-indicators";
import type { WorldRendererRegistry } from "../../src/presentation/world";

const lowHealthWorld: WorldIndicatorState = {
  run: () =>
    ({
      mode: "endless",
      wave: 3,
      score: 120,
      runTime: 12,
      mult: 1,
      comboTimer: 0,
      spawnQueue: [],
      mods: { owned: {} },
      bossOrder: [],
    }) as unknown as ReturnType<WorldIndicatorState["run"]>,
  player: () =>
    ({ hp: 10, maxHp: 100, dashCd: 0, shield: 0, maxShield: 0, x: 400, y: 600, vy: 0, onGround: true }) as never,
  blade: () => undefined,
  enemies: () => [],
  bossIntro: () => null,
  bannerSeconds: () => 1,
  stage: () => ({ index: 0, current: { name: "VERDANT" }, name: "VERDANT", bannerSeconds: 1 }),
  hud: () => ({ lagHp: 0.1, multiplier: 1, multiplierPop: 0 }),
  hudClockSeconds: () => 3,
  deltaSeconds: () => 1 / 60,
};

const enemy = { x: 300, y: 400, hw: 20, hh: 30, bleedStacks: 2, burnT: 1, markT: 1 } as never;

/** Draws every indicator once for `viewer` and returns the world renderers each one reached. */
function drawn(viewer: OverlayViewer): readonly string[] {
  const calls: string[] = [];
  const world = new Proxy({} as WorldRendererRegistry, {
    get: (_target, name) => () => {
      calls.push(String(name));
    },
  });
  const indicators = createWorldIndicators(
    world,
    lowHealthWorld,
    {
      config: CONFIG,
      upgrades: [],
      flashScale: () => 1,
      fallbackAccent: () => "#13c4d6",
      ink: () => "#000",
      formatTime: (seconds) => seconds.toFixed(0),
      trickColor: () => "#fff",
      ease: (amount) => amount,
    },
    viewer,
  );
  for (const layer of Object.keys(indicators) as (keyof WorldIndicators)[])
    if (layer === "enemyStatus") indicators.enemyStatus(enemy);
    else indicators[layer]();
  return calls;
}

describe("who each overlay is for", () => {
  it("never draws the red low-health screen for someone watching a replay; the player sees it under the HUD", () => {
    expect(drawn("watcher")).not.toContain("lowHealthScreen");
    expect(drawn("watcher")).toContain("hud");
    const player = drawn("player");
    expect(player).toContain("lowHealthScreen");
  });

  it("draws for a watcher exactly the indicators the table gives to everyone", () => {
    const watcher = drawn("watcher"),
      player = drawn("player");
    for (const layer of player) {
      expect(OVERLAY_LAYERS).toHaveProperty(layer);
      expect(watcher.includes(layer)).toBe(shownTo(layer as keyof typeof OVERLAY_LAYERS, "watcher"));
    }
  });

  it("builds every replay's indicators for a watcher and live play's for the player", () => {
    const callers = execFileSync("git", ["grep", "-l", "createWorldIndicators(", "--", "src"], { encoding: "utf8" })
      .split("\n")
      .filter((file) => file !== "" && file !== "src/app/world/world-indicators.ts");
    expect(callers.length).toBeGreaterThan(0);
    for (const file of callers) {
      const source = readFileSync(file, "utf8");
      const viewer = file.startsWith("src/app/replay/") ? '"watcher"' : '"player"';
      expect(source, `${file} builds its indicators for ${viewer}`).toContain(viewer);
    }
  });
});
