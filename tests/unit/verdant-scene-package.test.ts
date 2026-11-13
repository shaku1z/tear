import { describe, expect, it } from "vitest";
import rawPackage from "../../src/presentation/assets/verdant-calibration/scene-package.json";
import control from "../../src/presentation/assets/verdant-calibration/control-package.json";
import overscan from "../../src/presentation/assets/verdant-calibration/overscan-package.json";
import living from "../../src/presentation/assets/verdant-calibration/living-stage-package.json";
import {
  validateVerdantScenePackage,
  VERDANT_SCENE_MAX_DECODED_BYTES,
  VERDANT_PROTOTYPE_MAX_DECODED_BYTES,
} from "../../src/presentation/verdant-scene-package";

const prototype = {
  ...overscan,
  id: "verdant-living-stage-prototype",
  water: undefined,
  assets: [
    ...overscan.assets.slice(0, 6),
    {
      id: "structure-top",
      key: "structure-top",
      sha256: "c80afe4f99b2324d67ac702c9ccf93c8b269aeb57c1432f33d9e347f449eb832",
      width: 1672,
      height: 471,
      alpha: "opaque",
    },
    {
      id: "structure-bottom",
      key: "structure-bottom",
      sha256: "5edccaf92b2b9f911a4613e823d12eba8ea5cdbe015a6e26da56658e41429c7a",
      width: 1672,
      height: 470,
      alpha: "opaque",
    },
    {
      id: "foliage",
      key: "foliage",
      sha256: "70dfb0d6e5e31218c78fd712396ce3b433823477fe36a62ad56a61e17e9d708f",
      width: 1672,
      height: 623,
      alpha: "straight",
    },
  ],
  layers: [
    ...overscan.layers.slice(0, 6),
    ...["structure-top", "structure-bottom", "foliage"].map((id, index) => ({
      id,
      assetId: id,
      rect: index === 0 ? [0, 0, 1672, 471] : index === 1 ? [0, 471, 1672, 470] : [0, 0, 1672, 623],
      order: index + 6,
      purpose: index === 2 ? "foliage" : "support",
      motion: { kind: "static", maxDisplacement: [0, 0] },
    })),
  ],
};

const asset = (overrides: Record<string, unknown>) => ({
  ...rawPackage,
  assets: rawPackage.assets.map((value, index) => (index === 0 ? { ...value, ...overrides } : value)),
});
const layer = (overrides: Record<string, unknown>) => ({
  ...rawPackage,
  layers: rawPackage.layers.map((value, index) => (index === 0 ? { ...value, ...overrides } : value)),
});

describe("Verdant IN2 registered package contract", () => {
  it("admits the separate static living-stage prototype under only its approved budget", () => {
    const animated = validateVerdantScenePackage(living);
    expect(animated.layers[8]?.motion).toBe("anchored-foliage");
    expect(animated.assets).toEqual(validateVerdantScenePackage(prototype).assets);
    const parsed = validateVerdantScenePackage(prototype);
    expect(parsed.assets.reduce((sum, entry) => sum + entry.width * entry.height * 4, 0)).toBe(12359040);
    expect(parsed.layers[8]?.purpose).toBe("foliage");
    expect(VERDANT_SCENE_MAX_DECODED_BYTES).toBe(8388608);
    expect(VERDANT_PROTOTYPE_MAX_DECODED_BYTES).toBe(16777216);
    expect(() => validateVerdantScenePackage({ ...prototype, id: overscan.id })).toThrow("budget");
  });
  it.each([
    ["pool outside liquid envelope", { ...living, poolRefraction: { ...living.poolRefraction, minimumRow: 0 } }],
    ["excessive pool refraction", { ...living, poolRefraction: { ...living.poolRefraction, maxDisplacement: 9 } }],
    [
      "excessive vertical refraction",
      { ...living, poolRefraction: { ...living.poolRefraction, maxVerticalDisplacement: 3 } },
    ],
    ["unregistered packet period", { ...living, poolRefraction: { ...living.poolRefraction, packetPeriod: 25 } }],
    [
      "unregistered pool component",
      { ...living, poolRefraction: { ...living.poolRefraction, component: "all-openings" } },
    ],
    ["unregistered pool mask", { ...living, poolRefraction: { ...living.poolRefraction, maskSHA256: "0".repeat(64) } }],
    ["pool on old comparison", { ...overscan, poolRefraction: living.poolRefraction }],
    [
      "opaque foliage",
      {
        ...prototype,
        assets: prototype.assets.map((entry) => (entry.key === "foliage" ? { ...entry, alpha: "opaque" } : entry)),
      },
    ],
    [
      "moved foliage",
      {
        ...prototype,
        layers: prototype.layers.map((entry) =>
          entry.assetId === "foliage" ? { ...entry, rect: [0, 1, 1672, 623] } : entry,
        ),
      },
    ],
    [
      "unregistered foliage motion",
      {
        ...prototype,
        layers: prototype.layers.map((entry) =>
          entry.assetId === "foliage" ? { ...entry, motion: { kind: "bend", maxDisplacement: [2, 0] } } : entry,
        ),
      },
    ],
    ["old tail assets", { ...overscan, id: prototype.id, water: undefined }],
    ["old water receiver", { ...prototype, water: overscan.water }],
  ])("rejects prototype %s", (_label, candidate) => {
    expect(() => validateVerdantScenePackage(candidate)).toThrow();
  });
  it("admits bounded IN3 exterior without changing the IN2 center assets", () => {
    const parsed = validateVerdantScenePackage(overscan);
    expect(parsed.layers).toHaveLength(9);
    expect(parsed.assets.slice(6, 8)).toEqual(validateVerdantScenePackage(rawPackage).assets.slice(0, 2));
    expect(parsed.layers.slice(6).map((entry) => entry.rect)).toEqual(rawPackage.layers.map((entry) => entry.rect));
    expect(parsed.assets.reduce((sum, entry) => sum + entry.width * entry.height * 4, 0)).toBe(8297392);
  });
  it.each([
    ["missing exterior", { ...overscan, assets: overscan.assets.slice(1) }],
    [
      "misregistered exterior",
      {
        ...overscan,
        layers: overscan.layers.map((entry, index) =>
          index === 0 ? { ...entry, rect: [-383, -1408, 1220, 1408] } : entry,
        ),
      },
    ],
    ["exterior in old package", { ...overscan, id: rawPackage.id }],
    [
      "reordered center",
      { ...overscan, layers: overscan.layers.map((entry, index) => (index === 6 ? { ...entry, order: 7 } : entry)) },
    ],
    [
      "moved tail",
      {
        ...overscan,
        layers: overscan.layers.map((entry) =>
          entry.assetId === "tail-motion" ? { ...entry, rect: [1474, 330, 50, 50] } : entry,
        ),
      },
    ],
    [
      "unsafe bend",
      {
        ...overscan,
        layers: overscan.layers.map((entry) =>
          entry.assetId === "tail-motion" ? { ...entry, motion: { ...entry.motion, maxDisplacement: [3, 0] } } : entry,
        ),
      },
    ],
    [
      "dry water receiver",
      {
        ...overscan,
        water: {
          ...overscan.water,
          receiver: [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
          ],
        },
      },
    ],
    ["unapproved source", { ...overscan, approvedSourceSHA256: "0".repeat(64) }],
  ])("rejects IN3 %s", (_label, candidate) => {
    expect(() => validateVerdantScenePackage(candidate)).toThrow();
  });
  it("accepts layered and control packages as immutable snapshots", () => {
    const parsed = validateVerdantScenePackage(rawPackage);
    expect(parsed.layers).toHaveLength(3);
    expect(validateVerdantScenePackage(control).layers).toHaveLength(2);
    expect(Object.isFrozen(parsed.assets[0])).toBe(true);
    expect(Object.isFrozen(parsed.layers[0]?.rect)).toBe(true);
    expect(parsed.layers[0]?.rect).not.toBe(rawPackage.layers[0]?.rect);
  });
  it.each([
    ["wrong stage", { ...rawPackage, stageId: "pale-traverse" }],
    ["unknown format", { ...rawPackage, version: 2 }],
    ["wrong frame", { ...rawPackage, authoredSize: [1600, 900] }],
    ["path traversal", asset({ key: "../tail.png" })],
    ["bad digest", asset({ sha256: "x" })],
    ["oversize", asset({ width: 999999 })],
    ["alpha mismatch", asset({ alpha: "straight" })],
    ["duplicate asset", { ...rawPackage, assets: [rawPackage.assets[0], rawPackage.assets[0], rawPackage.assets[2]] }],
    ["missing reference", layer({ assetId: "missing" })],
    ["nonfinite placement", layer({ rect: [Number.NaN, 0, 1672, 471] })],
    ["out of bounds", layer({ rect: [-1, 0, 1672, 471] })],
    ["missing support", layer({ rect: [0, 1, 1672, 471] })],
    ["wrong order", layer({ order: 2 })],
    ["unknown motion", layer({ motion: { kind: "mesh", maxDisplacement: [0, 0] } })],
    ["nonzero static motion", layer({ motion: { kind: "static", maxDisplacement: [1, 0] } })],
    ["missing tail", { ...rawPackage, layers: rawPackage.layers.slice(0, 2) }],
  ])("rejects %s", (_label, candidate) => {
    expect(() => validateVerdantScenePackage(candidate)).toThrow();
  });
});
