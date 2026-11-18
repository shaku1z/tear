// MUSIC covers: covers.json is their one owner. Its files match it byte for byte at every size it
// lists, stay inside its limit and belong to real stages; covers ask for a painting only where a
// row exists; and the add tool keeps the manifest whole.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { coverFileName, COVERS_DIR, withCover } from "../../scripts/music-cover.mjs";
import { AUTHORED_STAGES } from "../../src/gameplay/stages";
import manifest from "../../src/presentation/assets/music-covers/covers.json";
import { buildMusicCollections } from "../../src/presentation/music-collections";
import {
  coverPainting,
  coverUrl,
  hasCoverPainting,
  resetCoverPaintings,
  stageCover,
} from "../../src/presentation/music-cover-art";
import type { SceneBitmap } from "../../src/presentation/scenes/scene-renderer";
import type { MusicSongView } from "../../src/presentation/screens/contracts";

const listed = manifest.covers.flatMap((cover) => cover.files);
const sha256 = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");

describe("music cover files", () => {
  it("are exactly the files the manifest lists, byte for byte", () => {
    expect(manifest.format).toBe("tear-music-covers");
    const onDisk = readdirSync(COVERS_DIR).filter((name) => name !== "covers.json");
    expect(onDisk.sort()).toEqual(listed.map((entry) => entry.file).sort());
    for (const entry of listed) {
      const bytes = readFileSync(join(COVERS_DIR, entry.file));
      expect(bytes.length, entry.file).toBe(entry.bytes);
      expect(sha256(bytes), entry.file).toBe(entry.sha256);
    }
  });

  it("stay inside the manifest's byte limit", () => {
    expect(listed.reduce((sum, entry) => sum + entry.bytes, 0)).toBeLessThanOrEqual(manifest.maxTotalBytes);
  });

  it("give each real stage at most one row, at every listed size, with where it came from", () => {
    const stageIds = new Set<string>(AUTHORED_STAGES.map((stage) => stage.id));
    const rows = manifest.covers.map((cover) => cover.stageId);
    expect(new Set(rows).size).toBe(rows.length);
    for (const cover of manifest.covers) {
      expect(stageIds.has(cover.stageId), cover.stageId).toBe(true);
      expect(cover.description.length, cover.stageId).toBeGreaterThan(0);
      expect(cover.licence.length, cover.stageId).toBeGreaterThan(0);
      expect(cover.source.sha256, cover.stageId).toMatch(/^[0-9a-f]{64}$/u);
      expect(cover.files.map((entry) => entry.size)).toEqual(manifest.sizes);
      for (const entry of cover.files) expect(entry.file).toBe(coverFileName(cover.stageId, entry.size));
    }
  });
});

// Every authored stage, campaign or not, as the collections picture it.
const FACTS = AUTHORED_STAGES.map((stage) => ({ id: stage.id, accent: stage.accent, glyph: stage.chapter.symbol }));

function song(id: string, stageId: string): MusicSongView {
  const stage = FACTS.find((entry) => entry.id === stageId);
  if (!stage) throw new Error(`no stage ${stageId}`);
  return {
    id,
    number: 1,
    title: id,
    where: "",
    art: stageCover(stage),
    seconds: null,
    previewing: false,
    playing: false,
  };
}

/** The first stage with a cover; the manifest always has one. */
function firstRow(): string {
  const [cover] = manifest.covers;
  if (!cover) throw new Error("covers.json lists no cover");
  return cover.stageId;
}

describe("music covers", () => {
  afterEach(() => {
    resetCoverPaintings();
  });

  it("name a stage's painting exactly when the manifest has its row", () => {
    const rows = new Set(manifest.covers.map((cover) => cover.stageId));
    for (const stage of FACTS) {
      expect(hasCoverPainting(stage.id), stage.id).toBe(rows.has(stage.id));
      const cover = stageCover(stage);
      expect(cover?.hues).toEqual([stage.accent]);
      expect(cover?.art).toEqual(rows.has(stage.id) ? [stage.id] : undefined);
    }
  });

  it("give a mixed collection up to four distinct paintings from its songs", () => {
    const withArt = FACTS.filter((stage) => hasCoverPainting(stage.id)).map((stage) => stage.id);
    const without = FACTS.filter((stage) => !hasCoverPainting(stage.id)).map((stage) => stage.id);
    const stageIds = [withArt[0], withArt[0], ...without, ...withArt.slice(1)].filter((id) => id !== undefined);
    const songs = stageIds.map((stageId, index) => song(`song-${String(index)}`, stageId));
    const { all } = buildMusicCollections(songs, { rules: [] });
    expect(all.cover?.art).toEqual(withArt.slice(0, 4));
  });

  it("use the smallest file that is not stretched, else the largest", () => {
    const stageId = firstRow();
    const [small, large] = [manifest.sizes[0] ?? 0, manifest.sizes.at(-1) ?? 0];
    expect(coverUrl(stageId, 1)).toContain(`${stageId}-${String(small)}`);
    expect(coverUrl(stageId, small)).toContain(`${stageId}-${String(small)}`);
    expect(coverUrl(stageId, small + 1)).toContain(`${stageId}-${String(large)}`);
    expect(coverUrl(stageId, large * 4)).toContain(`${stageId}-${String(large)}`);
    expect(coverUrl("no-such-stage", small)).toBeNull();
  });

  it("load each file once, draw nothing until it arrives, and let a loaded size stand in", async () => {
    const stageId = firstRow();
    const small = manifest.sizes[0] ?? 0;
    const loads: string[] = [];
    const bitmap = { width: small, height: small } as SceneBitmap;
    const load = (url: string): Promise<SceneBitmap> => {
      loads.push(url);
      return url.includes(`-${String(small)}`) ? Promise.resolve(bitmap) : new Promise<SceneBitmap>(() => undefined);
    };
    expect(coverPainting(stageId, small, load)).toBeNull();
    expect(coverPainting(stageId, small, load)).toBeNull();
    await Promise.resolve();
    expect(coverPainting(stageId, small, load)).toBe(bitmap);
    expect(coverPainting(stageId, small * 4, load)).toBe(bitmap);
    expect(loads).toHaveLength(2);
    expect(coverPainting("no-such-stage", small, load)).toBeNull();
    expect(loads).toHaveLength(2);
  });

  it("keep the hue cover when a painting fails to load", async () => {
    const stageId = firstRow();
    const load = (): Promise<SceneBitmap> => Promise.reject(new Error("offline"));
    expect(coverPainting(stageId, 1, load)).toBeNull();
    await Promise.resolve();
    await Promise.resolve();
    expect(coverPainting(stageId, 1, load)).toBeNull();
  });
});

describe("pnpm music:cover", () => {
  const row = (stageId: string, bytes: number) => ({
    stageId,
    files: [{ file: coverFileName(stageId, 512), size: 512, bytes, sha256: "" }],
  });
  const base = { maxTotalBytes: 100, covers: [row("a", 10), row("b", 20)] };

  it("replaces a stage's row in place and adds a new one last", () => {
    expect(withCover(base, row("a", 30)).covers.map((cover) => [cover.stageId, cover.files[0]?.bytes])).toEqual([
      ["a", 30],
      ["b", 20],
    ]);
    expect(withCover(base, row("c", 5)).covers.map((cover) => cover.stageId)).toEqual(["a", "b", "c"]);
  });

  it("refuses a cover that would pass the byte limit", () => {
    expect(() => withCover(base, row("c", 71))).toThrow(/over the limit/u);
  });
});
