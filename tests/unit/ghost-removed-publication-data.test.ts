import { describe, expect, it, vi } from "vitest";
import { GhostLocalVault, GhostStreamingRecorder } from "../../src/ghost/capsule-vault";
import { GHOST_VAULT_STORES, createMemoryGhostVaultBackend } from "../../src/ghost/capsule-vault-backend";
import type { GhostVaultBackend } from "../../src/ghost/capsule-vault";
import { GhostCareerStore } from "../../src/ghost/career-archive-store";
import { provisionalCareerEntry } from "../../src/ghost/career-archive";
import { ReplayLibraryController } from "../../src/app/library/replay-library-controller";

// Records the removed Ghost publication queue, consent ledger and transport wrote into a
// player's vault. Nothing reads them any more; a vault that holds them must still load.
const OLD_RECORDS = (capsuleId: string) =>
  [
    [
      "uploadJobs",
      `ghost-publication-job:v1:job-1`,
      JSON.stringify({ id: "job-1", status: "queued", source: { capsuleId } }),
    ],
    ["analysis", `ghost-publication-custody:v1:${capsuleId}`, JSON.stringify({ capsuleId, visibility: "public" })],
    ["analysis", "ghost-publication-transport:v1:job-1", JSON.stringify({ jobId: "job-1", terminal: "finalized" })],
    ["analysis", "ghost-publication-consent:v1:actor", JSON.stringify({ cloudPublication: "granted" })],
  ] as const;

async function seedOldRecords(backend: GhostVaultBackend, capsuleId: string) {
  for (const [store, key, value] of OLD_RECORDS(capsuleId)) await backend.put(store, key, value);
}

async function expectOldRecordsUntouched(backend: GhostVaultBackend, capsuleId: string) {
  for (const [store, key, value] of OLD_RECORDS(capsuleId)) expect(await backend.get(store, key), key).toBe(value);
}

async function recordCapsule(id: string, backend: GhostVaultBackend) {
  const vault = new GhostLocalVault(backend);
  const recorder = new GhostStreamingRecorder({
    sessionId: id,
    createdAt: "2026-11-17T00:00:00Z",
    chunkEntries: 16,
    maxPendingWrites: 1,
    vault,
  });
  await recorder.start();
  await recorder.append({ kind: "commands", tick: 1, value: { action: "jump" } });
  return { vault, manifest: await recorder.finalize("2026-11-17T00:00:01Z") };
}

describe("a vault written before the Ghost publication stack was removed", () => {
  it("keeps the stores those records live in, so the database opens without an upgrade", () => {
    expect(GHOST_VAULT_STORES).toContain("uploadJobs");
    expect(GHOST_VAULT_STORES).toContain("analysis");
  });

  it("still lists the capsule in the Vault and Career, reads its sharing as unknown and leaves the old records alone", async () => {
    const backend = createMemoryGhostVaultBackend();
    const { vault, manifest } = await recordCapsule("old-save", backend);
    await seedOldRecords(backend, manifest.id);

    expect((await vault.getManifest(manifest.id))?.rootIntegrity).toBe(manifest.rootIntegrity);
    expect(JSON.parse(await vault.exportCapsule(manifest.id))).toMatchObject({ manifest: { id: manifest.id } });

    const store = new GhostCareerStore(backend);
    await store.retain(provisionalCareerEntry(manifest));
    const row = (await store.list()).find((candidate) => candidate.entry.id === manifest.id);
    expect(row?.entry).toMatchObject({ sharing: "unknown", shared: null });
    await expectOldRecordsUntouched(backend, manifest.id);
  });

  it("imports a capsule file into a vault that holds the old records", async () => {
    const source = await recordCapsule("shared-file", createMemoryGhostVaultBackend());
    const exported = await source.vault.exportCapsule(source.manifest.id);
    const target = createMemoryGhostVaultBackend();
    await seedOldRecords(target, "some-other-capsule");

    const imported = await new GhostLocalVault(target).importCapsule(exported);
    expect(imported.id).toBe(source.manifest.id);
    expect((await new GhostLocalVault(target).getManifest(imported.id))?.rootIntegrity).toBe(
      source.manifest.rootIntegrity,
    );
    await expectOldRecordsUntouched(target, "some-other-capsule");
  });

  it("opens a leaderboard-linked replay through the shared cloud, which never read the vault", async () => {
    const record = { v: 2 },
      enterReplay = vi.fn(() => true),
      leaderboardMessage = vi.fn();
    const controller = new ReplayLibraryController({
      vault: { index: () => [], get: () => null, setShareId: vi.fn() },
      cloud: {
        hasLeaderboards: () => true,
        loadGhost: vi.fn(),
        loadReplay: vi.fn(() => Promise.resolve(record)),
        publishReplay: vi.fn(),
      },
      enterReplay,
      setProfileMessage: vi.fn(),
      setLeaderboardMessage: leaderboardMessage,
    });
    controller.watch("linked-1", "leaderboards");
    await vi.waitFor(() => {
      expect(enterReplay).toHaveBeenCalledWith(record, "leaderboards");
    });
    expect(leaderboardMessage).toHaveBeenLastCalledWith("");
  });
});
