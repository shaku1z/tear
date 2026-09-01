import { describe, expect, it } from "vitest";

import { TEAR_WORLD_ENTITY_FACTORY_IDS } from "../../src/gameplay/runtime/tear-world-entity-construction";
import {
  createLiveWorldEntityFactory,
  type LiveWorldEntityDependencies,
} from "../../src/app/live-world-entity-factory";
import type { GameRun } from "../../src/app/game-runtime-state";
import { findVariant } from "../../src/gameplay/variants";

interface ConstructorCall {
  readonly kind: string;
  readonly x: number;
  readonly y: number;
  readonly extra: readonly unknown[];
}

function fixtureDependencies(calls: ConstructorCall[]): LiveWorldEntityDependencies {
  class FixturePlayer { constructor(readonly x: number, readonly y: number) {} }
  class FixtureBlade { readonly kind = "blade"; }
  class FixtureProjectile {
    constructor(readonly x: number, readonly y: number, readonly vx: number, readonly vy: number) {}
  }
  const enemy = (kind: string) => class {
    readonly cfg = {};
    readonly damageTakenMult = 1;
    readonly kind = kind;
    constructor(readonly x: number, readonly y: number, ...extra: unknown[]) {
      calls.push({ kind, x, y, extra });
    }
    hit(): number { return 0; }
  };
  return {
    Player: FixturePlayer, Blade: FixtureBlade, Projectile: FixtureProjectile,
    Charger: enemy("charger"), Ranged: enemy("ranged"), Flyer: enemy("flyer"), Bomber: enemy("bomber"),
    Armored: enemy("armored"), Wraith: enemy("wraith"), Chimera: enemy("chimera"), Warden: enemy("warden"),
    Colossus: enemy("colossus"), Aldric: enemy("aldric"), Rootbound: enemy("rootbound"), WhiteHart: enemy("white-hart"), Rimehound: enemy("rimehound"), MirrorHost: enemy("echo"), Source: enemy("source"),
    VoidWisp: enemy("void-wisp"), ReflectionEnemy: enemy("reflection"), Support: enemy("support"), Rootbinder: enemy("rootbinder"), Boss: enemy("boss"),
  } as unknown as LiveWorldEntityDependencies;
}

describe("live world entity factory", () => {
  it("maps every portable ID to the production constructor family and reconnects Echo modifiers", () => {
    const calls: ConstructorCall[] = [];
    const factory = createLiveWorldEntityFactory(fixtureDependencies(calls));
    const initialRun = { mods: { source: "initial" } } as unknown as GameRun;
    const restoredRun = { mods: { source: "restored" } } as unknown as GameRun;

    expect(factory.createPlayer(1, 2)).toMatchObject({ x: 1, y: 2 });
    expect(factory.createBlade()).toMatchObject({ kind: "blade" });
    expect(factory.createProjectile(3, 4, -5, 6)).toMatchObject({ x: 3, y: 4, vx: -5, vy: 6 });
    const actors = TEAR_WORLD_ENTITY_FACTORY_IDS.map((id) => factory.createEnemy(id, 40, 50, initialRun));
    const echo = actors[TEAR_WORLD_ENTITY_FACTORY_IDS.indexOf("echo")];
    if (echo === undefined) throw new Error("fixture did not construct Echo");
    factory.finalizeEnemy?.("echo", echo, restoredRun);

    expect(calls.map((call) => call.kind)).toEqual([
      "charger", "ranged", "flyer", "bomber", "armored", "wraith", "chimera",
      "warden", "colossus", "aldric", "rootbound", "white-hart", "echo", "source", "void-wisp", "reflection",
      "support", "support", "support", "support", "rootbinder", "rimehound", "boss",
    ]);
    expect(calls.every((call) => call.x === 40 && call.y === 50)).toBe(true);
    expect(calls.find((call) => call.kind === "echo")?.extra).toEqual([initialRun.mods]);
    expect(calls.filter((call) => call.kind === "support").map((call) => call.extra[0]))
      .toEqual(["priest", "herald", "mender", "anchor"]);
    expect((echo as { _mods?: unknown })._mods).toBe(restoredRun.mods);
  });

  it("rehydrates a matching variant name when serialized behavior is missing", () => {
    const factory = createLiveWorldEntityFactory(fixtureDependencies([]));
    const run = { mods: {} } as GameRun;
    const actor = factory.createEnemy("charger", 1, 2, run);
    const variant = findVariant("charger", "briar-stalker");
    if (variant === null) throw new Error("briar-stalker fixture variant is missing");
    actor.variant = variant.id;
    actor.variantName = variant.name;
    (actor as unknown as { behavior?: unknown }).behavior = undefined;
    actor.speedMult = 1;

    factory.finalizeEnemy?.("charger", actor, run);

    expect(actor.behavior).toBe("briar-stalker");
    expect(actor.speedMult).toBeCloseTo(1.18);
  });
});
