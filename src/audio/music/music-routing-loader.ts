import fallbackJson from "../../../public/audio/music-routing.json";
import { validateMusicRoutingManifest } from "./music-routing-validate";
import type { MusicRoutingManifest } from "./music-routing-types";

/** Built from the same checked-in JSON asset, so fetch failure never means silence. */
export const FALLBACK_MUSIC_ROUTING: MusicRoutingManifest = validateMusicRoutingManifest(fallbackJson);

export async function loadMusicRouting(): Promise<MusicRoutingManifest> {
  try {
    const response = await fetch(new URL("audio/music-routing.json", document.baseURI).href);
    if (!response.ok) throw new Error(`music routing unavailable (${String(response.status)})`);
    return validateMusicRoutingManifest(await response.json());
  } catch (error) {
    console.warn("Music routing asset unavailable; using compiled fallback", error);
    return FALLBACK_MUSIC_ROUTING;
  }
}
