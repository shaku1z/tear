import type { EnvironmentRuntime } from "../../src/gameplay/environment/environment-runtime";
import { createVerdantEnvironmentFeature } from "../../src/gameplay/environment/verdant-environment-feature";
import { createPaleEnvironmentFeature } from "../../src/gameplay/environment/pale-environment-feature";

export function bindVerdantEnvironmentActors(
  environment: EnvironmentRuntime,
  slot: "bloom-well" | "rootbinder" | "rootbound",
  source: () => readonly unknown[],
): void {
  environment.addFeature(createVerdantEnvironmentFeature());
  environment.setFeatureActorSource("verdant", slot, source);
}

export function bindPaleEnvironmentActors(
  environment: EnvironmentRuntime,
  slot: "aurora-track" | "white-hart",
  source: () => readonly unknown[],
): void {
  environment.addFeature(createPaleEnvironmentFeature());
  environment.setFeatureActorSource("pale", slot, source);
}
