import { GhostLocalVault } from "./capsule-vault";
import { GhostCapsuleReader } from "./capsule-reader";
import { createIndexedDbGhostVaultBackend } from "./indexeddb-vault-backend";
import {
  checkGhostCoachSelection,
  ghostCoachCandidate,
  projectGhostCoachHistory,
  readGhostCoachHistorySource,
  type GhostCoachCandidate,
} from "./coach-history";
import { ensureReplayEngine } from "./replay-engine";

self.addEventListener("message", (event: MessageEvent<Readonly<{ sources: readonly GhostCoachCandidate[] }>>) => {
  void (async () => {
    try {
      await ensureReplayEngine();
      const sources = event.data.sources;
      checkGhostCoachSelection(sources);
      const vault = new GhostLocalVault(await createIndexedDbGhostVaultBackend(self.indexedDB));
      const reader = new GhostCapsuleReader(vault),
        admitted = [];
      // Bound all metadata before allocating decoded capsule tracks, then read sequentially.
      const manifests = [];
      for (const source of sources) {
        const manifest = await vault.getManifest(source.id);
        if (manifest === undefined || ghostCoachCandidate(manifest).identity !== source.identity)
          throw new TypeError("Selected recording changed before reading.");
        manifests.push(ghostCoachCandidate(manifest));
      }
      checkGhostCoachSelection(manifests);
      for (const source of sources) admitted.push(readGhostCoachHistorySource(await reader.read(source.id), source));
      for (const source of sources) {
        const manifest = await vault.getManifest(source.id);
        if (manifest === undefined || ghostCoachCandidate(manifest).identity !== source.identity)
          throw new TypeError("Selected recording changed during analysis.");
      }
      self.postMessage({ result: projectGhostCoachHistory(admitted) });
    } catch (error) {
      self.postMessage({ error: error instanceof Error ? error.message : "History unavailable." });
    }
  })();
});
