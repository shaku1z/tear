import type { EnvironmentRuntime } from "../environment-runtime";
import { createVerdantEnvironmentFeature, type RootbinderEnvironmentActor } from "../verdant-environment-feature";
import { severRootbinder, type RootbinderCandidate } from "../../entities/rootbinder-runtime";
import type { BiomeActorEnemy, BiomeActorPlayer } from "./actor-entities";

/** Binds live actors to the authoritative environment relationship phase. */
export function bindLiveRootbinderActors(
  environment: EnvironmentRuntime,
  player: () => BiomeActorPlayer | null,
  enemies: () => readonly BiomeActorEnemy[],
  actorId: (enemy: BiomeActorEnemy) => string,
): void {
  environment.addFeature(createVerdantEnvironmentFeature());
  environment.setFeatureActorSource("verdant", "rootbinder", () => {
    const values = enemies();
    const rootbinders = values.filter((enemy) => enemy.kind === "rootbinder");
    if (rootbinders.length === 0) return [];
    const candidates: RootbinderCandidate[] = values.map((enemy) => {
      const supportType = (enemy as BiomeActorEnemy & { supportType?: string }).supportType;
      const kind: RootbinderCandidate["kind"] =
        enemy.kind === "rootbinder"
          ? "rootbinder"
          : enemy.isBoss
            ? "boss"
            : enemy.kind === "flyer" || enemy.kind === "wraith"
              ? "flyer"
              : "ordinary";
      return {
        id: actorId(enemy),
        worldId: environment.worldId,
        stageId: environment.stageId,
        kind,
        x: enemy.x,
        y: enemy.y,
        dead: enemy.dead,
        dying: enemy.dying,
        vx: enemy.vx,
        vy: enemy.vy,
        weight: enemy.weight,
        applyVelocity: (vx: number, vy: number) => {
          enemy.vx = vx;
          enemy.vy = vy;
        },
        ...(supportType === undefined
          ? {}
          : { supportKinds: [supportType as NonNullable<RootbinderCandidate["supportKinds"]>[number]] }),
      };
    });
    return rootbinders.map((enemy): RootbinderEnvironmentActor => {
      const id = actorId(enemy);
      const state = (enemy as BiomeActorEnemy & { rootbinderState?: RootbinderEnvironmentActor["state"] })
        .rootbinderState;
      if (state === undefined) throw new Error("live Rootbinder is missing its deterministic state");
      (enemy as BiomeActorEnemy & { rootbinderOwnerId?: string }).rootbinderOwnerId = id;
      return Object.freeze({
        id,
        state: Object.freeze({
          ...state,
          id,
          worldId: environment.worldId,
          stageId: environment.stageId,
          x: enemy.x,
          y: enemy.y,
        }),
        candidates: Object.freeze(candidates.filter((candidate) => candidate.id !== id)),
        sever: () => {
          const live = enemy as BiomeActorEnemy & { rootbinderState: RootbinderEnvironmentActor["state"] };
          live.rootbinderState = severRootbinder(live.rootbinderState);
        },
        ...(() => {
          const target = player();
          if (target === null) return {};
          return {
            player: {
              id: "player",
              x: target.x,
              y: target.y,
              vx: target.vx,
              vy: target.vy,
              jumpEnabled: true,
              dashEnabled: true,
              alive: target.hp > 0,
              apply: (value: { readonly vx: number; readonly vy: number }) => {
                target.vx = value.vx;
                target.vy = value.vy;
              },
            },
          };
        })(),
      });
    });
  });
}
