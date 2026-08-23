import { installPrimaryMusicBackend } from "./music-backend-registry";
import {
  AdaptiveSoundtrackMusicBackend,
  preparePinnedAdaptiveSoundtrackClient,
} from "./adaptive-soundtrack";

/** A failed optional load leaves AudioSystem's legacy music fallback in place. */
export async function installTearScoreMusicBackend(): Promise<boolean> {
  try {
    const client = await preparePinnedAdaptiveSoundtrackClient();
    installPrimaryMusicBackend(() => new AdaptiveSoundtrackMusicBackend(client));
    return true;
  } catch (error) {
    console.warn("Adaptive Soundtrack unavailable; using legacy music", error);
    return false;
  }
}
