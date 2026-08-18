import type { GhostPublicationBearerPort } from "./firebase-publication-bearer";

/**
 * The only publication capability allowed to cross the application platform
 * boundary.  It has an endpoint and an action-time authorization operation,
 * never a Firebase Auth object, UID, token cache, transport, or queue.
 */
export interface GhostPublicationRuntime {
  readonly available: boolean;
  readonly reason?: "unsupported-target" | "endpoint-unconfigured" | "endpoint-invalid";
  readonly endpoint?: string;
  acquireAuthorization?(): Promise<Readonly<{ readonly authorization: string }>>;
}

export interface StandaloneGhostPublicationRuntimeOptions {
  readonly target: "standalone" | "crazygames";
  readonly endpoint: string | undefined;
  readonly loadBearer: () => Promise<GhostPublicationBearerPort>;
}

function unavailable(reason: NonNullable<GhostPublicationRuntime["reason"]>): GhostPublicationRuntime {
  return Object.freeze({ available: false, reason });
}

function endpoint(value: string | undefined): string | undefined {
  if (value === undefined || value.trim().length === 0) return undefined;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash) return undefined;
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return undefined;
  }
}

/**
 * Creates an inert standalone publication capability.  Firebase is not loaded
 * and no credential is read until a future foreground action asks for one.
 */
export function createStandaloneGhostPublicationRuntime(
  options: StandaloneGhostPublicationRuntimeOptions,
): GhostPublicationRuntime {
  if (options.target !== "standalone") return unavailable("unsupported-target");
  if (options.endpoint === undefined || options.endpoint.trim().length === 0) return unavailable("endpoint-unconfigured");
  const configuredEndpoint = endpoint(options.endpoint);
  if (configuredEndpoint === undefined) return unavailable("endpoint-invalid");
  return Object.freeze({
    available: true,
    endpoint: configuredEndpoint,
    async acquireAuthorization() {
      return (await options.loadBearer()).acquireAuthorization();
    },
  });
}
