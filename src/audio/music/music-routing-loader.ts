import { routing } from "../../../public/audio/music.json";
import { validateMusicRoutingManifest } from "./music-routing-validate";
import type { MusicRoutingManifest } from "./music-routing-types";

/** The published routing, compiled in (only this key of music.json is bundled). */
export const FALLBACK_MUSIC_ROUTING: MusicRoutingManifest = validateMusicRoutingManifest(routing);
