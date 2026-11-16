/**
 * How much each boss moves and how often it lands hits, on one harness, so a boss rebuild can be judged
 * against the others. Each boss fights a player who keeps walking across the arena and jumps every four
 * seconds, for 60 s per phase, in its real arena; the biome bosses run inside their environment, so
 * stage objects that deal damage count. The player has the game's invulnerability after each hit.
 *
 * BOSS_PRESSURE_RECORD is what the bosses do today. A change to a boss changes its row: update the row
 * in that pull request and say why. The Rootbound rebuild is meant to raise its row toward Aldric and the
 * White Hart. Not counted: boss projectiles in flight (no collision here) and body contact.
 * TEAR_BOSS_PRESSURE_REPORT=1 prints the measured table.
 */
import { describe, expect, it } from "vitest";

import { CONFIG } from "../../src/config/game-config";
import type { EnemyProjectile } from "../../src/gameplay/entities/enemy-contracts";
import { bindLiveRootboundActors } from "../../src/gameplay/environment/biome-actors/rootbound-actors";
import { bindLiveWhiteHartActors } from "../../src/gameplay/environment/biome-actors/white-hart-actors";
import { createEnvironmentRuntime } from "../../src/gameplay/environment/environment-runtime";
import { bossPhaseMarks } from "../../src/gameplay/run/boss-definitions";
import { createBossArena } from "../../src/gameplay/training/arena-rules";
import { createEnemyHarness, createTestPlayer, type BehaviorActor } from "./enemy-test-harness";

const DT = 1 / 120;
const SECONDS = 60;
const BOSSES = ["warden", "colossus", "aldric", "white-hart", "rootbound"] as const;
type BossId = (typeof BOSSES)[number];
type Boss = BehaviorActor & { introT: number; cinematicRequest: unknown; cinematicT: number };

/** Per phase I / II / III: pixels moved per second, hits landed, damage dealt. */
type PhaseRow = readonly [travelPerSecond: number, hits: number, damage: number];
type Measured = readonly [PhaseRow, PhaseRow, PhaseRow];

function measure(id: BossId, phase: 1 | 2 | 3): PhaseRow {
  const harness = createEnemyHarness([0.25, 0.75, 0.4, 0.6, 0.1, 0.9]);
  const types = {
    warden: harness.types.Warden,
    colossus: harness.types.Colossus,
    aldric: harness.types.Aldric,
    "white-hart": harness.types.WhiteHart,
    rootbound: harness.types.Rootbound,
  } as const;
  const boss = new types[id](CONFIG.view.w / 2, CONFIG.world.groundY - CONFIG.boss.h / 2) as unknown as Boss;
  let iframe = 0;
  const player = Object.assign(createTestPlayer({ x: 300 }), { hazardDmgMult: 1, invulnerable: false });
  const record = player.takeDamage.bind(player);
  player.takeDamage = (amount, sourceX, source) => {
    if (iframe > 0) return;
    iframe = CONFIG.player.hitIframe;
    record(amount, sourceX, source);
  };
  const platforms = createBossArena(id, CONFIG.view.w, CONFIG.view.h, CONFIG.world.groundY, 0.5) ?? harness.platforms;
  const projectiles: EnemyProjectile[] = [];
  const marks = bossPhaseMarks(id);
  boss.introT = 0;
  if (phase > 1) boss.hp = boss.maxHp * ((phase === 2 ? marks[0] : marks[1]) - 0.05);
  const environment = createEnvironmentRuntime({
    stageId: id === "white-hart" ? "pale-traverse" : "verdant-sanctum",
    worldId: `boss-pressure:${id}:${String(phase)}`,
  });
  if (id === "rootbound")
    bindLiveRootboundActors(
      environment,
      () => player,
      () => [boss],
      () => "enemy:boss",
      CONFIG,
    );
  if (id === "white-hart")
    bindLiveWhiteHartActors(
      environment,
      () => player,
      () => [boss],
      () => "enemy:boss",
    );
  let travel = 0,
    lastX = boss.x;
  for (let tick = 0; tick < SECONDS / DT; tick += 1) {
    const seconds = tick * DT;
    player.x = 300 + 1000 * (0.5 - 0.5 * Math.cos(seconds * 0.6));
    const jumping = Math.floor(seconds) % 4 === 0;
    player.y = CONFIG.world.groundY - 36 - (jumping ? 120 * Math.sin((seconds % 1) * Math.PI) : 0);
    player.onGround = !jumping;
    iframe = Math.max(0, iframe - DT);
    player.invulnerable = iframe > 0;
    environment.step(
      tick + 8,
      DT,
      () => {
        boss.update(DT, platforms, player, projectiles);
      },
      new Set(["enemy:boss"]),
    );
    boss.cinematicRequest = null;
    boss.cinematicT = 0;
    travel += Math.abs(boss.x - lastX);
    lastX = boss.x;
  }
  const damage = player.damage.reduce((sum, hit) => sum + hit.amount, 0);
  return [Math.round(travel / SECONDS), player.damage.length, Math.round(damage)];
}

/**
 * Today's numbers. See the header before changing a row. The Rootbound stands still in Phases II and
 * III and lands a fraction of what Aldric and the White Hart land; its rebuild is judged on this table.
 */
const BOSS_PRESSURE_RECORD: Readonly<Record<BossId, Measured>> = {
  warden: [
    [51, 1, 16],
    [130, 7, 130],
    [192, 3, 54],
  ],
  colossus: [
    [71, 8, 164],
    [87, 9, 184],
    [126, 8, 172],
  ],
  aldric: [
    [200, 8, 144],
    [511, 30, 540],
    [464, 30, 540],
  ],
  "white-hart": [
    [226, 6, 134],
    [414, 23, 409],
    [790, 22, 404],
  ],
  rootbound: [
    [42, 3, 58],
    [0, 5, 70],
    [0, 11, 234],
  ],
};

describe("boss pressure report", { timeout: 180_000 }, () => {
  it.each(BOSSES)("%s matches its recorded movement and hits against a moving player", (id) => {
    const measured: Measured = [measure(id, 1), measure(id, 2), measure(id, 3)];
    if (process.env.TEAR_BOSS_PRESSURE_REPORT === "1") console.log(`${id}: ${JSON.stringify(measured)}`);
    expect(measured).toEqual(BOSS_PRESSURE_RECORD[id]);
  });
});
