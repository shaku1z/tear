import { describe, expect, it } from "vitest";

import { stableVerificationHash } from "../../src/replay/hash";
import { captureLiveStateForgeSnapshot } from "../../src/tearbench/live-runtime-snapshots";
import {
  CODEC_REGISTRY,
  createDefaultStateCodecRegistry,
  type TearBuildIdentityV1,
  type TearCodecId,
  type TearCodecValue,
  type TearCodecWorld,
} from "../../src/tearbench";

type StaticBuild = Omit<TearBuildIdentityV1, "configHash">;
type UnitConfiguration = Readonly<{ rulesetVersion: string; values: Readonly<{ gravity: number }> }>;

function world(configuration: UnitConfiguration = Object.freeze({ rulesetVersion: "tear-rules-unit", values: { gravity: 1 } })): TearCodecWorld {
  const components = new Map<TearCodecId, TearCodecValue>();
  for (const id of CODEC_REGISTRY.ids) components.set(id, {});
  components.set("tear.configuration.v1", configuration);
  return { components, references: new Map(), entityIds: new Set() };
}

function input(staticBuild?: StaticBuild, configuration?: UnitConfiguration) {
  const captured = world(configuration);
  return {
    id: "live-snapshot-1", tick: 12, stateClass: "recorded-canonical" as const, seed: "snapshot-seed",
    stateForge: { capture: () => captured }, world: captured, rng: { combat: { algorithm: "mulberry32", state: 4 } },
    registry: createDefaultStateCodecRegistry(), observationClass: "structured-state" as const,
    producer: "live-snapshot-test", target: staticBuild?.target ?? "test-standalone",
    contentHash: staticBuild?.contentHash ?? "content-unit", visualHash: "visual-unit",
    ...(staticBuild === undefined ? {} : { staticBuild, sourceId: "ghost-live-bootstrap-unit" }),
  };
}

describe("live State Forge snapshot provenance", () => {
  it("preserves immutable build fields while attesting the captured keyframe configuration", () => {
    const configuration = { rulesetVersion: "tear-rules-unit", values: { gravity: 1 } };
    const staticBuild: StaticBuild = {
      version: "0.1.0", revision: "unit", target: "test-standalone", rulesetVersion: "tear-rules-unit",
      contentHash: "content-unit",
    };

    const snapshot = captureLiveStateForgeSnapshot(input(staticBuild, configuration));

    expect(snapshot.provenance.build).toEqual({ ...staticBuild, configHash: stableVerificationHash(configuration) });
    expect(snapshot.provenance.sourceId).toBe("ghost-live-bootstrap-unit");
  });

  it("marks snapshots explicitly unbound when no build identity is injected", () => {
    const snapshot = captureLiveStateForgeSnapshot(input());

    expect(snapshot.provenance.build.revision).toBe("unbound");
    expect(snapshot.provenance.build.revision).not.toBe("working-tree");
  });

  it("accepts the composition buildIdentity alias and rejects disagreement", () => {
    const buildIdentity: StaticBuild = {
      version: "0.1.0", revision: "injected-revision", target: "test-standalone", rulesetVersion: "tear-rules-unit",
      contentHash: "content-unit",
    };
    const snapshot = captureLiveStateForgeSnapshot({ ...input(), buildIdentity });
    expect(snapshot.provenance.build).toMatchObject(buildIdentity);

    expect(() => captureLiveStateForgeSnapshot({ ...input(buildIdentity), buildIdentity: { ...buildIdentity, revision: "other" } })).toThrow(/aliases disagree/u);
  });

  it("keeps the bootstrap identity stable while upgrades change later keyframe configuration", () => {
    const staticBuild: StaticBuild = {
      version: "0.1.0", revision: "unit", target: "test-standalone", rulesetVersion: "tear-rules-unit",
      contentHash: "content-unit",
    };
    const initialConfiguration = { rulesetVersion: "tear-rules-unit", values: { gravity: 1 } };
    const upgradedConfiguration = { rulesetVersion: "tear-rules-unit", values: { gravity: 1.12 } };

    const initial = captureLiveStateForgeSnapshot(input(staticBuild, initialConfiguration));
    const upgraded = captureLiveStateForgeSnapshot(input(staticBuild, upgradedConfiguration));

    expect(upgraded.provenance.build).toMatchObject(staticBuild);
    expect(upgraded.provenance.build.configHash).toBe(stableVerificationHash(upgradedConfiguration));
    expect(upgraded.provenance.build.configHash).not.toBe(initial.provenance.build.configHash);
  });
});
