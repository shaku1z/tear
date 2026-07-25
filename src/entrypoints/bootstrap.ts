declare global {
  interface Window {
    __TEAR_BUILD__?: Readonly<{
      target: "standalone" | "crazygames";
      mode: string;
    }>;
  }
}

import { installTearScoreMusicBackend } from "../audio/install-tear-score";
import {
  installBiomeStemBackend,
  installStemCueMusicBackend,
  requestedStemsMode,
} from "../audio/install-stem-cue";
import { warmChapterFonts } from "../presentation/font-loader";

export function identifyBuild(target: "standalone" | "crazygames"): void {
  Object.defineProperty(window, "__TEAR_BUILD__", {
    configurable: false,
    enumerable: false,
    writable: false,
    value: Object.freeze({ target, mode: import.meta.env.MODE }),
  });
}

/** The async boundary lets a target install optional adapters (such as TearScore) first. */
export async function bootstrapTear(
  target: "standalone" | "crazygames",
  compose: () => void | Promise<void>,
): Promise<void> {
  identifyBuild(target);
  void warmChapterFonts(document);
  // Recorded biome stems are the default; `?stems=off` selects the procedural
  // engine and `?stemcue=<id>` auditions one cue. A failed stem install always
  // falls back to the procedural engine so music is never silent.
  const stems = requestedStemsMode();
  let stemInstalled = false;
  if (stems.mode === "biome") stemInstalled = await installBiomeStemBackend();
  else if (stems.mode === "single") stemInstalled = await installStemCueMusicBackend(stems.cueId);
  if (!stemInstalled) await installTearScoreMusicBackend();
  await compose();
}
