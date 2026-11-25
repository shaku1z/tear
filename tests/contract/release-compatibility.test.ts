// Release compatibility: every build must still read what an earlier release wrote to a player's
// browser. Each folder under tests/fixtures/releases/ holds one release's storage, exported from that
// release's own build (how: docs/RELEASE_COMPATIBILITY.md), plus the facts this test checks.
// What is promised is written in docs/RELEASE_COMPATIBILITY.md; this file tests exactly that.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GhostLocalVault } from "../../src/ghost/capsule-vault";
import { createMemoryGhostVaultBackend } from "../../src/ghost/capsule-vault-backend";
import { GhostCapsuleReader } from "../../src/ghost/capsule-reader";
import { assessGhostReplayAdmission, readGhostReplayRunContext } from "../../src/ghost/replay-admission";
import { createProfileStore } from "../../src/persistence/profile-store";
import { migrateAudioSettings } from "../../src/persistence/audio-settings";
import { migrateMetaData } from "../../src/gameplay/progression/meta";
import { BestScoreRepository } from "../../src/gameplay/scoring/best-scores";
import {
  EARLIER_REPLAYS_FORMAT,
  clearEarlierReplays,
  earlierReplayKeys,
  earlierReplaysFile,
} from "../../src/app/replay/earlier-replays";

const RELEASES = join(import.meta.dirname, "..", "fixtures", "releases");

interface ReleaseExpectations {
  readonly release: string;
  readonly commit: string;
  readonly profile: Readonly<{ shards: number; runs: number; coinsEarned: number; modes: readonly string[] }>;
  readonly settings: Readonly<Record<string, number | boolean>>;
  readonly meta: Readonly<{ lifetimeEarned: number; lifetimeSpent: number }>;
  readonly best: Readonly<{ mode: string; difficulty: string; wave: number; score: number }>;
  readonly localReplays: readonly Readonly<{ id: string; authoritativeTick: number; authoritativeStateHash: string }>[];
  readonly ghostCapsules: readonly Readonly<{
    id: string;
    chunks: number;
    maxTick: number;
    buildRevision: string;
    admission: "unavailable";
  }>[];
}

interface ExportedStorage {
  readonly localStorage: Readonly<Record<string, string>>;
  readonly indexedDB: Readonly<
    Record<string, { readonly stores: Readonly<Record<string, readonly { key: string; value: string }[]>> }>
  >;
}

function memoryStore(initial: Readonly<Record<string, string>>) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    get: (key: string): string | null => values.get(key) ?? null,
    set: (key: string, value: string): void => {
      values.set(key, value);
    },
  };
}

const releases = readdirSync(RELEASES, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

describe("release compatibility fixtures", { timeout: 60_000 }, () => {
  it("has the previous and the current production release", () => {
    expect(releases).toContain("2026-08-30-9e7d6a70");
    expect(releases).toContain("2026-11-13-84761549");
  });

  for (const release of releases) {
    const folder = join(RELEASES, release);
    const expected = JSON.parse(readFileSync(join(folder, "expected.json"), "utf8")) as ReleaseExpectations;
    const storage = JSON.parse(readFileSync(join(folder, "storage.json"), "utf8")) as ExportedStorage;

    describe(release, () => {
      it("loads the profile, keeping its progress", () => {
        const store = memoryStore(storage.localStorage);
        const profile = createProfileStore({
          store,
          getAchievements: () => undefined,
          getMeta: () => undefined,
          writerId: () => "release-compatibility",
        });
        const data = profile.load();
        expect(data.shards).toBe(expected.profile.shards);
        expect((data.stats as Record<string, unknown>).runs).toBe(expected.profile.runs);
        expect((data.stats as Record<string, unknown>).coinsEarned).toBe(expected.profile.coinsEarned);
        expect(Object.keys(data.modes).sort()).toEqual([...expected.profile.modes].sort());
      });

      it("keeps the audio settings", () => {
        const settings = migrateAudioSettings(JSON.parse(storage.localStorage.tear_settings ?? "{}"));
        for (const [key, value] of Object.entries(expected.settings))
          expect((settings as unknown as Record<string, unknown>)[key], key).toBe(value);
      });

      it("keeps coins earned and spent", () => {
        const meta = migrateMetaData(JSON.parse(storage.localStorage.tear_meta ?? "{}"));
        expect(meta.lifetimeEarned).toBe(expected.meta.lifetimeEarned);
        expect(meta.lifetimeSpent).toBe(expected.meta.lifetimeSpent);
      });

      it("keeps the best score", () => {
        const best = new BestScoreRepository(memoryStore(storage.localStorage)).read(
          expected.best.mode,
          expected.best.difficulty,
        );
        expect(best.wave).toBe(expected.best.wave);
        expect(best.score).toBe(expected.best.score);
      });

      it("offers every saved local replay to save to a file, then removes only them", () => {
        const store = memoryStore(storage.localStorage);
        const keys = earlierReplayKeys(store);
        for (const replay of expected.localReplays) expect(keys, replay.id).toContain(`tear_vault_${replay.id}`);
        const file = JSON.parse(new TextDecoder().decode(earlierReplaysFile(store, keys))) as {
          format: string;
          recordings: Record<string, Record<string, unknown>>;
        };
        expect(file.format).toBe(EARLIER_REPLAYS_FORMAT);
        for (const replay of expected.localReplays) {
          const recording = file.recordings[`tear_vault_${replay.id}`];
          expect(recording?.authoritativeTick, replay.id).toBe(replay.authoritativeTick);
          expect(recording?.authoritativeStateHash, replay.id).toBe(replay.authoritativeStateHash);
        }
        const before = new Map(store.values);
        expect(clearEarlierReplays(store, keys)).toBe(true);
        expect(earlierReplayKeys(store)).toEqual([]);
        for (const [key, value] of before)
          if (!key.startsWith("tear_vault_") && !key.startsWith("tear_ghost_"))
            expect(store.values.get(key), key).toBe(value);
      });
      it("reads every Ghost capsule intact and reports it unavailable for replay on this build", async () => {
        const stores = new Map(
          Object.entries(storage.indexedDB["tear-ghost-v3"]?.stores ?? {}).map(([name, rows]) => [
            name,
            new Map(rows.map((row) => [row.key, row.value])),
          ]),
        );
        const vault = new GhostLocalVault(createMemoryGhostVaultBackend(stores as never));
        const reader = new GhostCapsuleReader(vault);
        for (const capsule of expected.ghostCapsules) {
          const read = await reader.read(capsule.id);
          expect(read.manifest.chunks).toHaveLength(capsule.chunks);
          expect(read.maxTick).toBe(capsule.maxTick);
          expect(readGhostReplayRunContext(read.manifest.provenance)?.build.revision).toBe(capsule.buildRevision);
          const admission = assessGhostReplayAdmission(read);
          expect(admission.status, admission.reason).toBe(capsule.admission);
        }
      });
    });
  }
});
