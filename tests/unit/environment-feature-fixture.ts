import type { EnvironmentRuntime } from "../../src/gameplay/environment/environment-runtime";
import type { EnvironmentContactTarget } from "../../src/gameplay/environment/environment-contact-damage";
import { createVerdantEnvironmentFeature } from "../../src/gameplay/environment/verdant-environment-feature";
import { createPaleEnvironmentFeature } from "../../src/gameplay/environment/pale-environment-feature";

export function bindVerdantEnvironmentActors(
  environment: EnvironmentRuntime,
  slot: "bloom-well" | "rootbinder" | "rootbound",
  source: () => readonly unknown[],
): void {
  environment.addFeature(createVerdantEnvironmentFeature());
  environment.setFeatureActorSource("verdant", slot, source);
  if (slot === "rootbound") bindFixtureContactTargets(environment, source);
}

export function bindPaleEnvironmentActors(
  environment: EnvironmentRuntime,
  slot: "aurora-track" | "white-hart",
  source: () => readonly unknown[],
): void {
  environment.addFeature(createPaleEnvironmentFeature());
  environment.setFeatureActorSource("pale", slot, source);
  if (slot === "white-hart") bindFixtureContactTargets(environment, source);
}

type FixturePlayer = Omit<EnvironmentContactTarget, "id" | "takeDamage"> & {
  readonly id?: string;
  readonly takeDamage: (damage: number, sourceX: number, source: unknown) => void;
};

type FixtureActor = Readonly<{ id: string; source?: unknown; player?: FixturePlayer }>;

/**
 * The environment hurts the player the fixture actors name, as the live contact target binding does:
 * the owning actor's player takes the hit, with that actor as the source.
 */
function bindFixtureContactTargets(environment: EnvironmentRuntime, source: () => readonly unknown[]): void {
  environment.setContactTargets(() => {
    const actors = source() as readonly FixtureActor[];
    const player = actors.find((actor) => actor.player !== undefined)?.player;
    if (player === undefined) return [];
    return [
      {
        ...player,
        id: player.id ?? "player",
        takeDamage: (damage: number, sourceX: number, ownerId: string | null) => {
          const owner = actors.find((actor) => actor.id === ownerId);
          owner?.player?.takeDamage(damage, sourceX, owner.source);
        },
      },
    ];
  });
}
