import type { MusicCatalog } from "./catalog";
import type { MusicRoutingManifest } from "./music-routing-types";
import { parseRadioProgramme, type RadioProgramme } from "./radio";

/** One song as the MUSIC screen and the Radio see it, in catalog order. */
export interface MusicLibrarySong {
  readonly id: string;
  readonly title: string;
  readonly tags: readonly string[];
  /** `calm` or `intense`; absent in catalogs from before the Radio. */
  readonly mood?: string;
  /** Length of one loop, in seconds, from the song's cue; absent when the cue is missing. */
  readonly seconds?: number;
}

export interface MusicLibrary {
  readonly songs: readonly MusicLibrarySong[];
  readonly routing: MusicRoutingManifest;
  /** The Radio's channels; none until the published index carries them. */
  readonly radio: RadioProgramme;
}

let library: MusicLibrary | null = null;

/** Published by the music index loader once `audio/music.json` has arrived. */
export function publishMusicLibrary(
  catalog: Pick<MusicCatalog, "works" | "channels" | "radio">,
  routing: MusicRoutingManifest,
  seconds: Readonly<Record<string, number>> = {},
): void {
  library = Object.freeze({
    songs: Object.freeze(
      catalog.works.map(({ id, title, tags, mood }) => {
        const length = seconds[id];
        return Object.freeze({
          id,
          title,
          tags: Object.freeze([...tags]),
          ...(mood === undefined ? {} : { mood }),
          ...(length === undefined ? {} : { seconds: length }),
        });
      }),
    ),
    routing,
    radio: parseRadioProgramme(catalog.channels, catalog.radio),
  });
}

/** The catalog in catalog order, or null until the music index has loaded. */
export function getMusicLibrary(): MusicLibrary | null {
  return library;
}
