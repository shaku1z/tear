import { describe, expect, it } from "vitest";

import { TEAR_WORLD_ENTITY_FACTORY_IDS } from "../../src/gameplay/runtime/tear-world-entity-construction";
import { createTearWorldLegacyEntityConstruction } from "../../src/gameplay/runtime/tear-world-legacy-entity-construction";

interface Run { readonly mods: { readonly id: string } }
interface Actor { readonly kind: string; readonly x: number; readonly y: number; mods?: Run["mods"] }

describe("Tear world legacy entity construction", () => {
  it("owns the complete stable factory-ID mapping and Echo modifier reconnect", () => {
    const calls: string[] = [];
    const actor = (kind: string, x: number, y: number): Actor => { calls.push(kind); return { kind, x, y }; };
    const factory = createTearWorldLegacyEntityConstruction<Run, Actor, Actor, Actor, Actor, Run["mods"]>({
      createPlayer: (x, y) => actor("player", x, y), createBlade: () => actor("blade", 0, 0),
      createProjectile: (x, y) => actor("projectile", x, y), echoMods: (run) => run.mods,
      enemy: {
        charger: (x, y) => actor("charger", x, y), ranged: (x, y) => actor("ranged", x, y), flyer: (x, y) => actor("flyer", x, y), bomber: (x, y) => actor("bomber", x, y),
        armored: (x, y) => actor("armored", x, y), wraith: (x, y) => actor("wraith", x, y), chimera: (x, y) => actor("chimera", x, y), warden: (x, y) => actor("warden", x, y),
        colossus: (x, y) => actor("colossus", x, y), aldric: (x, y) => actor("aldric", x, y),
        rootbound: (x, y) => actor("rootbound", x, y),
        whiteHart: (x, y) => actor("white-hart", x, y),
        rimehound: (x, y) => actor("rimehound", x, y),
        echo: (x, y, mods) => ({ ...actor("echo", x, y), mods }), source: (x, y) => actor("source", x, y), voidWisp: (x, y) => actor("void-wisp", x, y),
        reflection: (x, y) => actor("reflection", x, y), support: (x, y, kind) => actor(kind, x, y), boss: (x, y) => actor("boss", x, y),
      },
      rebindEchoMods: (enemy, mods) => { enemy.mods = mods; },
    });
    const initial = { mods: { id: "initial" } }, restored = { mods: { id: "restored" } };
    const actors = TEAR_WORLD_ENTITY_FACTORY_IDS.map((id) => factory.createEnemy(id, 4, 5, initial));
    const echo = actors[TEAR_WORLD_ENTITY_FACTORY_IDS.indexOf("echo")];
    if (echo === undefined) throw new Error("fixture did not create Echo");
    factory.finalizeEnemy?.("echo", echo, restored);

    expect(calls).toEqual([
      "charger", "ranged", "flyer", "bomber", "armored", "wraith", "chimera", "warden", "colossus", "aldric", "rootbound", "white-hart", "echo", "source", "void-wisp", "reflection",
      "priest", "herald", "mender", "anchor", "rootbinder", "rimehound", "boss",
    ]);
    expect(echo.mods).toEqual(restored.mods);
    expect(factory.createEnemy("charger", 9, 10, initial)).toMatchObject({ x: 9, y: 10 });
  });
});
