import type { MusicRoutingManifest } from "./music-routing-types";

/** One song as the MUSIC screen lists it; other catalog fields (stations, versions) are optional to it. */
export interface MusicLibrarySong {
  readonly id: string;
  readonly title: string;
  /** Length of one loop, in seconds, from the song's cue; absent when the cue is missing. */
  readonly seconds?: number;
}

export interface MusicLibrary {
  readonly songs: readonly MusicLibrarySong[];
  readonly routing: MusicRoutingManifest;
}

let library: MusicLibrary | null = null;

/** Published by the music index loader once `audio/music.json` has arrived. */
export function publishMusicLibrary(
  songs: readonly MusicLibrarySong[],
  routing: MusicRoutingManifest,
  seconds: Readonly<Record<string, number>> = {},
): void {
  library = Object.freeze({
    songs: Object.freeze(
      songs.map(({ id, title }) => {
        const length = seconds[id];
        return Object.freeze(length === undefined ? { id, title } : { id, title, seconds: length });
      }),
    ),
    routing,
  });
}

/** The catalog in catalog order, or null until the music index has loaded. */
export function getMusicLibrary(): MusicLibrary | null {
  return library;
}
