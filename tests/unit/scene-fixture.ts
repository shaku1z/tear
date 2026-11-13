/** A small valid scene package used by the scene contract and library tests. */
const digest = "a".repeat(64);

export function fixturePackage(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    format: "tear-scene-package",
    version: 1,
    id: "fixture",
    stageId: "fixture-stage",
    title: "Fixture",
    world: { width: 1600, height: 900, groundY: 800 },
    camera: { playerShift: 40, zoomMin: 0.9, zoomMax: 1.2, shake: 12 },
    edge: { color: "#102018", feather: 40 },
    theme: { paper: "#203a30" },
    palette: { glow: "#fff2b0" },
    sources: [
      {
        id: "painting",
        description: "Owner painting",
        origin: "owner-supplied",
        licence: "Owner-owned",
        sha256: digest,
      },
      {
        id: "plate",
        description: "Cut plate",
        origin: "derived",
        licence: "Owner-owned",
        sha256: digest,
        derivedFrom: ["painting"],
      },
    ],
    images: [
      {
        id: "far",
        file: "far.webp",
        width: 2000,
        height: 1200,
        alpha: false,
        bytes: 1000,
        sha256: digest,
        sources: ["plate"],
      },
      {
        id: "stone",
        file: "stone.webp",
        width: 600,
        height: 100,
        alpha: false,
        bytes: 100,
        sha256: digest,
        sources: ["painting"],
      },
      {
        id: "roots",
        file: "roots.webp",
        width: 400,
        height: 100,
        alpha: true,
        bytes: 100,
        sha256: digest,
        sources: ["painting"],
      },
    ],
    layers: [
      { id: "far", image: "far", rect: [-400, -300, 2400, 1500], depth: 0.8, plane: "back", covers: true },
      { id: "roots", image: "roots", rect: [-60, 830, 400, 100], depth: 1, plane: "front" },
    ],
    shading: [
      {
        id: "hud-row",
        kind: "band",
        rect: [-400, -300, 2400, 420],
        depth: 0.8,
        color: "#06140f",
        opacity: 0.5,
        feather: 80,
      },
    ],
    platforms: {
      material: "fixture-stone",
      texture: "stone",
      scale: 0.5,
      fill: "#0a1a12",
      shadow: { color: "#04110c", opacity: 0.5, length: 40 },
    },
    decodedBudget: 16 * 1024 * 1024,
    ...overrides,
  };
}
