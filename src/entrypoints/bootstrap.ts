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
import { createEngineeringQuery, type EngineeringQuery } from "../app/shell/engineering-query";
import { createSurfaceAvailability, type SurfaceAvailability } from "../domain/surface-availability";

/** The build's surface policy, resolved once here and injected into composition. */
export interface TearBootstrapSurfaces {
  readonly surfaces: SurfaceAvailability;
  readonly engineeringQuery: EngineeringQuery;
}

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
  compose: (surfaces: TearBootstrapSurfaces) => void | Promise<void>,
): Promise<void> {
  identifyBuild(target);
  void warmChapterFonts(document);
  // The only read of the build's surface channel; everything downstream receives this policy.
  const surfaces = createSurfaceAvailability(__TEAR_ENGINEERING_SURFACES__ ? "engineering" : "release");
  const engineeringQuery = createEngineeringQuery(surfaces, window.location.search);
  // Recorded biome stems are the default. Engineering builds may select the
  // procedural engine (`?stems=off`) or audition one cue (`?stemcue=<id>`);
  // release builds read no query. A failed stem install always falls back to
  // the procedural engine so music is never silent.
  const stems = requestedStemsMode(engineeringQuery.search);
  let stemInstalled = false;
  if (stems.mode === "biome") stemInstalled = await installBiomeStemBackend();
  else if (stems.mode === "single") stemInstalled = await installStemCueMusicBackend(stems.cueId,
    surfaces.allows("global:foundry-audio-preview") ? engineeringQuery.search : "");
  if (!stemInstalled) await installTearScoreMusicBackend();
  await compose(Object.freeze({ surfaces, engineeringQuery }));
}
