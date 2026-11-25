import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GhostLocalVault } from "../../src/ghost/capsule-vault";
import { GhostStreamingRecorder } from "../../src/ghost/streaming-recorder";
import {
  GHOST_VAULT_RETIRED_KEY_PREFIXES,
  GHOST_VAULT_STORES,
  createMemoryGhostVaultBackend,
} from "../../src/ghost/capsule-vault-backend";
import type { GhostVaultBackend } from "../../src/ghost/capsule-vault";
import { GhostCareerStore, careerKey } from "../../src/ghost/career-archive-store";
import { provisionalCareerEntry } from "../../src/ghost/career-archive";

// One record under every retired prefix, standing in for what removed features left in a
// player's vault. Nothing reads them any more; a vault that holds them must still load.
const OLD_RECORDS = (capsuleId: string) =>
  GHOST_VAULT_RETIRED_KEY_PREFIXES.map(
    ({ store, prefix }) => [store, `${prefix}${capsuleId}`, JSON.stringify({ capsuleId, status: "queued" })] as const,
  );

const REPOSITORY = join(__dirname, "../..");
const LIST_FILE = "src/ghost/capsule-vault-backend.ts";

/** Every tracked file under src/ that names one of the prefixes, with the line. */
function sourceLinesNaming(prefixes: readonly string[]): string[] {
  const patterns = prefixes.flatMap((prefix) => ["-e", prefix]);
  try {
    return execFileSync("git", ["grep", "--untracked", "-n", "-F", ...patterns, "--", "src"], {
      cwd: REPOSITORY,
      encoding: "utf8",
    })
      .split(/\r?\n/u)
      .filter(Boolean);
  } catch (error) {
    // git grep exits 1 when nothing matches.
    if ((error as { status?: number }).status === 1) return [];
    throw error;
  }
}

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

describe("vault records left by removed features", () => {
  it("are listed once each, under stores the vault still opens without an upgrade", () => {
    const prefixes = GHOST_VAULT_RETIRED_KEY_PREFIXES.map(({ prefix }) => prefix);
    expect(prefixes.length).toBeGreaterThan(0);
    expect(new Set(prefixes).size).toBe(prefixes.length);
    for (const { store } of GHOST_VAULT_RETIRED_KEY_PREFIXES) expect(GHOST_VAULT_STORES).toContain(store);
  });

  it("are never written by live code: no source file outside the list names a retired prefix", () => {
    const prefixes = GHOST_VAULT_RETIRED_KEY_PREFIXES.map(({ prefix }) => prefix);
    const lines = sourceLinesNaming(prefixes);
    // The list itself names every prefix, which also proves the search ran.
    for (const prefix of prefixes)
      expect(lines.some((line) => line.startsWith(`${LIST_FILE}:`) && line.includes(prefix))).toBe(true);
    const offenders = lines.filter((line) => !line.startsWith(`${LIST_FILE}:`));
    expect(offenders).toEqual([]);
  });

  it("leave the capsule listed in the Vault and Career, and are themselves left alone", async () => {
    const backend = createMemoryGhostVaultBackend();
    const { vault, manifest } = await recordCapsule("old-save", backend);
    await seedOldRecords(backend, manifest.id);

    expect((await vault.getManifest(manifest.id))?.rootIntegrity).toBe(manifest.rootIntegrity);
    expect(JSON.parse(await vault.exportCapsule(manifest.id))).toMatchObject({ manifest: { id: manifest.id } });

    const store = new GhostCareerStore(backend);
    await store.retain(provisionalCareerEntry(manifest));
    const row = (await store.list()).find((candidate) => candidate.entry.id === manifest.id);
    expect(row?.entry.root).toBe(manifest.rootIntegrity);
    await expectOldRecordsUntouched(backend, manifest.id);
  });

  it("include sharing fields on a saved Career index, which still reads and drops them", async () => {
    const backend = createMemoryGhostVaultBackend();
    const { manifest } = await recordCapsule("indexed-before", backend);
    const store = new GhostCareerStore(backend);
    await store.retain(provisionalCareerEntry(manifest));
    const key = careerKey(manifest.id, manifest.rootIntegrity);
    const saved = JSON.parse((await backend.get("indexes", key)) ?? "{}") as Record<string, unknown>;
    expect(saved.manifestHash).toEqual(expect.any(String));
    await backend.put("indexes", key, JSON.stringify({ ...saved, sharing: "public", shared: true }));

    const row = (await store.list()).find((candidate) => candidate.entry.id === manifest.id);
    expect(row?.entry.manifestHash).toBe(saved.manifestHash);
    expect(row?.entry).not.toHaveProperty("sharing");
    expect(row?.entry).not.toHaveProperty("shared");
  });

  it("do not stop a capsule file importing", async () => {
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
});
