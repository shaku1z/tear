declare global {
  interface Window {
    __TEAR_BUILD__?: Readonly<{
      target: TearBuildTarget;
      mode: string;
    }>;
  }
}

import type { TearBuildTarget } from "../platform/contracts";
import { installBiomeStemBackend, installStemCueMusicBackend, requestedStemsMode } from "../audio/install-stem-cue";
import { warmChapterFonts } from "../presentation/font-loader";
import { createEngineeringQuery, type EngineeringQuery } from "../app/shell/engineering-query";
import { createSurfaceAvailability, type SurfaceAvailability } from "../domain/surface-availability";
import { waitForComputerInput } from "./computer-only";

/** The build's surface policy, resolved once here and injected into composition. */
export interface TearBootstrapSurfaces {
  readonly surfaces: SurfaceAvailability;
  readonly engineeringQuery: EngineeringQuery;
}

export function identifyBuild(target: TearBuildTarget): void {
  Object.defineProperty(window, "__TEAR_BUILD__", {
    configurable: false,
    enumerable: false,
    writable: false,
    value: Object.freeze({ target, mode: import.meta.env.MODE }),
  });
}

/** The async boundary lets a target install the recorded-stem music backend first. */
export async function bootstrapTear(
  target: TearBuildTarget,
  compose: (surfaces: TearBootstrapSurfaces) => void | Promise<void>,
): Promise<void> {
  identifyBuild(target);
  void warmChapterFonts(document);
  // The only read of the build's surface channel; everything downstream receives this policy.
  const surfaces = createSurfaceAvailability(__TEAR_ENGINEERING_SURFACES__ ? "engineering" : "release");
  const engineeringQuery = createEngineeringQuery(surfaces, window.location.search);
  // Recorded biome stems are the default. Engineering builds may turn them off
  // (`?stems=off`) or audition one cue (`?stemcue=<id>`); release builds read no
  // query. A failed stem install leaves AudioSystem's built-in music in place.
  const stems = requestedStemsMode(engineeringQuery.search);
  if (stems.mode === "biome") installBiomeStemBackend();
  else if (stems.mode === "single") await installStemCueMusicBackend(stems.cueId);
  // Mobile is paused: a production build waits on a touch-only device until a mouse or controller appears.
  if (!__TEAR_MOBILE__) await waitForComputerInput(window, document);
  await compose(Object.freeze({ surfaces, engineeringQuery }));
}
