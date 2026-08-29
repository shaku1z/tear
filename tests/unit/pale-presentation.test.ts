import { describe, expect, it } from "vitest";

import { createAuroraTrackFieldState } from "../../src/gameplay/environment/aurora-track";
import { createEnvironmentRuntime } from "../../src/gameplay/environment/environment-runtime";
import { buildEnvironmentPresentationSnapshot } from "../../src/gameplay/environment/presentation-snapshot";
import {
  PALE_TRACK_PRESENTATION_LIMITS,
  renderPaleEnvironmentPresentation,
} from "../../src/presentation/environment/pale-environment-presentation";
import { environmentHash } from "../../src/tearbench/environment-codec";

function recorder() {
  const calls: string[] = [];
  const context = new Proxy({}, {
    get: (_target, key) => () => { calls.push(String(key)); },
    set: (_target, key, value) => { calls.push(`${String(key)}:${String(value)}`); return true; },
  }) as unknown as CanvasRenderingContext2D;
  return { calls, context };
}

function environment(direction: -1 | 1 = 1) {
  const runtime = createEnvironmentRuntime({ stageId: "pale-traverse", worldId: "pale-presentation" });
  runtime.addField(createAuroraTrackFieldState({
    id: "pale-track", ownerId: "pale-traverse", variant: "stage", direction,
    geometry: { x: 100, y: 620, w: 560, h: 72 }, startTick: 0,
  }));
  return runtime;
}

describe("Pale environment presentation", () => {
  it("projects and renders route-first direction from immutable Aurora facts", () => {
    const runtime = environment(-1), value = recorder();
    const snapshot = buildEnvironmentPresentationSnapshot(runtime.snapshot());
    expect(snapshot.fields[0]).toMatchObject({ kind: "aurora-track", direction: -1, variant: "stage" });
    renderPaleEnvironmentPresentation(value.context, snapshot, {
      highContrast: false, reducedMotion: true, lowGraphics: false, timeSeconds: 3, flashScale: 0,
    });
    expect(value.calls).toEqual(expect.arrayContaining([
      "fillRect", "strokeRect", "moveTo", "lineTo", "stroke", "strokeStyle:#ef8da8",
    ]));
    expect(value.calls.filter((call) => call === "stroke").length).toBeLessThanOrEqual(
      PALE_TRACK_PRESENTATION_LIMITS.chevronsPerTrack,
    );
  });

  it("keeps static high-contrast arrows under reduced low-graphics settings", () => {
    const runtime = environment(), value = recorder();
    renderPaleEnvironmentPresentation(value.context, buildEnvironmentPresentationSnapshot(runtime.snapshot()), {
      highContrast: true, reducedMotion: true, lowGraphics: true, timeSeconds: 99, flashScale: 0,
    });
    expect(value.calls).toEqual(expect.arrayContaining([
      "fillStyle:#4b00d1", "strokeStyle:#ffffff", "strokeStyle:#fff36b", "strokeRect",
    ]));
    expect(value.calls.filter((call) => call === "stroke")).toHaveLength(
      PALE_TRACK_PRESENTATION_LIMITS.lowGraphicsChevronsPerTrack,
    );
  });

  it("does not draw in another stage or mutate canonical environment state", () => {
    const runtime = environment(), before = environmentHash(runtime.snapshot());
    const value = recorder();
    renderPaleEnvironmentPresentation(value.context, {
      ...buildEnvironmentPresentationSnapshot(runtime.snapshot()), stageId: "grounds",
    }, { highContrast: false, reducedMotion: false, lowGraphics: false, timeSeconds: 5, flashScale: 1 });
    expect(value.calls).toEqual([]);
    expect(environmentHash(runtime.snapshot())).toBe(before);
  });
});
