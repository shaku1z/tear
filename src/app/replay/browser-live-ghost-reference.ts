import type { GhostLiveReference } from "../../ghost/live-ghost-reference-data";
import type { GhostRunAssistance } from "../../gameplay/run/ghost-assistance";
import { stableVerificationHash } from "../../replay/hash";
import { GhostLocalVault } from "../../ghost/capsule-vault";
import { createIndexedDbGhostVaultBackend } from "../../ghost/indexeddb-vault-backend";
import { prepareGhostCapsuleSourceGuards } from "../../ghost/capsule-protection";

export function createBrowserLiveGhostReference(factory: IDBFactory | undefined) {
  return Object.freeze({
    prepare(id: string, signal: AbortSignal): Promise<GhostLiveReference> {
      if (factory === undefined || signal.aborted)
        return Promise.reject(new Error("Reference selection unavailable or cancelled."));
      const worker = new Worker(new URL("../../ghost/live-ghost-reference-worker.ts", import.meta.url), {
        type: "module",
      });
      return new Promise<GhostLiveReference>((resolve, reject) => {
        const cancel = () => {
          worker.terminate();
          reject(new Error("Reference selection cancelled."));
        };
        signal.addEventListener("abort", cancel, { once: true });
        const cleanup = () => {
          signal.removeEventListener("abort", cancel);
          worker.terminate();
        };
        worker.addEventListener(
          "error",
          () => {
            cleanup();
            reject(new Error("Reference worker unavailable."));
          },
          { once: true },
        );
        worker.addEventListener(
          "message",
          (event: MessageEvent<{ result?: GhostLiveReference; error?: string }>) => {
            cleanup();
            if (event.data.result && !signal.aborted) resolve(event.data.result);
            else reject(new Error(event.data.error ?? "Reference cancelled."));
          },
          { once: true },
        );
        worker.postMessage({ id });
      });
    },
    async current(source: GhostRunAssistance): Promise<boolean> {
      if (factory === undefined) return false;
      try {
        const vault = new GhostLocalVault(await createIndexedDbGhostVaultBackend(factory)),
          raw = await vault.backend().get("manifests", source.sourceId),
          manifest = await vault.getManifest(source.sourceId);
        if (
          manifest === undefined ||
          stableVerificationHash(manifest) !== source.sourceManifestHash ||
          manifest.rootIntegrity !== source.sourceRoot
        )
          return false;
        await vault
          .backend()
          .commitIfMatches(
            [
              ...(await prepareGhostCapsuleSourceGuards(vault.backend(), manifest.id, source.sourceRoot)),
              { store: "manifests", key: source.sourceId, ...(raw === undefined ? {} : { expected: raw }) },
            ],
            [],
          );
        return true;
      } catch {
        return false;
      }
    },
  });
}
