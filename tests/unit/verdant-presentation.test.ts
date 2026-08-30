import { describe, expect, it } from "vitest";

import { projectBloomWellPresentation } from "../../src/gameplay/environment/bloom-well-presentation-facts";
import type { EnvironmentPresentationSnapshot } from "../../src/gameplay/environment/presentation-snapshot";
import { renderBloomWellPresentation } from "../../src/presentation/environment/bloom-well-presentation";
import { renderVerdantEnvironmentPresentation } from "../../src/presentation/environment/verdant-environment-presentation";
import { createBloomWellState } from "../../src/gameplay/environment/bloom-well";
import { createEnvironmentRuntime } from "../../src/gameplay/environment/environment-runtime";
import { environmentHash } from "../../src/tearbench/environment-codec";

function recorder() {
  const calls: string[] = [];
  const gradient = { addColorStop: () => undefined };
  const context = new Proxy({}, {
    get: (_target, key) => key === "createLinearGradient" ? () => gradient : () => { calls.push(String(key)); },
    set: (_target, key, value) => { calls.push(`${String(key)}:${String(value)}`); return true; },
  }) as unknown as CanvasRenderingContext2D;
  return { calls, context };
}

describe("Verdant environment presentation", () => {
  it("keeps Bloom warning geometry visible without motion, detail, or audio", () => {
    const value = recorder();
    const well = createBloomWellState({ id: "well", ownerId: "verdant-sanctum", variant: "stage", geometry: { x: 100, y: 200, w: 120, h: 360 }, patternId: "left" });
    renderBloomWellPresentation(value.context, projectBloomWellPresentation(well, {
      highContrast: true, reducedMotion: true, lowGraphics: true, audioEnabled: false, flashScale: 0,
    }), 4);
    expect(value.calls).toContain("ellipse");
    expect(value.calls).toContain("stroke");
    expect(value.calls).toContain("strokeRect");
    expect(value.calls).not.toContain("translate");
  });

  it("renders Graft warnings and Regrowth routes from immutable facts", () => {
    const value = recorder();
    const snapshot: EnvironmentPresentationSnapshot = Object.freeze({
      stageId: "verdant-sanctum",
      fields: Object.freeze([]),
      combatObjects: Object.freeze([Object.freeze({
        id: "graft", kind: "graft-anchor", state: "warning", geometry: Object.freeze({ x: 300, y: 400, radius: 24 }), integrityRatio: 0.5, counterplayTags: Object.freeze(["cut"]),
      })]),
      routes: Object.freeze([Object.freeze({
        id: "regrowth", kind: "regrowth-link", state: "active", points: Object.freeze([Object.freeze({ x: 0, y: 0 }), Object.freeze({ x: 100, y: 100 })]),
      })]),
    });
    renderVerdantEnvironmentPresentation(value.context, snapshot, {
      highContrast: true, reducedMotion: true, lowGraphics: true, timeSeconds: 3, flashScale: 0,
    });
    expect(value.calls).toContain("arc");
    expect(value.calls.filter((entry) => entry === "stroke")).toHaveLength(3);
    expect(value.calls).toContain("strokeStyle:#ffffff");
    expect(snapshot.combatObjects[0]).toMatchObject({ state: "warning", integrityRatio: 0.5 });
  });

  it("keeps the three Graft questions distinguishable without motion or audio", () => {
    const value = recorder();
    const graft = (id: string, graftType: "bastion" | "mercy" | "haste", x: number) => Object.freeze({
      id, kind: "graft-anchor", state: "active" as const, graftType, effect: "effect",
      geometry: Object.freeze({ x, y: 400, radius: 24 }), integrityRatio: 1, counterplayTags: Object.freeze(["cut"]),
      connectionGeometry: Object.freeze({ x: 800, y: 500, points: Object.freeze([Object.freeze({ x: 800, y: 500 }), Object.freeze({ x, y: 400 })]) }),
    });
    renderVerdantEnvironmentPresentation(value.context, Object.freeze({
      stageId: "verdant-sanctum", fields: Object.freeze([]), routes: Object.freeze([]),
      combatObjects: Object.freeze([graft("bastion", "bastion", 300), graft("mercy", "mercy", 600), graft("haste", "haste", 900)]),
    }), { highContrast: false, reducedMotion: true, lowGraphics: true, timeSeconds: 3, flashScale: 0 });
    expect(value.calls).toContain("fillStyle:#6f8f78");
    expect(value.calls).toContain("fillStyle:#d4b85f");
    expect(value.calls).toContain("fillStyle:#91bf62");
    expect(value.calls).toContain("strokeRect");
    expect(value.calls).toContain("arc");
  });

  it("renders Rootline warning bounds before its active teeth", () => {
    const warning = recorder();
    const snapshot: EnvironmentPresentationSnapshot = Object.freeze({
      stageId: "verdant-sanctum",
      fields: Object.freeze([Object.freeze({
        id: "rootline", kind: "rootline", state: "warning", active: false,
        bounds: Object.freeze({ minX: 820, maxX: 1250, minY: 696, maxY: 800 }),
      })]),
      combatObjects: Object.freeze([]), routes: Object.freeze([]),
    });
    renderVerdantEnvironmentPresentation(warning.context, snapshot, {
      highContrast: false, reducedMotion: true, lowGraphics: true, timeSeconds: 0, flashScale: 0,
    });
    expect(warning.calls).toContain("strokeRect");
    expect(warning.calls).not.toContain("fill");

    const active = recorder();
    renderVerdantEnvironmentPresentation(active.context, {
      ...snapshot, fields: Object.freeze([Object.freeze({
        id: "rootline", kind: "rootline", state: "active", active: true,
        bounds: Object.freeze({ minX: 820, maxX: 1250, minY: 696, maxY: 800 }),
      })]),
    }, { highContrast: true, reducedMotion: true, lowGraphics: true, timeSeconds: 0, flashScale: 0 });
    expect(active.calls).toEqual(expect.arrayContaining(["strokeRect", "fill", "fillStyle:#ffffff"]));
  });

  it("keeps Root Cage warning and sever geometry visible in reduced low-graphics presentation", () => {
    const value = recorder();
    renderVerdantEnvironmentPresentation(value.context, Object.freeze({
      stageId: "verdant-sanctum", fields: Object.freeze([]), routes: Object.freeze([]),
      combatObjects: Object.freeze([Object.freeze({
        id: "root-cage:left", kind: "root-link", state: "warning" as const,
        geometry: Object.freeze({ x: 300, y: 620, w: 56, h: 180 }), integrityRatio: 1,
        counterplayTags: Object.freeze(["cut", "break"]), rootCageId: "root-cage", boundarySide: "left" as const,
        response: "sever-either-boundary" as const,
      })]),
    }), { highContrast: true, reducedMotion: true, lowGraphics: true, timeSeconds: 0, flashScale: 0 });
    expect(value.calls).toEqual(expect.arrayContaining(["strokeRect", "beginPath", "moveTo", "lineTo", "stroke", "strokeStyle:#ffffff"]));
    expect(value.calls).not.toContain("fillRect");
  });

  it("does not draw Verdant-only boss facts in another stage", () => {
    const value = recorder();
    renderVerdantEnvironmentPresentation(value.context, {
      stageId: "grounds", fields: [], combatObjects: [], routes: [],
    }, { highContrast: false, reducedMotion: false, lowGraphics: false, timeSeconds: 0, flashScale: 1 });
    expect(value.calls).toEqual([]);
  });

  it("keeps canonical environment identity unchanged across presentation modes", () => {
    const environment = createEnvironmentRuntime({ stageId: "verdant-sanctum", worldId: "presentation-hash" });
    environment.addField(createBloomWellState({
      id: "well", ownerId: "verdant-sanctum", variant: "stage",
      geometry: { x: 100, y: 200, w: 120, h: 360 }, patternId: "left",
    }));
    const before = environmentHash(environment.snapshot());
    for (const options of [
      { highContrast: false, reducedMotion: false, lowGraphics: false, audioEnabled: true, flashScale: 1 },
      { highContrast: true, reducedMotion: true, lowGraphics: true, audioEnabled: false, flashScale: 0 },
    ]) {
      const value = recorder();
      const field = environment.fields()[0];
      if (field === undefined) throw new Error("Bloom field is required");
      renderBloomWellPresentation(value.context, projectBloomWellPresentation(field, options), 4);
      expect(environmentHash(environment.snapshot())).toBe(before);
    }
  });
});
