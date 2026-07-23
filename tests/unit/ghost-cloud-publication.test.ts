import { describe, expect, it } from "vitest";
import {
  GhostCloudPublicationService,
  classifyRunEligibility,
  ghostSha256,
  sanitizeGhostMetadata,
  type GhostPublicationManifest,
} from "../../src/ghost/cloud-publication";

const bytes = new TextEncoder().encode("deterministic-ghost-capsule");

async function manifest(overrides: Partial<GhostPublicationManifest> = {}): Promise<GhostPublicationManifest> {
  return {
    capsuleId: "capsule-1",
    buildId: "tear-1",
    schemaVersion: 3,
    byteLength: bytes.byteLength,
    contentHash: await ghostSha256(bytes),
    resultHash: "result-ok",
    title: "A clean run",
    tags: ["ranked"],
    privacy: "pseudonymous",
    eligibility: {
      resumed: false,
      modded: false,
      coached: false,
      ghostAssisted: false,
      bot: false,
      debug: false,
      stateForge: false,
    },
    ...overrides,
  };
}

function service(supported = true): GhostCloudPublicationService {
  return new GhostCloudPublicationService(
    { maximumBytes: 1024, maximumParts: 8, relayDelayTicks: 120, requestsPerWindow: 100 },
    supported ? [{
      buildId: "tear-1",
      verify() {
        return Promise.resolve({ resultHash: "result-ok", anomalous: false });
      },
    }] : [],
    {
      id: "test-verifier",
      algorithm: "test-signature-v1",
      async sign(value) {
        return ghostSha256(value);
      },
    },
    {
      inspect() {
        return Promise.resolve({ blocked: false, reason: "moderation policy passed" });
      },
    },
    "test-pseudonym-salt",
  );
}

describe("Ghost cloud publication", () => {
  it("keeps incomplete uploads out of public metadata and atomically exposes finalized uploads", async () => {
    const cloud = service();
    const run = await manifest();
    cloud.beginUpload("player-a", run, { visibility: "public", trainingConsent: false });
    await cloud.uploadPart("player-a", run.capsuleId, 1, bytes.slice(0, 10));
    expect(await cloud.publicMetadata()).toEqual([]);

    await cloud.uploadPart("player-a", run.capsuleId, 2, bytes.slice(10));
    const verdict = await cloud.finalize("player-a", run.capsuleId, "2026-07-23T00:00:00.000Z");
    expect(verdict.status).toBe("verified");
    expect(verdict.signature).toHaveLength(64);
    expect(await cloud.publicMetadata()).toMatchObject([{ capsuleId: "capsule-1", verification: "verified" }]);
  });

  it("detects tampering and never gives an unsupported build a false verification", async () => {
    const tampered = service();
    const run = await manifest();
    tampered.beginUpload("player-a", run, { visibility: "public", trainingConsent: false });
    await tampered.uploadPart("player-a", run.capsuleId, 1, new TextEncoder().encode("tampered-capsule"));
    expect((await tampered.finalize("player-a", run.capsuleId, "2026-07-23T00:00:00.000Z")).status).toBe("rejected");

    const old = service(false);
    const historical = await manifest({ capsuleId: "old", buildId: "unsupported-build" });
    old.beginUpload("player-b", historical, { visibility: "public", trainingConsent: false });
    await old.uploadPart("player-b", "old", 1, bytes);
    const verdict = await old.finalize("player-b", "old", "2026-07-23T00:00:00.000Z");
    expect(verdict.status).toBe("unsupported");
    expect(verdict.stages.find((stage) => stage.stage === "simulation")?.status).toBe("unsupported");
  });

  it("prevents assisted and forged runs from masquerading as human records", () => {
    expect(classifyRunEligibility({
      resumed: false,
      modded: false,
      coached: true,
      ghostAssisted: false,
      bot: false,
      debug: false,
      stateForge: true,
    })).toMatchObject({
      eligibleForHumanRecords: false,
      reasons: ["coached", "stateForge"],
    });
  });

  it("supports partial download, immediate public deletion, separate consent, and immutable delayed relay", async () => {
    const cloud = service();
    const run = await manifest();
    cloud.beginUpload("player-a", run, { visibility: "unlisted", trainingConsent: true });
    await cloud.uploadPart("player-a", run.capsuleId, 1, bytes);
    await cloud.finalize("player-a", run.capsuleId, "2026-07-23T00:00:00.000Z");
    expect(new TextDecoder().decode(cloud.download(run.capsuleId, { from: 0, toExclusive: 13 }))).toBe("deterministic");

    const frame = cloud.appendRelayFrame("player-a", run.capsuleId, 10, Uint8Array.of(1, 2, 3));
    expect(frame.availableAtTick).toBe(130);
    expect(cloud.relayFrames(run.capsuleId, 129)).toEqual([]);
    expect(cloud.relayFrames(run.capsuleId, 130)).toHaveLength(1);
    expect(() => cloud.appendRelayFrame("player-a", run.capsuleId, 10, Uint8Array.of(9))).toThrow("immutable");

    cloud.setTrainingConsent("player-a", run.capsuleId, false);
    expect(cloud.delete("player-a", run.capsuleId)).toEqual({ localRetentionUnaffected: true });
    expect(cloud.download(run.capsuleId)).toBeUndefined();
    expect(await cloud.publicMetadata()).toEqual([]);
  });

  it("sanitizes public metadata and records moderation operations in an audit trail", async () => {
    const dirty = await manifest({
      title: " Contact me at ghost@example.com \u0000",
      tags: ["https://tracker.invalid/player"],
    });
    expect(sanitizeGhostMetadata(dirty)).toMatchObject({ title: "Contact me at [redacted]", tags: ["[redacted]"] });
    const cloud = service();
    cloud.beginUpload("player-a", dirty, { visibility: "private", trainingConsent: false });
    cloud.report("reviewer", dirty.capsuleId, "suspicious result");
    cloud.block("moderator", "bad-actor");
    expect(cloud.auditLog().map((entry) => entry.action)).toEqual([
      "upload.begin", "moderation.report", "identity.block",
    ]);
  });
});
