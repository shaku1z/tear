import { describe, expect, it } from "vitest";
import { PlaygroundController } from "../../src/gameplay/training/playground-controller";
import {
  createPlaygroundRuntimeBridge,
  type PlaygroundRuntimeDependencies,
} from "../../src/gameplay/training/runtime-bridge";

function bridge() {
  const opened: string[] = [];
  const screens: string[] = [];
  const dependencies: PlaygroundRuntimeDependencies = {
    controller: new PlaygroundController(),
    difficulties: [],
    colors: {},
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
    spawn: () => undefined,
    announce: () => undefined,
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
  return { runtime: createPlaygroundRuntimeBridge(dependencies), opened, screens };
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
});
