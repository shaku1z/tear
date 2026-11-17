import type { TearBuildTarget } from "./contracts";
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
  readPublished?(id: string, signal: AbortSignal): Promise<Readonly<{ metadata: unknown; bytes: Uint8Array }>>;
  acquireAuthorization?(): Promise<Readonly<{ readonly authorization: string }>>;
}

export interface StandaloneGhostPublicationRuntimeOptions {
  readonly target: TearBuildTarget;
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
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash)
      return undefined;
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
  if (options.endpoint === undefined || options.endpoint.trim().length === 0)
    return unavailable("endpoint-unconfigured");
  const configuredEndpoint = endpoint(options.endpoint);
  if (configuredEndpoint === undefined) return unavailable("endpoint-invalid");
  return Object.freeze({
    available: true,
    endpoint: configuredEndpoint,
    async readPublished(id: string, signal: AbortSignal) {
      if (!id || id.length > 256) throw new TypeError("Invalid published capsule ID");
      const catalog = await fetch(`${configuredEndpoint}/v1/capsules`, {
        signal,
        credentials: "omit",
        cache: "no-store",
      });
      if (!catalog.ok) throw new Error(`Public metadata unavailable: ${String(catalog.status)}`);
      const body: unknown = await catalog.json();
      const rows = body && typeof body === "object" && "capsules" in body ? body.capsules : undefined;
      if (!Array.isArray(rows)) throw new TypeError("Public metadata is malformed");
      const selected = rows.filter(
        (v: unknown) => v && typeof v === "object" && "capsule_id" in v && v.capsule_id === id,
      );
      if (selected.length !== 1) throw new Error("Published source unavailable in the public catalog");
      const response = await fetch(`${configuredEndpoint}/v1/capsules/${encodeURIComponent(id)}/object`, {
        signal,
        credentials: "omit",
        cache: "no-store",
      });
      if (response.status !== 200 || response.headers.has("content-range") || !response.body)
        throw new Error("Complete published source unavailable");
      const reader = response.body.getReader(),
        parts: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          const result = await reader.read();
          if (result.done) break;
          size += result.value.byteLength;
          if (size > 64 * 1024 * 1024) throw new RangeError("Published source exceeds normal archive limit");
          parts.push(result.value);
        }
      } finally {
        await reader.cancel();
        reader.releaseLock();
      }
      signal.throwIfAborted();
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const part of parts) {
        bytes.set(part, offset);
        offset += part.byteLength;
      }
      return { metadata: selected[0] as unknown, bytes };
    },
    async acquireAuthorization() {
      return (await options.loadBearer()).acquireAuthorization();
    },
  });
}
