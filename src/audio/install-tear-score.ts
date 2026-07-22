import { installPrimaryMusicBackend } from "./music-backend-registry";
import { TearScoreMusicBackend } from "./tear-score-adapter";
import { preparePinnedTearScoreClient } from "./tear-score-module";

/** A failed optional load leaves AudioSystem's legacy music fallback in place. */
export async function installTearScoreMusicBackend(): Promise<boolean> {
  try {
    const client = await preparePinnedTearScoreClient();
    installPrimaryMusicBackend(() => new TearScoreMusicBackend(client));
    return true;
  } catch (error) {
    console.warn("Pinned TearScore unavailable; using legacy music", error);
    return false;
  }
}
