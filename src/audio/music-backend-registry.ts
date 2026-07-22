import type { MusicBackend } from "./music-contracts";

export type MusicBackendFactory = () => MusicBackend;

let primaryFactory: MusicBackendFactory | null = null;

/** Called by a target entrypoint before the legacy shell boots Tear. */
export function installPrimaryMusicBackend(factory: MusicBackendFactory): void {
  if (primaryFactory !== null) throw new Error("A primary music backend is already installed");
  primaryFactory = factory;
}

export function createInstalledPrimaryMusicBackend(): MusicBackend | null {
  return primaryFactory?.() ?? null;
}
