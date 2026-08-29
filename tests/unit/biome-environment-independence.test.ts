import { describe, expect, it } from "vitest";

import { createEnvironmentRuntime } from "../../src/gameplay/environment/environment-runtime";
import { BLOOM_WELL_TIMING, BLOOM_WELL_VALIDATION, createBloomWellState } from "../../src/gameplay/environment/bloom-well";
import { PALE_TRACK_VALIDATION, createAuroraTrackFieldState } from "../../src/gameplay/environment/aurora-track";
import { createVerdantEnvironmentFeature } from "../../src/gameplay/environment/verdant-environment-feature";
import { createPaleEnvironmentFeature } from "../../src/gameplay/environment/pale-environment-feature";

describe("biome environment architectural siblinghood", () => {
  it("constructs and advances Pale directly in a fresh world with no Verdant feature", () => {
    const runtime = createEnvironmentRuntime({ stageId: "pale-traverse", worldId: "pale-fresh",
      features: [createPaleEnvironmentFeature()], validators: [PALE_TRACK_VALIDATION] });
    runtime.addField(createAuroraTrackFieldState({ id: "pale-fresh:track", ownerId: "pale-traverse", variant: "stage",
      direction: 1, geometry: { x: 0, y: 640, w: 600, h: 60 }, startTick: 0 }));
    runtime.step(84, 1 / 120, () => undefined, new Set(["pale-traverse"]));
    expect(runtime.fields()[0]).toMatchObject({ kind: "aurora-track", state: "active" });
    expect(runtime.snapshot().worldId).toBe("pale-fresh");
  });

  it("constructs and advances Verdant with Pale entirely disabled", () => {
    const runtime = createEnvironmentRuntime({ stageId: "verdant-sanctum", worldId: "verdant-fresh",
      features: [createVerdantEnvironmentFeature()], validators: [BLOOM_WELL_VALIDATION] });
    runtime.addField(createBloomWellState({ id: "verdant-fresh:well", ownerId: "verdant-sanctum", variant: "stage",
      geometry: { x: 100, y: 400, radius: 90 }, patternId: "fresh-world" }, 0));
    runtime.step(BLOOM_WELL_TIMING.warningTicks, 1 / 120, () => undefined, new Set(["verdant-sanctum"]));
    expect(runtime.fields()[0]).toMatchObject({ kind: "bloom-well", state: "active" });
    expect(runtime.fields().some((field) => field.kind === "aurora-track")).toBe(false);
  });

  it("keeps sibling feature state isolated across simultaneous worlds", () => {
    const verdant = createEnvironmentRuntime({ stageId: "verdant-sanctum", worldId: "verdant-isolated",
      features: [createVerdantEnvironmentFeature()] });
    const pale = createEnvironmentRuntime({ stageId: "pale-traverse", worldId: "pale-isolated",
      features: [createPaleEnvironmentFeature()] });
    verdant.addField(createBloomWellState({ id: "isolated:well", ownerId: "verdant-sanctum", variant: "stage",
      geometry: { x: 0, y: 0, radius: 50 }, patternId: "isolated-world" }, 0));
    pale.addField(createAuroraTrackFieldState({ id: "isolated:track", ownerId: "pale-traverse", variant: "stage",
      direction: -1, geometry: { x: 0, y: 0, w: 200, h: 50 }, startTick: 0 }));
    verdant.step(BLOOM_WELL_TIMING.warningTicks, 1 / 120, () => undefined);
    pale.step(84, 1 / 120, () => undefined);
    expect(verdant.fields().map((field) => field.kind)).toEqual(["bloom-well"]);
    expect(pale.fields().map((field) => field.kind)).toEqual(["aurora-track"]);
  });
});
