import { createIndexedDbGhostVaultBackend } from "./indexeddb-vault-backend";
import { GhostLocalVault } from "./capsule-vault";
import { GhostCapsuleReader } from "./capsule-reader";
import { GhostCareerStore } from "./career-archive-store";
import { projectCareerEntry } from "./career-archive";
import { verifyGhostCapsuleProductionReplay } from "./production-replay-verification";
import { reopenRecordedGhostChallenge } from "./browser-recorded-challenge";
import { ensureReplayEngine } from "./replay-engine";

const host = globalThis as unknown as {
  onmessage: ((event: MessageEvent<{ id: number }>) => void) | null;
  postMessage(value: unknown): void;
};
host.onmessage = (event: MessageEvent<{ id: number }>) => {
  void (async () => {
    await ensureReplayEngine();
    const backend = await createIndexedDbGhostVaultBackend(indexedDB),
      store = new GhostCareerStore(backend),
      reader = new GhostCapsuleReader(new GhostLocalVault(backend));
    for (const { entry } of await store.list()) {
      if (!entry.present || entry.enriched) continue;
      try {
        const capsule = await reader.read(entry.id);
        if (capsule.manifest.rootIntegrity !== entry.root || capsule.manifest.status !== "complete") continue;
        const fork = await reopenRecordedGhostChallenge(indexedDB, capsule);
        const verification = verifyGhostCapsuleProductionReplay(capsule, fork?.permit);
        await store.retain(projectCareerEntry(capsule, verification.status === "verified"));
        host.postMessage({ id: event.data.id, progress: entry.id });
      } catch {
        /* Continue after corrupt, historical or replaced sources. */
      }
    }
    await store.applyRetentionPolicy();
    host.postMessage({ id: event.data.id, complete: true });
  })().catch((error: unknown) => {
    host.postMessage({
      id: event.data.id,
      error: error instanceof Error ? error.message : "Career indexing unavailable",
    });
  });
};
