import { createSceneCanvas } from "./scenes/scene-bitmap";
import type { SceneBitmap } from "./scenes/scene-renderer";
import type { MusicCoverView } from "./screens/contracts";

/**
 * The stage paintings MUSIC covers show. assets/music-covers/covers.json owns them: one row per
 * stage, its files at every size the manifest lists and where each came from, and
 * tests/unit/music-covers.test.ts holds the folder to it file for file. Adding a cover is
 * `pnpm music:cover add`, which encodes the painting and writes its row; nothing here changes.
 * The screen needs only the files, named `<stageId>-<size>.webp`, so the manifest itself never
 * ships. A painting is fetched the first time a cover asks for it, so nothing downloads until the
 * MUSIC screen draws; until it arrives (or if it never does) the cover keeps its hue bands. The
 * files are WebP outside the PWA precache.
 */
const FILE = /\/([a-z][a-z-]*)-(\d+)\.webp$/u;

/** Each stage's painting, by stage id: its file URL at each size, smallest first. */
const PAINTINGS: ReadonlyMap<string, readonly (readonly [size: number, url: string])[]> = (() => {
  const files = import.meta.glob<string>("./assets/music-covers/*.webp", {
    eager: true,
    query: "?url",
    import: "default",
  });
  const byStage = new Map<string, (readonly [number, string])[]>();
  for (const [path, url] of Object.entries(files)) {
    const [, stageId, size] = FILE.exec(path) ?? [];
    if (stageId === undefined || size === undefined) continue;
    byStage.set(stageId, [...(byStage.get(stageId) ?? []), [Number(size), url] as const]);
  }
  for (const sizes of byStage.values()) sizes.sort(([a], [b]) => a - b);
  return byStage;
})();

/** Whether a stage has a painting. */
export const hasCoverPainting = (stageId: string): boolean => (PAINTINGS.get(stageId)?.length ?? 0) > 0;

/** A stage's cover: its hue and glyph, and its painting when it has one. */
export function stageCover(stage: Readonly<{ id: string; accent: string; glyph: string }>): MusicCoverView {
  return hasCoverPainting(stage.id)
    ? { hues: [stage.accent], glyph: stage.glyph, art: [stage.id] }
    : { hues: [stage.accent], glyph: stage.glyph };
}

/** The file URL a cover drawn `devicePixels` wide uses: the smallest not stretched, else the largest. */
export function coverUrl(stageId: string, devicePixels: number): string | null {
  const files = PAINTINGS.get(stageId) ?? [];
  return (files.find(([size]) => size >= devicePixels) ?? files.at(-1))?.[1] ?? null;
}

/**
 * Fetches and decodes one painting off the main thread where the browser allows it, then copies
 * it into a canvas once. Chrome keeps a bitmap decoded from a file outside the GPU and uploads it
 * again whenever the game's canvas draws it; a canvas source stays on the GPU.
 */
async function loadCoverBitmap(url: string): Promise<SceneBitmap> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`cover painting ${url}: HTTP ${String(response.status)}`);
  const decoded = await createImageBitmap(await response.blob());
  const canvas = createSceneCanvas(decoded.width, decoded.height);
  const context = canvas.getContext("2d");
  if (context === null) return decoded;
  context.drawImage(decoded, 0, 0);
  decoded.close();
  return canvas;
}

type Slot = SceneBitmap | "loading" | "failed";
const slots = new Map<string, Slot>();
const loaded = (slot: Slot | undefined): SceneBitmap | null =>
  slot === undefined || slot === "loading" || slot === "failed" ? null : slot;

/**
 * The painting to draw for a stage at this size, or null while it loads (or when there is none).
 * The first time a size is wanted its file is fetched; any size already loaded stands in meanwhile.
 */
export function coverPainting(
  stageId: string,
  devicePixels: number,
  load: (url: string) => Promise<SceneBitmap> = loadCoverBitmap,
): SceneBitmap | null {
  const url = coverUrl(stageId, devicePixels);
  if (url === null) return null;
  if (!slots.has(url)) {
    slots.set(url, "loading");
    load(url).then(
      (bitmap) => slots.set(url, bitmap),
      () => slots.set(url, "failed"),
    );
  }
  const wanted = loaded(slots.get(url));
  if (wanted) return wanted;
  for (const [, other] of PAINTINGS.get(stageId) ?? []) {
    const standIn = loaded(slots.get(other));
    if (standIn) return standIn;
  }
  return null;
}

/**
 * Lets every painting that failed to load be fetched again the next time a cover asks for it.
 * Called when the MUSIC screen opens, so a player who was offline once sees the paintings on a
 * later visit, without a retry every frame.
 */
export function retryFailedCoverPaintings(): void {
  for (const [url, slot] of slots) if (slot === "failed") slots.delete(url);
}

/** Forgets every loaded painting (tests). */
export function resetCoverPaintings(): void {
  slots.clear();
  coverFrame = { time: Number.NaN, tally: emptyTally() };
  lastCoverFrame = emptyTally();
}

/**
 * What one drawn frame's covers showed: `paintings`, `bands` (no painting exists) and `waiting`
 * (bands while a painting is still on its way, or after it failed).
 */
export interface CoverFrameTally {
  paintings: number;
  bands: number;
  waiting: number;
}
const emptyTally = (): CoverFrameTally => ({ paintings: 0, bands: 0, waiting: 0 });
let coverFrame = { time: Number.NaN, tally: emptyTally() };
let lastCoverFrame: CoverFrameTally = emptyTally();

/** Counts one drawn cover against the frame drawn at `time` (the screen's frame clock). */
export function noteCoverDrawn(time: number, shown: keyof CoverFrameTally): void {
  if (time !== coverFrame.time) {
    if (!Number.isNaN(coverFrame.time)) lastCoverFrame = coverFrame.tally;
    coverFrame = { time, tally: emptyTally() };
  }
  coverFrame.tally[shown] += 1;
}

/** The covers of the last completed frame (a journey waits on this before a capture). */
export const lastCoverFrameTally = (): Readonly<CoverFrameTally> => ({ ...lastCoverFrame });
