import { describe, expect, it } from "vitest";

import {
  hydrateTearCodecWorld,
  type TearCodecId,
  type TearCodecValue,
  type TearCodecWorld,
  type TearWorldConstructionPort,
  type TearWorldHydrationContext,
} from "../../src/tearbench";
import { INACTIVE_CINEMATIC_DIRECTOR_STATE_V1 } from "../../src/gameplay/runtime/cinematic-director";

interface FakePlayer extends Record<string, unknown> {
  kind: "player";
  x: number;
  y: number;
}

interface FakeBlade extends Record<string, unknown> {
  kind: "blade";
}

interface FakeRun extends Record<string, unknown> {
  mode: string;
  tick: number;
  mods: { echoMultiplier: number };
  player: FakePlayer;
}

interface FakeEnemy extends Record<string, unknown> {
  kind: "charger" | "echo";
  x: number;
  y: number;
  constructedRun: FakeRun;
}

interface FakeProjectile extends Record<string, unknown> {
  kind: "projectile";
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface FakeReward {
  readonly payload: TearCodecValue;
}

interface EnemyConstruction {
  readonly factoryId: string;
  readonly x: number;
  readonly y: number;
  readonly run: FakeRun;
}

function ref(id: string): TearCodecValue {
  return { $ref: id };
}

function refSet(...ids: string[]): TearCodecValue {
  return { $set: ids.map((id) => ref(id)) };
}

function completeCodecWorld(): TearCodecWorld {
  const components = new Map<TearCodecId, TearCodecValue>();
  components.set("tear.player.v1", {
    id: "player",
    x: 10,
    y: 20,
    hp: 80,
    maxHp: 100,
    blade: ref("blade"),
    currentTarget: ref("enemy-echo"),
    links: refSet("enemy-charger", "enemy-echo"),
    mutable: { shield: 3 },
  });
  components.set("tear.blade.v1", {
    id: "blade",
    weaponId: "sword",
    x: 12,
    y: 18,
    holder: ref("player"),
    target: ref("enemy-charger"),
  });
  components.set("tear.run.v1", {
    mode: "campaign",
    tick: 42,
    wave: 3,
    player: ref("player"),
    blade: ref("blade"),
    mods: { echoMultiplier: 2 },
  });
  components.set("tear.world.v1", {
    clock: 42,
    floaters: [{ anchor: ref("enemy-charger"), text: "12" }],
    ghost: { recording: { target: ref("enemy-echo") } },
    identityState: { nextEntityId: 6, nextWallSequence: 2, nextSlowZoneSequence: 3, claimedIds: ["enemy-echo"] },
    runtime: { cameraTarget: ref("player"), danger: { source: ref("enemy-echo") } },
  });
  components.set("tear.enemy.v1", [{
    id: "enemy-charger",
    factoryId: "charger",
    x: 100,
    y: 200,
    target: ref("player"),
    partner: ref("enemy-echo"),
  }]);
  components.set("tear.boss.v1", [{
    id: "enemy-echo",
    factoryId: "echo",
    x: 300,
    y: 400,
    target: ref("player"),
    partner: ref("enemy-charger"),
  }]);
  components.set("tear.projectile.v1", [{
    id: "projectile-1",
    factoryId: "projectile",
    x: 250,
    y: 300,
    vx: -4,
    vy: 2,
    owner: ref("enemy-echo"),
    target: ref("player"),
  }]);
  components.set("tear.platform.v1", [{ platformId: "platform-1", rider: ref("player"), x: 0, y: 500 }]);
  components.set("tear.hazard.v1", {
    slowZones: [{ target: ref("enemy-charger"), strength: 0.5 }],
    walls: [{ owner: ref("enemy-echo"), x: 50, y: 60 }],
  });
  components.set("tear.ui.v1", { screen: "playing", focusId: "7" });
  components.set("tear.reward.v1", { selection: { choices: ["damage"], reservedChoice: null } });
  components.set("tear.configuration.v1", { rulesetVersion: "fixture", values: { gravity: 1 } });
  components.set("tear.rng.v1", { combat: { algorithm: "mulberry32", state: 123 } });
  components.set("tear.cinematic.v1", INACTIVE_CINEMATIC_DIRECTOR_STATE_V1 as never);
  return {
    components,
    references: new Map(),
    entityIds: new Set(["player", "blade", "enemy-charger", "enemy-echo", "projectile-1"]),
  };
}

function constructionPort(calls: EnemyConstruction[]): TearWorldConstructionPort<
  FakeRun,
  FakePlayer,
  FakeBlade,
  FakeEnemy,
  FakeProjectile,
  FakeReward
> {
  return {
    createPlayer: (x, y) => ({ kind: "player", x, y }),
    createBlade: () => ({ kind: "blade" }),
    createEnemy(factoryId, x, y, run) {
      calls.push({ factoryId, x, y, run });
      switch (factoryId) {
        case "charger": return { kind: "charger", x, y, constructedRun: run };
        case "echo": return { kind: "echo", x, y, constructedRun: run };
        default: throw new RangeError(`unknown enemy factory: ${factoryId}`);
      }
    },
    createProjectile: (x, y, vx, vy) => ({ kind: "projectile", x, y, vx, vy }),
    hydrateReward: (payload) => ({ payload: structuredClone(payload) }),
    finalizeEnemy: (_factoryId, enemy, run) => { enemy.constructedRun = run; },
  };
}

function hydrationContext(): Readonly<{ context: TearWorldHydrationContext; requests: string[] }> {
  const allowed = new Set(["player", "blade", "enemy-charger", "enemy-echo", "projectile-1"]);
  const requests: string[] = [];
  return {
    context: {
      requireIdentity(id) {
        requests.push(id);
        if (!allowed.has(id)) throw new RangeError(`unknown fixture identity: ${id}`);
        return { id };
      },
    },
    requests,
  };
}

function objectValue(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError(message);
  return value as Record<string, unknown>;
}

describe("detached Tear codec world hydrator", () => {
  it("restores stable references and dispatches each factory with the decoded Echo run", () => {
    const calls: EnemyConstruction[] = [];
    const identity = hydrationContext();
    const staged = hydrateTearCodecWorld(
      constructionPort(calls),
      completeCodecWorld(),
      identity.context,
    );
    const charger = staged.enemies.find((enemy) => enemy.kind === "charger");
    const echo = staged.enemies.find((enemy) => enemy.kind === "echo");
    const projectile = staged.projectiles[0];
    if (charger === undefined || echo === undefined || projectile === undefined) {
      throw new Error("fixture hydration did not create all expected actors");
    }

    expect(identity.requests).toEqual(["player", "blade", "enemy-charger", "enemy-echo", "projectile-1"]);
    expect(calls.map((call) => call.factoryId)).toEqual(["charger", "echo"]);
    expect(calls[1]?.run).not.toBe(staged.run);
    expect(calls[1]?.run.player).toBe(staged.player);
    expect(echo.constructedRun).toBe(staged.run);

    expect(staged.player.blade).toBe(staged.blade);
    expect(staged.player.currentTarget).toBe(echo);
    expect(staged.player.links).toEqual(new Set([charger, echo]));
    expect(staged.blade.holder).toBe(staged.player);
    expect(staged.blade.target).toBe(charger);
    expect(charger.target).toBe(staged.player);
    expect(charger.partner).toBe(echo);
    expect(echo.target).toBe(staged.player);
    expect(echo.partner).toBe(charger);
    expect(projectile.owner).toBe(echo);
    expect(projectile.target).toBe(staged.player);
    expect(objectValue(staged.floaters[0], "floater is missing").anchor).toBe(charger);
    expect(objectValue(staged.platforms[0], "platform is missing").rider).toBe(staged.player);
    expect(objectValue(staged.slowZones[0], "slow zone is missing").target).toBe(charger);
    expect(objectValue(staged.walls[0], "wall is missing").owner).toBe(echo);
    expect(staged.runtime.cameraTarget).toBe(staged.player);
    expect(objectValue(staged.ghost, "ghost is missing").recording).toEqual({ target: echo });
    expect(staged.identityBindings.map((binding) => binding.id)).toEqual(["enemy-charger", "enemy-echo", "projectile-1"]);
  });

  it("hydrates fresh data graphs without mutating or sharing source codec values", () => {
    const source = completeCodecWorld();
    const before = structuredClone([...source.components.entries()]);
    const first = hydrateTearCodecWorld(constructionPort([]), source, hydrationContext().context);
    const second = hydrateTearCodecWorld(constructionPort([]), source, hydrationContext().context);

    expect([...source.components.entries()]).toEqual(before);
    expect(first.player).not.toBe(second.player);
    expect(first.run).not.toBe(second.run);
    expect(first.platforms).not.toBe(second.platforms);
    expect(first.configuration).not.toBe(second.configuration);
    expect(first.configuration).not.toBe(source.components.get("tear.configuration.v1"));

    objectValue(first.player.mutable, "player mutable data is missing").shield = 99;
    first.run.mods.echoMultiplier = 99;
    objectValue(first.configuration, "configuration is missing").values = { gravity: 99 };

    expect(objectValue(second.player.mutable, "second player mutable data is missing").shield).toBe(3);
    expect(second.run.mods.echoMultiplier).toBe(2);
    expect(objectValue(objectValue(second.configuration, "second configuration is missing").values, "gravity is missing").gravity)
      .toBe(1);
    expect([...source.components.entries()]).toEqual(before);
  });

  it("does not restore transient live input projections into freshly constructed actors", () => {
    const source = completeCodecWorld();
    const blade = source.components.get("tear.blade.v1");
    const player = source.components.get("tear.player.v1");
    if (blade === undefined || player === undefined) throw new Error("fixture actor payload is missing");
    source.components.set("tear.blade.v1", {
      ...objectValue(blade, "blade fixture is malformed"),
      aimOverride: { x: 80, y: 90 },
      lmbOverride: true,
    });
    source.components.set("tear.player.v1", {
      ...objectValue(player, "player fixture is malformed"),
      aiInput: { left: true },
    });

    const staged = hydrateTearCodecWorld(constructionPort([]), source, hydrationContext().context);

    expect("aimOverride" in staged.blade).toBe(false);
    expect("lmbOverride" in staged.blade).toBe(false);
    expect("aiInput" in staged.player).toBe(false);
  });

  it("propagates an unknown constructor factory instead of silently accepting it", () => {
    const hostile = completeCodecWorld();
    const enemies = hostile.components.get("tear.enemy.v1");
    if (!Array.isArray(enemies)) throw new Error("enemy fixture is missing");
    const firstEnemy = (enemies as readonly TearCodecValue[])[0];
    if (firstEnemy === undefined) throw new Error("enemy fixture has no actor");
    hostile.components.set("tear.enemy.v1", [{ ...objectValue(firstEnemy, "enemy fixture is malformed"), factoryId: "unknown" }]);

    expect(() => hydrateTearCodecWorld(constructionPort([]), hostile, hydrationContext().context))
      .toThrow(/unknown enemy factory: unknown/);
  });
});
