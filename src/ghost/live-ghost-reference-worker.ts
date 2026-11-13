import { GhostLocalVault } from "./capsule-vault";
import { GhostCapsuleReader } from "./capsule-reader";
import { createIndexedDbGhostVaultBackend } from "./indexeddb-vault-backend";
import { prepareGhostCapsuleSourceGuards } from "./capsule-protection";
import { prepareGhostLiveReference } from "./live-ghost-reference";

self.addEventListener("message", (event: MessageEvent<Readonly<{ id: string }>>) => {
  void (async () => {
    try {
      if (typeof event.data.id !== "string" || !event.data.id || event.data.id.length > 256)
        throw new TypeError("Invalid reference selection.");
      const vault = new GhostLocalVault(await createIndexedDbGhostVaultBackend(self.indexedDB)),
        raw = await vault.backend().get("manifests", event.data.id),
        manifest = await vault.getManifest(event.data.id);
      if (
        manifest === undefined ||
        manifest.chunks.length > 20_000 ||
        manifest.chunks.reduce((sum, chunk) => sum + chunk.uncompressedBytes, 0) > 128 * 1024 * 1024
      )
        throw new RangeError("Reference is unavailable or exceeds the existing archive work bound.");
      const guards = await prepareGhostCapsuleSourceGuards(vault.backend(), manifest.id, manifest.rootIntegrity);
      const result = await prepareGhostLiveReference(
        await new GhostCapsuleReader(vault).read(manifest.id),
        () => new Promise((resolve) => setTimeout(resolve, 0)),
      );
      await vault
        .backend()
        .commitIfMatches(
          [...guards, { store: "manifests", key: event.data.id, ...(raw === undefined ? {} : { expected: raw }) }],
          [],
        );
      self.postMessage({ result });
    } catch (error) {
      self.postMessage({ error: error instanceof Error ? error.message : "Reference unavailable." });
    }
  })();
});
