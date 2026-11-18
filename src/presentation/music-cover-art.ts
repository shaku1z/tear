import manifest from "./assets/music-covers/covers.json";
import { loadSceneBitmap } from "./scenes/scene-bitmap";
import type { SceneBitmap } from "./scenes/scene-renderer";
import type { MusicCoverView } from "./screens/contracts";

/**
 * The stage paintings MUSIC covers show. assets/music-covers/covers.json owns them: one row per
 * stage, its files at every size the manifest lists and where each came from. Adding a cover is
 * `pnpm music:cover add`, which encodes the painting and writes its row; nothing here changes.
 * A painting is fetched the first time a cover asks for it, so nothing downloads until the MUSIC
 * screen draws; until it arrives (or if it never does) the cover keeps its hue bands. The files
 * are WebP outside the PWA precache, as scene art is.
 */
const URLS: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>("./assets/music-covers/*.webp", { eager: true, query: "?url", import: "default" }),
  ).map(([path, url]) => [path.slice(path.lastIndexOf("/") + 1), url]),
);

/** Each stage's painting, by stage id: its file URL at each size, smallest first. */
const PAINTINGS: ReadonlyMap<string, readonly (readonly [size: number, url: string])[]> = new Map(
  manifest.covers.map((cover) => [
    cover.stageId,
    cover.files
      .map((file) => [file.size, URLS[file.file] ?? ""] as const)
      .filter(([, url]) => url !== "")
      .sort(([a], [b]) => a - b),
  ]),
);

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
  load: (url: string) => Promise<SceneBitmap> = loadSceneBitmap,
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

/** Forgets every loaded painting (tests). */
export function resetCoverPaintings(): void {
  slots.clear();
}
