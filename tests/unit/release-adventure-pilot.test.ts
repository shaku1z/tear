// The release Adventure journey's scripted player against the real charger, on chapter I's real
// platforms, with no browser and no randomness: main run 44688612321 timed out with one charger
// left, perched on a platform higher than a jump while the player stood under it.
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { CONFIG } from "../../src/config/game-config";
import type { EnemyPlatform } from "../../src/gameplay/entities/enemy-contracts";
import { CAMPAIGN_STAGE_IDS, stageDefinition } from "../../src/gameplay/stages";
import { createEnemyHarness, createStandardActor, type BehaviorActor } from "./enemy-test-harness";

type Pos = Readonly<{ x: number; y: number }>;
/** tests/release-adventure-pilot.js, the CommonJS module the browser journey loads. */
interface Pilot {
  readonly JUMP_REACH_WORLD: number;
  readonly STEP_OUT_WORLD: number;
  chooseMove(player: Pos, target: Pos, scale: number): { walk: number; jump: boolean };
}
const pilot = createRequire(import.meta.url)("../release-adventure-pilot.js") as Pilot;

/** The journey's view is 1280 px wide; the world is 1600 units. */
const SCALE = 1280 / CONFIG.view.w;
const STEP = 1 / 120;
const chapterOne = stageDefinition(CAMPAIGN_STAGE_IDS[0] ?? "grounds");
const platformAbove = (y: number) => {
  const platform = chapterOne.layout.find((entry) => entry.y === y);
  if (platform === undefined) throw new Error(`chapter I has no platform at y ${String(y)}`);
  return platform;
};

/** A charger standing on `platform`, and a grounded player under the platform's middle. */
function perched(platform: Readonly<{ x: number; y: number; w: number }>) {
  const { types, platforms } = createEnemyHarness([0.5, 0.3, 0.8]);
  const world: EnemyPlatform[] = [
    ...platforms.filter((platform) => platform.floor === true),
    ...chapterOne.layout.map((entry, index) => ({ id: `grounds:${String(index)}`, ...entry })),
  ];
  const player = createEnemyHarness().player;
  Object.assign(player, { hh: CONFIG.player.h / 2, y: CONFIG.world.groundY - CONFIG.player.h / 2 });
  player.x = platform.x + platform.w / 2;
  const charger: BehaviorActor = createStandardActor("charger", types);
  Object.assign(charger, { x: player.x, y: platform.y - charger.hh, vx: 0, vy: 0, onGround: true });
  return { world, player, charger };
}

/**
 * Plays `seconds` with the player walking as `decide` says (on the floor, at full run speed) and
 * returns the charger's height above the floor at the end. The player's jump is left out: from the
 * floor it reaches neither of the platforms these cases use.
 */
function play(setup: ReturnType<typeof perched>, seconds: number, decide: (player: Pos, target: Pos) => number) {
  const { world, player, charger } = setup;
  const screen = (point: Pos) => ({ x: point.x * SCALE, y: point.y * SCALE });
  for (let tick = 0; tick < seconds / STEP; tick += 1) {
    const walk = decide(screen(player), screen(charger));
    player.x = Math.min(
      CONFIG.view.w - player.hw,
      Math.max(player.hw, player.x + walk * CONFIG.player.moveSpeed * STEP),
    );
    charger.update(STEP, world, player, []);
  }
  return CONFIG.world.groundY - (charger.y + charger.hh);
}

describe("release Adventure pilot", () => {
  it("uses the game's jump height", () => {
    expect(pilot.JUMP_REACH_WORLD).toBe(CONFIG.player.jumpSpeed ** 2 / (2 * CONFIG.world.gravity));
    // Chapter I's middle and top platforms are out of a jump's reach; the low ones are not.
    const heights = chapterOne.layout.map((platform) => CONFIG.world.groundY - platform.y);
    expect(heights.filter((height) => height > pilot.JUMP_REACH_WORLD).sort()).toEqual([300, 440, 440]);
    expect(pilot.STEP_OUT_WORLD).toBeGreaterThan(Math.max(...chapterOne.layout.map((platform) => platform.w)) / 2);
  });

  for (const y of [500, 360]) {
    it(`a charger on the platform at y ${String(y)} stays over a player who stands under it`, () => {
      const setup = perched(platformAbove(y));
      expect(play(setup, 30, () => 0)).toBe(CONFIG.world.groundY - y);
    });

    it(`the pilot steps out from under a charger on the platform at y ${String(y)} and it comes down`, () => {
      const setup = perched(platformAbove(y));
      const height = play(setup, 6, (player, target) => pilot.chooseMove(player, target, SCALE).walk);
      expect(height).toBe(0);
      expect(Math.abs(setup.charger.x - setup.player.x)).toBeLessThan(CONFIG.enemy.chargeRange);
    });
  }

  it("still walks to a target on its own level and jumps toward one a jump above", () => {
    const player = { x: 400, y: 600 };
    expect(pilot.chooseMove(player, { x: 700, y: 600 }, SCALE)).toEqual({ walk: 1, jump: false });
    expect(pilot.chooseMove(player, { x: 300, y: 600 }, SCALE)).toEqual({ walk: 0, jump: false });
    expect(pilot.chooseMove(player, { x: 420, y: 600 - 145 * SCALE }, SCALE)).toEqual({ walk: 0, jump: true });
  });
});
