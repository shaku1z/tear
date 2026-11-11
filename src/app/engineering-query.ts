import type { SurfaceAvailability } from "../domain/surface-availability";

/** Engineering query parameters (`?test`, `?stemcue`, `?foundryPreview`, surface routes, ...). */
export interface EngineeringQuery {
  /** The admitted query string; empty in the release channel. */
  readonly search: string;
  get(name: string): string | null;
}

/**
 * The single gate for engineering query parameters. In the release channel
 * every parameter reads as absent, so no URL can open an engineering surface.
 */
export function createEngineeringQuery(surfaces: SurfaceAvailability, search: string): EngineeringQuery {
  const admitted = surfaces.allows("route:engineering-query") ? search : "";
  const parameters = new URLSearchParams(admitted);
  return Object.freeze({ search: admitted, get: (name: string) => parameters.get(name) });
}
