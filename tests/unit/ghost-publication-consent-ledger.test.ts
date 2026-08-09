import { describe, expect, it } from "vitest";
import { GhostLocalPublicationConsentLedger, createMemoryGhostVaultBackend } from "../../src/ghost";

const actor = Object.freeze({ subject: "firebase-account-opaque-123", isAnonymous: false });

describe("C38 local publication consent ledger", () => {
  it("starts private, pseudonymous, and no-training; only a signed-in actor can grant", async () => {
    const backend = createMemoryGhostVaultBackend(), ledger = new GhostLocalPublicationConsentLedger(backend);
    expect(await ledger.read(actor)).toMatchObject({ cloudPublication: "denied", revision: 0, privacy: "pseudonymous", visibility: "private", trainingConsent: false });
    await expect(ledger.read({ subject: "guest", isAnonymous: true })).rejects.toThrow(/signed-in nonanonymous/u);
    const granted = await ledger.decide(actor, { revision: 1, cloudPublication: "granted", decidedAt: "2026-08-09T00:00:00.000Z" });
    expect(await ledger.acceptForJob(granted)).toEqual(granted);
    const bytes = await backend.get("analysis", `ghost-publication-consent:v1:${granted.actorHash}`);
    expect(bytes).not.toContain(actor.subject); expect(bytes).not.toContain("Bearer"); expect(bytes).not.toContain("uid");
  });

  it("makes equal revisions idempotent, rejects conflicting revisions, and fails closed on corruption", async () => {
    const backend = createMemoryGhostVaultBackend(), ledger = new GhostLocalPublicationConsentLedger(backend);
    const first = await ledger.decide(actor, { revision: 1, cloudPublication: "granted", decidedAt: "2026-08-09T00:00:00.000Z" });
    await expect(ledger.decide(actor, { revision: 1, cloudPublication: "granted", decidedAt: "2026-08-09T00:00:00.000Z" })).resolves.toEqual(first);
    await expect(ledger.decide(actor, { revision: 1, cloudPublication: "revoked", decidedAt: "2026-08-09T00:00:01.000Z" })).rejects.toThrow(/conflicts/u);
    await backend.put("analysis", `ghost-publication-consent:v1:${first.actorHash}`, "not-json");
    await expect(ledger.read(actor)).rejects.toThrow(/unavailable/u);
  });

  it("rechecks action-time revocation and rejects the formerly granted record", async () => {
    const ledger = new GhostLocalPublicationConsentLedger(createMemoryGhostVaultBackend());
    const granted = await ledger.decide(actor, { revision: 1, cloudPublication: "granted", decidedAt: "2026-08-09T00:00:00.000Z" });
    await ledger.decide(actor, { revision: 2, cloudPublication: "revoked", decidedAt: "2026-08-09T00:01:00.000Z" });
    await expect(ledger.acceptForJob(granted)).rejects.toThrow(/changed or was revoked/u);
  });
});
