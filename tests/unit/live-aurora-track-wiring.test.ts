import { describe, expect, it } from "vitest";

import { bindLiveAuroraTrackActors } from "../../src/gameplay/environment/biome-actors/aurora-track-actors";
import type { AuroraTrackActor } from "../../src/gameplay/environment/aurora-track-runtime";

function bind(
  player: Parameters<typeof bindLiveAuroraTrackActors>[1],
  enemies: Parameters<typeof bindLiveAuroraTrackActors>[2],
  id: Parameters<typeof bindLiveAuroraTrackActors>[3],
): () => readonly AuroraTrackActor[] {
  let source: (() => readonly AuroraTrackActor[]) | undefined;
  bindLiveAuroraTrackActors(
    {
      addFeature() {
        /* registration is asserted by the runtime integration tests */
      },
      setFeatureActorSource(_featureId: string, _slot: string, value: () => readonly AuroraTrackActor[]) {
        source = value;
      },
    },
    player,
    enemies,
    id,
  );
  return () => source?.() ?? [];
}

describe("live Aurora Track actor wiring", () => {
  it("hands the roads the player and each enemy by its class, marking held and flying enemies", () => {
    const influence: unknown[] = [];
    const player = { x: 10, y: 20, vx: 30, fieldSpeed: 1, aiInput: { right: () => true, left: () => false } };
    const light = {
      x: 40,
      y: 20,
      vx: 50,
      fieldSpeed: 1,
      weight: 1,
      onAuroraTrackInfluence(direction: -1 | 1, onTrack: boolean) {
        influence.push([direction, onTrack]);
      },
    };
    const heavy = { x: 50, y: 20, vx: -30, fieldSpeed: 1, weight: 2 };
    const boss = { x: 60, y: 20, vx: 200, fieldSpeed: 1, weight: 6, isBoss: true };
    const rooted = { x: 70, y: 20, vx: 0, fieldSpeed: 1, weight: 1, anchored: true };
    const flyer = { x: 80, y: 20, vx: 90, fieldSpeed: 1, weight: 1, flies: true };
    const names = new Map<object, string>([
      [light, "enemy:light"],
      [heavy, "enemy:heavy"],
      [boss, "enemy:boss"],
      [rooted, "enemy:rooted"],
      [flyer, "enemy:flyer"],
    ]);
    const actors = bind(
      () => player,
      () => [light, heavy, boss, rooted, flyer],
      (enemy) => names.get(enemy) ?? "enemy:unknown",
    )();
    expect(actors.map(({ id, kind, held, intentX }) => ({ id, kind, held: held === true, intentX }))).toEqual([
      { id: "player", kind: "player", held: false, intentX: 1 },
      { id: "enemy:light", kind: "light-enemy", held: false, intentX: 1 },
      { id: "enemy:heavy", kind: "heavy-enemy", held: false, intentX: -1 },
      { id: "enemy:boss", kind: "boss", held: false, intentX: 1 },
      { id: "enemy:rooted", kind: "light-enemy", held: true, intentX: 0 },
      { id: "enemy:flyer", kind: "light-enemy", held: true, intentX: 1 },
    ]);
    actors[1]?.onInfluenced?.(1, true);
    expect(influence).toEqual([[1, true]]);
  });

  it("writes a road's speed straight onto the live player and enemy, with no copies", () => {
    const player = { x: 10, y: 20, vx: 30, fieldSpeed: 1, aiInput: { right: () => false, left: () => true } };
    const enemy = { x: 40, y: 20, vx: 50, fieldSpeed: 1 };
    const actors = bind(
      () => player,
      () => [enemy],
      () => "enemy:1",
    )();
    const [hero, foe] = actors;
    if (hero === undefined || foe === undefined) throw new Error("the bound actors are missing");
    hero.fieldSpeed = 1.5;
    foe.fieldSpeed = 1.2;
    expect(player.fieldSpeed).toBe(1.5);
    expect(enemy.fieldSpeed).toBe(1.2);
    player.vx = -200;
    expect(hero.vx).toBe(-200);
    expect(hero.intentX).toBe(-1);
  });

  it("reads no intent from a player without input, so leftover speed is not travel", () => {
    const player = { x: 10, y: 20, vx: 300, fieldSpeed: 1 };
    const [hero] = bind(
      () => player,
      () => [],
      () => "enemy",
    )();
    expect(hero?.intentX).toBe(0);
  });

  it("hands on no player while the world has none, as when the stage is cleared before a run starts", () => {
    const enemy = { x: 40, y: 20, vx: 50, fieldSpeed: 1 };
    const actors = bind(
      () => undefined,
      () => [enemy],
      () => "enemy:1",
    )();
    expect(actors.map((actor) => actor.id)).toEqual(["enemy:1"]);
  });
});
