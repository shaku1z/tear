import type { MusicRoutingManifest } from "./music-routing-types";

/** One song as the MUSIC screen lists it; other catalog fields (stations, versions) are optional to it. */
export interface MusicLibrarySong {
  readonly id: string;
  readonly title: string;
}

export interface MusicLibrary {
  readonly songs: readonly MusicLibrarySong[];
  readonly routing: MusicRoutingManifest;
}

let library: MusicLibrary | null = null;

/** Published by the music index loader once `audio/music.json` has arrived. */
export function publishMusicLibrary(songs: readonly MusicLibrarySong[], routing: MusicRoutingManifest): void {
  library = Object.freeze({
    songs: Object.freeze(songs.map(({ id, title }) => Object.freeze({ id, title }))),
    routing,
  });
}

/** The catalog in catalog order, or null until the music index has loaded. */
export function getMusicLibrary(): MusicLibrary | null {
  return library;
}
