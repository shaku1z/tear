import { describe, expect, it } from "vitest";
import { createGhostReplayRunContext, createGhostSanitizedSupportBundle, createMemoryGhostVaultBackend, GhostLocalVault, GhostStreamingRecorder, GHOST_REPLAY_CONTEXT_PROVENANCE_KEY } from "../../src/ghost";

async function fixture() {
  const backend = createMemoryGhostVaultBackend(), vault = new GhostLocalVault(backend), id = "support-capsule";
  const context = createGhostReplayRunContext({ runId: id, seed: "support", mode: "endless", difficulty: "normal", weaponId: "sword", ticksPerSecond: 120,
    build: { version: "1", revision: "support", target: "unit", rulesetVersion: "r1", contentHash: "c1", configHash: "d1" }, rng: { world: { state: "1" } } });
  const recorder = new GhostStreamingRecorder({ sessionId: id, createdAt: "2026-08-09T00:00:00.000Z", vault, chunkEntries: 1, maxPendingWrites: 1, provenance: { [GHOST_REPLAY_CONTEXT_PROVENANCE_KEY]: context } });
  await recorder.start();
  await recorder.append({ kind: "commands", tick: 1, value: { kind: "command", id: 1, tick: 1, command: { type: "move", x: 1_000, y: 0 } } });
  const manifest = await recorder.finalize("2026-08-09T00:00:01.000Z");
  return { backend, vault, manifest };
}

function request(capsuleId: string) {
  return { capsuleId, approval: { approved: true as const, approvedAt: "2026-08-09T00:01:00.000Z" }, range: { fromTick: 0, toTick: 1 }, segments: ["commands"] as const,
    settings: { inputScheme: "keyboard-mouse", audio: "on" as const, reducedMotion: false, language: "en-US" },
    platform: { target: "standalone", browserFamily: "chromium", viewportClass: "regular" as const },
    diagnostics: { errorCode: "softlock-check", softlockDetected: false, lastStateHash: "a".repeat(32) }, note: "Player paused after a wave clear." };
}

describe("C39 sanitized local Ghost support bundle", () => {
  it("creates deterministic immutable data-only bundle only after explicit approval", async () => {
    const data = await fixture(), input = request(data.manifest.id);
    const first = await createGhostSanitizedSupportBundle(data.vault, input), second = await createGhostSanitizedSupportBundle(data.vault, input);
    expect(second).toEqual(first);
    expect(first).toMatchObject({ format: "tear-ghost-sanitized-support-bundle", capsule: { id: data.manifest.id, rootIntegrity: data.manifest.rootIntegrity, build: { revision: "support" } }, requested: { range: { fromTick: 0, toTick: 1 }, segments: ["commands"] } });
    expect(JSON.stringify(first)).not.toMatch(/firebase|bearer|token|trainingConsent|uploadJobs|commands.*move/iu);
    await expect(createGhostSanitizedSupportBundle(data.vault, { ...input, approval: { approved: false, approvedAt: input.approval.approvedAt } } as never)).rejects.toThrow(/approval/u);
  });

  it("rejects hostile notes, unsupported scope, unhealthy source, and chunk tampering", async () => {
    const data = await fixture(), input = request(data.manifest.id);
    await expect(createGhostSanitizedSupportBundle(data.vault, { ...input, note: "mail test@example.com" })).rejects.toThrow(/unsafe/u);
    await expect(createGhostSanitizedSupportBundle(data.vault, { ...input, range: { fromTick: 0, toTick: 2 } })).rejects.toThrow(/exceeds/u);
    await expect(createGhostSanitizedSupportBundle(data.vault, { ...input, segments: ["unknown"] as never })).rejects.toThrow(/segments/u);
    const entry = data.manifest.chunks[0];
    if (entry === undefined) throw new Error("fixture chunk missing");
    await data.backend.put("chunks", entry.id, "tampered");
    await expect(createGhostSanitizedSupportBundle(data.vault, input)).rejects.toThrow(/checksum/u);
  });
});
