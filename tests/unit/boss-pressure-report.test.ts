/**
 * How much each boss moves, how often it lands hits and how long it stays open to punishment, on one harness, so a boss rebuild can be judged
 * against the others. Each boss fights a player who keeps walking across the arena and jumps every four
 * seconds, for 60 s per phase, in its real arena; the biome bosses run inside their environment, so
 * stage objects that deal damage count. The player has the game's invulnerability after each hit.
 *
 * BOSS_PRESSURE_RECORD is what the bosses do today. A change to a boss changes its row: update the row
 * in that pull request and say why. The Rootbound rebuild is meant to raise its row toward Aldric and the
 * White Hart. Not counted: boss projectiles in flight (no collision here) and body contact.
 * Exposed time is the time the boss reports an "exposed" tell (a move's punish stage).
 * TEAR_BOSS_PRESSURE_REPORT=1 prints the measured table.
 *
 * READING_PLAYER_RECORD is the same fight against a player who reads the marks and does nothing clever:
 * it jumps a lane and walks off any other marked area at run speed. It shows how much of a boss's damage
 * is pressure a player can answer, and how much lands anyway.
 */
import { describe, expect, it } from "vitest";

import { CONFIG } from "../../src/config/game-config";
import { bossTellCovers, bossTells } from "../../src/gameplay/entities/boss-tells";
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

/** Per phase I / II / III: pixels moved per second, hits landed, damage dealt, seconds exposed. */
type PhaseRow = readonly [travelPerSecond: number, hits: number, damage: number, exposedSeconds: number];
type Measured = readonly [PhaseRow, PhaseRow, PhaseRow];

type PlayerKind = "walker" | "reader";
/** How close to a wall the reading player will stand. */
const ARENA_MARGIN = 40;

function measure(id: BossId, phase: 1 | 2 | 3, kind: PlayerKind = "walker"): PhaseRow {
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
    exposedTicks = 0,
    lastX = boss.x,
    jumpT = 0;
  const floorY = CONFIG.world.groundY - 36;
  for (let tick = 0; tick < SECONDS / DT; tick += 1) {
    const seconds = tick * DT;
    if (kind === "walker") {
      player.x = 300 + 1000 * (0.5 - 0.5 * Math.cos(seconds * 0.6));
      const jumping = Math.floor(seconds) % 4 === 0;
      player.y = floorY - (jumping ? 120 * Math.sin((seconds % 1) * Math.PI) : 0);
      player.onGround = !jumping;
    } else {
      // Reads the marks: jumps a lane it stands in, walks out of any other marked area.
      const standing = { x: player.x, y: floorY, hw: player.hw, hh: player.hh };
      const threat = bossTells(boss).find(
        (tell) => tell.damaging && tell.stage !== "exposed" && bossTellCovers(tell, standing),
      );
      if (threat?.mark === "lane" && jumpT <= 0 && threat.remainingSeconds <= 0.25) jumpT = 0.75;
      else if (threat !== undefined && threat.mark !== "lane") {
        // Leaves by the nearer side of the marked area that is still inside the arena.
        const left = threat.x - threat.hw - player.hw;
        const right = threat.x + threat.hw + player.hw;
        const canLeft = left > ARENA_MARGIN;
        const canRight = right < CONFIG.view.w - ARENA_MARGIN;
        const nearer = player.x - left <= right - player.x ? -1 : 1;
        const side = canLeft && canRight ? nearer : canLeft ? -1 : canRight ? 1 : nearer;
        player.x += side * CONFIG.player.moveSpeed * DT;
      }
      jumpT = Math.max(0, jumpT - DT);
      player.y = floorY - (jumpT > 0 ? 200 * Math.sin((1 - jumpT / 0.75) * Math.PI) : 0);
      player.onGround = jumpT <= 0;
    }
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
    if (bossTells(boss).some((tell) => tell.stage === "exposed")) exposedTicks += 1;
    travel += Math.abs(boss.x - lastX);
    lastX = boss.x;
  }
  const damage = player.damage.reduce((sum, hit) => sum + hit.amount, 0);
  return [
    Math.round(travel / SECONDS),
    player.damage.length,
    Math.round(damage),
    Math.round(exposedTicks * DT * 10) / 10,
  ];
}

/**
 * Today's numbers, on Normal (the unscaled base config: boss health and damage multipliers 1). See the header
 * before changing a row. The Rootbound's rebuild is judged on this table; all three phases are rebuilt.
 */
const BOSS_PRESSURE_RECORD: Readonly<Record<BossId, Measured>> = {
  warden: [
    [51, 1, 16, 0],
    [130, 7, 130, 0],
    [192, 3, 54, 0],
  ],
  colossus: [
    [71, 8, 164, 0],
    [87, 9, 184, 0],
    [126, 8, 172, 0],
  ],
  aldric: [
    [200, 8, 144, 0],
    [511, 30, 540, 0],
    [464, 30, 540, 0],
  ],
  "white-hart": [
    [226, 6, 134, 0],
    [414, 23, 409, 0],
    [790, 22, 404, 0],
  ],
  // Every phase plays the move table (rootbound-moves.ts): the keeper glides, vaults and lunges, and is open
  // after its heavy moves. Phase II adds planting, the cage and the Wells; it was [0, 5, 70, 0] before its rebuild.
  // Phase III opens with Regrowth and plays Last Spring every fourth move, at a shorter pause; it was
  // [72, 12, 248, 4.6] while it still stood to heal and ran the old Last Spring.
  rootbound: [
    [150, 14, 252, 9.1],
    [141, 11, 208, 9.1],
    [111, 12, 264, 12.3],
  ],
};

/** Rootbound against the reading player: what is left once the marks are answered. */
// Phases I and II: every move can be answered. Phase III: Last Spring is left by the nearer edge of its band.
// What still lands is Regrowth's root wave: it repeats inside one active stage with no new tell, so a player
// times it by the wave they see, which this reader cannot do.
const READING_PLAYER_RECORD: Measured = [
  [42, 0, 0, 2.5],
  [46, 0, 0, 2.4],
  [33, 3, 48, 8],
];

describe("boss pressure report", { timeout: 180_000 }, () => {
  it("rootbound's move phases are answerable: a player who reads the marks takes far less", () => {
    const measured: Measured = [
      measure("rootbound", 1, "reader"),
      measure("rootbound", 2, "reader"),
      measure("rootbound", 3, "reader"),
    ];
    if (process.env.TEAR_BOSS_PRESSURE_REPORT === "1") console.log(`rootbound reader: ${JSON.stringify(measured)}`);
    expect(measured).toEqual(READING_PLAYER_RECORD);
    for (const phase of [0, 1, 2] as const)
      expect(measured[phase][2]).toBeLessThan(BOSS_PRESSURE_RECORD.rootbound[phase][2] / 2);
  });

  it.each(BOSSES)("%s matches its recorded movement and hits against a moving player", (id) => {
    const measured: Measured = [measure(id, 1), measure(id, 2), measure(id, 3)];
    if (process.env.TEAR_BOSS_PRESSURE_REPORT === "1") console.log(`${id}: ${JSON.stringify(measured)}`);
    expect(measured).toEqual(BOSS_PRESSURE_RECORD[id]);
  });
});
