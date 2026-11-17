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
  const values = new Map<PropertyKey, unknown>();
  const context = new Proxy(
    {},
    {
      get: (_target, key) =>
        values.has(key)
          ? values.get(key)
          : key === "createLinearGradient"
            ? () => gradient
            : () => {
                calls.push(String(key));
              },
      set: (_target, key, value) => {
        values.set(key, value);
        calls.push(`${String(key)}:${String(value)}`);
        return true;
      },
    },
  ) as unknown as CanvasRenderingContext2D;
  return { calls, context };
}

describe("Verdant environment presentation", () => {
  it("separates default Bloom warning and active rings without altering cooldown or high contrast", () => {
    const geometry = Object.freeze({ x: 100, y: 200, w: 120, h: 360 });
    for (const state of ["warning", "active", "cooldown", "dormant"] as const) {
      for (const highContrast of [false, true])
        for (const lowGraphics of [false, true]) {
          const value = recorder(),
            ellipses: unknown[][] = [];
          value.context.ellipse = (...args) => {
            ellipses.push(args);
          };
          const facts = projectBloomWellPresentation(
            { id: "well", state, geometry },
            {
              highContrast,
              lowGraphics,
              reducedMotion: true,
              flashScale: 0,
            },
          );
          const before = JSON.stringify(facts);
          renderBloomWellPresentation(value.context, facts, 4);
          expect(ellipses).toEqual(state === "dormant" ? [] : [[160, 560, 60, 13.2, 0, 0, Math.PI * 2]]);
          expect(value.calls.includes("strokeStyle:#10251e")).toBe(
            !highContrast && (state === "warning" || state === "active"),
          );
          expect(value.calls.filter((call) => call === "stroke").length).toBe(
            state === "dormant" ? 0 : !highContrast && state !== "cooldown" ? 2 : 1,
          );
          expect(JSON.stringify(facts)).toBe(before);
        }
    }
  });

  it("keeps Bloom warning geometry visible without motion, detail, or audio", () => {
    const value = recorder();
    const well = createBloomWellState({
      id: "well",
      ownerId: "verdant-sanctum",
      variant: "stage",
      geometry: { x: 100, y: 200, w: 120, h: 360 },
      patternId: "left",
    });
    renderBloomWellPresentation(
      value.context,
      projectBloomWellPresentation(well, {
        highContrast: true,
        reducedMotion: true,
        lowGraphics: true,
        audioEnabled: false,
        flashScale: 0,
      }),
      4,
    );
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
      combatObjects: Object.freeze([
        Object.freeze({
          id: "graft",
          kind: "graft-anchor",
          state: "warning",
          geometry: Object.freeze({ x: 300, y: 400, radius: 24 }),
          integrityRatio: 0.5,
          counterplayTags: Object.freeze(["cut"]),
        }),
      ]),
      routes: Object.freeze([
        Object.freeze({
          id: "regrowth",
          kind: "regrowth-link",
          state: "active",
          points: Object.freeze([Object.freeze({ x: 0, y: 0 }), Object.freeze({ x: 100, y: 100 })]),
        }),
      ]),
    });
    renderVerdantEnvironmentPresentation(value.context, snapshot, {
      highContrast: true,
      reducedMotion: true,
      lowGraphics: true,
      timeSeconds: 3,
      flashScale: 0,
    });
    expect(value.calls).toContain("arc");
    expect(value.calls.filter((entry) => entry === "stroke").length).toBeGreaterThanOrEqual(3);
    expect(value.calls).toContain("strokeStyle:#ffffff");
    expect(snapshot.combatObjects[0]).toMatchObject({ state: "warning", integrityRatio: 0.5 });
  });

  it("derives distinct intact, damaged, destroyed, and expired Graft scars from immutable facts", () => {
    const renderState = (state: "active" | "destroyed" | "expired", integrityRatio: number) => {
      const value = recorder();
      const snapshot: EnvironmentPresentationSnapshot = Object.freeze({
        stageId: "verdant-sanctum",
        fields: Object.freeze([]),
        routes: Object.freeze([]),
        combatObjects: Object.freeze([
          Object.freeze({
            id: `graft-${state}`,
            kind: "graft-anchor",
            state,
            geometry: Object.freeze({ x: 300, y: 400, radius: 24 }),
            integrityRatio,
            counterplayTags: Object.freeze(["cut"]),
            graftType: "bastion" as const,
          }),
        ]),
      });
      renderVerdantEnvironmentPresentation(value.context, snapshot, {
        highContrast: true,
        reducedMotion: true,
        lowGraphics: false,
        timeSeconds: 3,
        flashScale: 0,
      });
      expect(snapshot.combatObjects[0]).toMatchObject({ state, integrityRatio });
      return value.calls;
    };
    const intact = renderState("active", 1);
    const damaged = renderState("active", 0.45);
    const destroyed = renderState("destroyed", 0);
    const expired = renderState("expired", 0);
    expect(intact.filter((entry) => entry === "stroke").length).toBeGreaterThanOrEqual(5);
    expect(damaged.filter((entry) => entry === "stroke").length).toBeGreaterThan(
      intact.filter((entry) => entry === "stroke").length,
    );
    expect(destroyed).not.toContain("fill");
    expect(destroyed.filter((entry) => entry === "stroke")).toHaveLength(5);
    expect(expired.filter((entry) => entry === "stroke")).toHaveLength(1);
  });

  it("keeps the three Graft questions distinguishable without motion or audio", () => {
    const value = recorder();
    const graft = (id: string, graftType: "bastion" | "mercy" | "haste", x: number) =>
      Object.freeze({
        id,
        kind: "graft-anchor",
        state: "active" as const,
        graftType,
        effect: "effect",
        geometry: Object.freeze({ x, y: 400, radius: 24 }),
        integrityRatio: 1,
        counterplayTags: Object.freeze(["cut"]),
        connectionGeometry: Object.freeze({
          x: 800,
          y: 500,
          points: Object.freeze([Object.freeze({ x: 800, y: 500 }), Object.freeze({ x, y: 400 })]),
        }),
      });
    renderVerdantEnvironmentPresentation(
      value.context,
      Object.freeze({
        stageId: "verdant-sanctum",
        fields: Object.freeze([]),
        routes: Object.freeze([]),
        combatObjects: Object.freeze([
          graft("bastion", "bastion", 300),
          graft("mercy", "mercy", 600),
          graft("haste", "haste", 900),
        ]),
      }),
      { highContrast: false, reducedMotion: true, lowGraphics: true, timeSeconds: 3, flashScale: 0 },
    );
    expect(value.calls).toContain("fillStyle:#6f8f78");
    expect(value.calls).toContain("fillStyle:#d4b85f");
    expect(value.calls).toContain("fillStyle:#91bf62");
    expect(value.calls).toContain("strokeRect");
    expect(value.calls).toContain("arc");
  });

  it("keeps Root Cage warning and sever geometry visible in reduced low-graphics presentation", () => {
    const value = recorder();
    renderVerdantEnvironmentPresentation(
      value.context,
      Object.freeze({
        stageId: "verdant-sanctum",
        fields: Object.freeze([]),
        routes: Object.freeze([]),
        combatObjects: Object.freeze([
          Object.freeze({
            id: "root-cage:left",
            kind: "root-link",
            state: "warning" as const,
            geometry: Object.freeze({ x: 300, y: 620, w: 56, h: 180 }),
            integrityRatio: 1,
            counterplayTags: Object.freeze(["cut", "break"]),
            rootCageId: "root-cage",
            boundarySide: "left" as const,
            response: "sever-either-boundary" as const,
          }),
        ]),
      }),
      { highContrast: true, reducedMotion: true, lowGraphics: true, timeSeconds: 0, flashScale: 0 },
    );
    expect(value.calls).toEqual(
      expect.arrayContaining(["strokeRect", "beginPath", "moveTo", "lineTo", "stroke", "strokeStyle:#ffffff"]),
    );
    expect(value.calls).not.toContain("fillRect");
  });

  it("does not draw Verdant-only boss facts in another stage", () => {
    const value = recorder();
    renderVerdantEnvironmentPresentation(
      value.context,
      {
        stageId: "grounds",
        fields: [],
        combatObjects: [],
        routes: [],
      },
      { highContrast: false, reducedMotion: false, lowGraphics: false, timeSeconds: 0, flashScale: 1 },
    );
    expect(value.calls).toEqual([]);
  });

  it("keeps canonical environment identity unchanged across presentation modes", () => {
    const environment = createEnvironmentRuntime({ stageId: "verdant-sanctum", worldId: "presentation-hash" });
    environment.addField(
      createBloomWellState({
        id: "well",
        ownerId: "verdant-sanctum",
        variant: "stage",
        geometry: { x: 100, y: 200, w: 120, h: 360 },
        patternId: "left",
      }),
    );
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
