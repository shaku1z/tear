import { describe, expect, it } from "vitest";
import { TearHumanCalibrationLocalConsentLedger } from "../../src/agents";
import { createMemoryGhostVaultBackend } from "../../src/ghost";

describe("human calibration local consent ledger", () => {
  it("keeps an explicit opt-in readable for admission and makes revocation visible but unavailable to training", async () => {
    const ledger = new TearHumanCalibrationLocalConsentLedger(createMemoryGhostVaultBackend());
    await ledger.set("signed-in-player", "anonymous-improvement", "consent-1");
    expect(await ledger.current("signed-in-player")).toMatchObject({ consent: "anonymous-improvement" });
    await ledger.set("signed-in-player", "revoked", "consent-2");
    expect(await ledger.read("signed-in-player")).toMatchObject({ consent: "revoked", revision: "consent-2" });
    expect(await ledger.current("signed-in-player")).toBeUndefined();
  });

  it("does not treat malformed local bytes as consent", async () => {
    const backend = createMemoryGhostVaultBackend(), ledger = new TearHumanCalibrationLocalConsentLedger(backend);
    await backend.put("analysis", "tearbot-human-calibration-consent:v1:signed-in-player", "not-json");
    expect(await ledger.read("signed-in-player")).toBeUndefined();
    expect(await ledger.current("signed-in-player")).toBeUndefined();
  });
});
