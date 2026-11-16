// The size rule for painted backgrounds (docs/BACKGROUND_WORKFLOW.md, "Size
// rule"): the parts that need pixels or a built folder. The per-scene limits
// themselves are in scene-contract.test.ts.
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import sharp from "sharp";
import { afterAll, describe, expect, it } from "vitest";
import { validateScenePackage } from "../../src/presentation/scenes/scene-contract";
import { hiddenDetail, hiddenMask, layersOver, softenHidden } from "../../scripts/scene/hidden-paint.mjs";
import {
  builtStorefrontArt,
  declaredStorefrontArt,
  FIXTURE_SCENES_ROOT,
  SCENES_ROOT,
  sceneDirectories,
  storefrontBudget,
} from "../../scripts/scene/package-files.mjs";
import { likeness, pixelChecks } from "../../scripts/scene/pixel-checks.mjs";
import { fixturePackage } from "./scene-fixture";

const scratch = mkdtempSync(join(tmpdir(), "tear-scene-size-"));
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

const scene = {
  world: { width: 1600, height: 900, groundY: 800 },
  camera: { playerShift: 48, zoomMin: 1, zoomMax: 1.2, shake: 24 },
};

/** Deterministic busy paint: every pixel differs from its neighbours. */
function paint(width: number, height: number, alpha: (x: number, y: number) => number = () => 255) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const at = (y * width + x) * 4;
      data[at] = (x * 37 + y * 91) % 256;
      data[at + 1] = (x * 53 + y * 17) % 256;
      data[at + 2] = (x * 11 + y * 67) % 256;
      data[at + 3] = alpha(x, y);
    }
  }
  return { data, width, height };
}

describe("nothing painted twice", () => {
  // A far layer across the arena, and a nearer trunk covering its left 600 world units.
  const far = { ...paint(400, 225), rect: [0, 0, 1600, 900] as const, depth: 0.85 };
  const trunk = { ...paint(150, 225), rect: [0, 0, 600, 900] as const, depth: 1.08 };
  const hidden = hiddenMask(scene, far, [trunk]);
  const at = (worldX: number, worldY: number) => hidden[Math.floor(worldY / 4) * 400 + Math.floor(worldX / 4)];

  it("finds the paint a nearer layer covers for every camera, and nothing else", () => {
    expect(at(200, 450)).toBe(1);
    expect(at(300, 300)).toBe(1);
    // Within reach of the trunk's edge as the camera zooms, shakes and slides: can show.
    expect(at(590, 450)).toBe(0);
    expect(at(580, 450)).toBe(0);
    // Far enough inside that no camera brings the edge to it.
    expect(at(520, 450)).toBe(1);
    // Never under the trunk.
    expect(at(900, 450)).toBe(0);
    // The trunk's own outer edges give no cover beyond them.
    expect(at(8, 450)).toBe(0);
    expect(at(200, 8)).toBe(0);
  });

  it("counts only fully opaque nearer paint as cover", () => {
    const glass = { ...trunk, ...paint(150, 225, () => 254) };
    expect(hiddenMask(scene, far, [glass]).some((value) => value === 1)).toBe(false);
    const holed = { ...trunk, ...paint(150, 225, (x, y) => (x === 50 && y === 112 ? 0 : 255)) };
    const mask = hiddenMask(scene, far, [holed]);
    // The hole is at world (202, 450): the paint behind it stays, the paint far from it goes.
    expect(mask[Math.floor(450 / 4) * 400 + Math.floor(202 / 4)]).toBe(0);
    expect(mask[Math.floor(200 / 4) * 400 + Math.floor(380 / 4)]).toBe(1);
  });

  it("softens hidden paint and leaves the rest and the alpha untouched", async () => {
    const before = await hiddenDetail(far, hidden);
    expect(before.share).toBeGreaterThan(0.15);
    expect(before.detail).toBeGreaterThan(20);
    const softened = await softenHidden(far, hidden);
    const after = await hiddenDetail(softened, hidden);
    expect(after.detail).toBeLessThan(before.detail / 4);
    for (let index = 0; index < hidden.length; index += 1) {
      expect(softened.data[index * 4 + 3]).toBe(255);
      if (hidden[index] === 0) expect(softened.data[index * 4]).toBe(far.data[index * 4]);
    }
  });

  it("treats layers drawn later, at full opacity, as the ones that can cover", () => {
    const layers = [
      { id: "far", plane: "back", opacity: 1 },
      { id: "roots", plane: "front", opacity: 1 },
      { id: "frame", plane: "back", opacity: 1 },
      { id: "mist", plane: "back", opacity: 0.5 },
    ] as never[];
    expect(layersOver({ layers }, layers[0] as never).map((layer) => layer.id)).toEqual(["frame", "roots"]);
    expect(layersOver({ layers }, layers[1] as never)).toEqual([]);
  });
});

describe("pixel checks", () => {
  it("scores identical planes 1 and different planes lower", () => {
    const plane = Float32Array.from({ length: 64 * 64 }, (_value, index) => (index * 37) % 256);
    expect(likeness(plane, plane, 64, 64)).toBeCloseTo(1, 6);
    expect(
      likeness(
        plane,
        plane.map((value) => 255 - value),
        64,
        64,
      ),
    ).toBeLessThan(0.5);
  });

  it("rejects an alpha plane with nothing see-through, and an opaque image that stores one", async () => {
    const directory = join(scratch, "alpha");
    mkdirSync(directory);
    const opaque = paint(64, 64);
    const raw = { raw: { width: 64, height: 64, channels: 4 as const } };
    for (const file of ["far.avif", "stone.avif", "roots.avif"])
      await sharp(Buffer.from(opaque.data.buffer), raw).avif({ quality: 60 }).toFile(join(directory, file));
    const manifest = fixturePackage();
    const images = (manifest.images as { id: string; width: number; height: number }[]).map((image) => ({
      ...image,
      width: 64,
      height: 64,
    }));
    const layers = [
      { id: "far", image: "far", rect: [-400, -300, 2400, 1500], depth: 0.8, plane: "back", covers: true },
      { id: "roots", image: "roots", rect: [-60, 830, 400, 100], depth: 1, plane: "front" },
    ];
    const report = await pixelChecks(directory, validateScenePackage(fixturePackage({ images, layers })));
    // The fixture declares roots with alpha and far/stone without; all three files hold an opaque alpha plane.
    expect(report.problems).toEqual([
      expect.stringMatching(/far\.avif: the manifest says opaque but the file stores an alpha plane/u),
      expect.stringMatching(/stone\.avif: the manifest says opaque/u),
      expect.stringMatching(/roots\.avif: stores an alpha plane but every pixel is opaque/u),
    ]);
  });
});

describe("scene art share of a release build", () => {
  const shipped = sceneDirectories(false, [SCENES_ROOT]);

  it.each(["standalone", "crazygames"])("%s: the shipped packages fit the build's share", (target) => {
    const report = declaredStorefrontArt(target);
    expect(report.problems).toEqual([]);
    expect(report.packages.map((item) => item.name)).toEqual(shipped.map((directory) => basename(directory)));
    expect(report.bytes).toBeLessThanOrEqual(storefrontBudget(target).shareBytes);
  });

  it("fails when the packages declare more than the share", () => {
    const report = declaredStorefrontArt("crazygames", { shareBytes: 1000 });
    expect(report.problems).toEqual([expect.stringMatching(/over this build's share of 1000/u)]);
  });

  it("checks what a built folder really holds", () => {
    const dist = join(scratch, "dist");
    const assets = join(dist, "assets");
    mkdirSync(assets, { recursive: true });
    for (const directory of shipped)
      for (const file of readdirSync(directory).filter((name) => name.endsWith(".avif")))
        cpSync(join(directory, file), join(assets, `${basename(directory)}-${file.replace(".avif", "-hash.avif")}`));
    const clean = builtStorefrontArt("crazygames", dist);
    expect(clean.problems).toEqual([]);
    expect(clean.bytes).toBe(declaredStorefrontArt("crazygames").bytes);
    expect(builtStorefrontArt("crazygames", dist, { shareBytes: 1000 }).problems).toEqual([
      expect.stringMatching(/over its share of 1000/u),
    ]);
    // A test fixture's image, an image no package lists, and a missing image each fail the build.
    const fixture = sceneDirectories(false, [FIXTURE_SCENES_ROOT])[0];
    if (fixture === undefined) throw new Error("no fixture package");
    cpSync(join(fixture, "far.avif"), join(assets, "pale-far.avif"));
    writeFileSync(join(assets, "stray.avif"), "not a scene image");
    const first = readdirSync(assets).find((name) => name.endsWith("-hash.avif"));
    if (first === undefined) throw new Error("no shipped scene image");
    rmSync(join(assets, first));
    expect(builtStorefrontArt("crazygames", dist).problems).toEqual([
      expect.stringMatching(/test fixture image pale-traverse\/far\.avif/u),
      expect.stringMatching(/stray\.avif is an AVIF image no scene package lists/u),
      expect.stringMatching(/build is missing/u),
    ]);
  });
});
