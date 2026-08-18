import { describe, expect, it } from "vitest";
import { createTearHumanCalibrationDistribution, type TearHumanCalibrationSourceReceiptV1 } from "../../src/agents";
import { stableVerificationHash } from "../../src/replay/hash";

function receipt(participantId: string, index: number): TearHumanCalibrationSourceReceiptV1 {
  const draft = { format: "tearbot-human-calibration-source" as const, schemaVersion: 1 as const, participantId, issuerId: "local", consentHash: "a".repeat(16), capsule: { id: `${participantId}-${String(index)}`, rootIntegrity: "b".repeat(16), fromTick: 0, toTick: 5, actionHash: "c".repeat(16), replayContextHash: "d".repeat(16) }, features: { commandCount: 10 + index, activeCommandCount: 4 + index, activeCommandRate: (4 + index) / (10 + index), meanInterCommandTicks: 2 + index, maximumInterCommandTicks: 4 + index } };
  return Object.freeze({ ...draft, receiptHash: stableVerificationHash(draft) });
}
const population = (extraFirst = 0) => Array.from({ length: 30 }, (_, index) => Array.from({ length: index === 0 ? 1 + extraFirst : 1 }, (_, sample) => receipt(`p-${String(index).padStart(2, "0")}`, sample))).flat();

describe("participant-balanced human calibration distribution", () => {
  it("requires 30 pseudonymous participants and selects equal deterministic samples per participant", () => {
    expect(() => createTearHumanCalibrationDistribution(population().slice(0, 29))).toThrow(/30 distinct/u);
    const one = createTearHumanCalibrationDistribution(population(2)), two = createTearHumanCalibrationDistribution(population(2).slice().reverse());
    expect(one).toMatchObject({ participantCount: 30, samplesPerParticipant: 1 });
    expect(one.distributionHash).toBe(two.distributionHash);
    expect(one.sourceReceiptHashes).toHaveLength(30);
  });

  it("rejects altered receipts rather than accepting caller-supplied anchors", () => {
    const altered = { ...receipt("p-00", 0), features: { ...receipt("p-00", 0).features, commandCount: 999 } };
    expect(() => createTearHumanCalibrationDistribution([...population().slice(1), altered])).toThrow(/invalid admitted/u);
  });
});
