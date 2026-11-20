import { describe, expect, it } from "vitest";
import { PlaygroundController } from "../../src/gameplay/training/playground-controller";
import {
  createPlaygroundRuntimeBridge,
  type PlaygroundRuntimeDependencies,
  type PlaygroundRuntimeEnemy,
} from "../../src/gameplay/training/runtime-bridge";

function bridge(spawned?: PlaygroundRuntimeEnemy) {
  const opened: string[] = [];
  const screens: string[] = [];
  const announced: { text: string; at?: Readonly<{ x: number; y: number }> }[] = [];
  const dependencies: PlaygroundRuntimeDependencies = {
    controller: new PlaygroundController(),
    difficulties: [],
    stageNames: [],
    groundY: 800,
    viewportWidth: 1600,
    viewportHeight: 900,
    pressed: new Set(),
    player: { x: 800, y: 700, facing: 1, hp: 100, maxHp: 100, oneHit: false },
    run: {
      diff: "normal",
      diffDmg: 1,
      diffHp: 1,
      diffCount: 1,
      coinMod: 1,
      scoreMod: 1,
      curBoss: null,
    },
    enemies: [],
    scalePlayerDamage: () => undefined,
    clearProjectiles: () => undefined,
    spawn: () => spawned,
    announce: (text, at) => {
      announced.push(at ? { text, at } : { text });
    },
    navigate: (screen) => {
      screens.push(screen);
    },
    releasePointer: () => undefined,
    requestPointer: () => undefined,
    selectArena: () => undefined,
    wipe: () => undefined,
    resetRun: () => undefined,
    applyUpgrade: () => undefined,
    tierUp: () => undefined,
    actions: {
      selectWeapon: () => undefined,
      restartWithWeapon: () => undefined,
      resetAtDifficulty: () => undefined,
      openAbilities: () => {
        opened.push("abilities");
      },
      clearLabScroll: () => undefined,
      lookupUpgrade: () => null,
      playUi: () => undefined,
      playRankUp: () => undefined,
    },
  };
  return { runtime: createPlaygroundRuntimeBridge(dependencies), opened, screens, announced };
}

describe("Playground runtime bridge", () => {
  it("opens the ABILITIES tab only through the tab the menu offers", () => {
    const offered = bridge();
    offered.runtime.dispatchAction("tab:abilities");
    expect(offered.opened).toEqual(["abilities"]);
    expect(offered.runtime.tab).toBe("abilities");

    // "lab" was the old way in; no menu choice, key or screen produces it any more.
    const unoffered = bridge();
    unoffered.runtime.dispatchAction("lab");
    expect(unoffered.opened).toEqual([]);
    expect(unoffered.runtime.tab).not.toBe("abilities");
    expect(unoffered.screens).toEqual([]);
  });

  it("names a spawned enemy above its head, and anything else at the player", () => {
    const enemy: PlaygroundRuntimeEnemy = { dead: false, x: 1200, y: 760, hh: 40, stun: 0, hp: 10, maxHp: 10 };
    const playground = bridge(enemy);
    playground.runtime.execute([
      { type: "spawn", kind: "grunt", count: 1, hpScale: 1 },
      { type: "announce", text: "GRUNT" },
      { type: "heal-player" },
      { type: "announce", text: "HEALED" },
    ]);
    expect(playground.announced).toEqual([{ text: "GRUNT", at: { x: 1200, y: 720 } }, { text: "HEALED" }]);
  });
});
