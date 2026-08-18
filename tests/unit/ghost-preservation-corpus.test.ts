import { afterEach, describe, expect, it, vi } from "vitest";
import fixture from "../fixtures/c39-preservation-corpus.json";
import { GhostLocalVault } from "../../src/ghost/capsule-vault";
import { runGhostPreservationCorpus, type GhostPreservationCorpusFixtureV1 } from "../../src/ghost/preservation-corpus";
const corpusFixture = fixture as unknown as GhostPreservationCorpusFixtureV1;

describe("C39 local Ghost preservation corpus", () => {
  afterEach(() => vi.restoreAllMocks());
  it("materializes immutable sources and reports every honest compatibility outcome", async () => {
    const before = JSON.stringify(corpusFixture);
    const report = await runGhostPreservationCorpus(corpusFixture);
    expect(JSON.stringify(corpusFixture)).toBe(before);
    expect(report.results.map((entry) => [entry.id, entry.outcome])).toEqual([
      ["v2-exact", "exact"], ["v1-migrated", "migrated"], ["v1-visual-only", "visual-only"],
      ["future-unsupported", "unsupported"], ["corrupt-rejected", "rejected"],
    ]);
    const exact = report.results[0]?.reader;
    expect(exact?.mappedCommands).toBe(1);
    expect(exact?.rootIntegrity).toMatch(/^[a-f0-9]{16}$/u);
    expect(report.results[1]?.reader?.bytes).toBe(0);
    expect(report.results[2]?.reader).toMatchObject({ bytes: 0, mappedCommands: 0 });
  });

  it("rejects fixture drift", async () => {
    await expect(runGhostPreservationCorpus({
      ...corpusFixture,
      cases: corpusFixture.cases.map((entry) => entry.id === "v2-exact" ? { ...entry, expected: "rejected" } : entry),
    })).rejects.toThrow(/unexpected expected outcome/u);
  });

  it("fails closed on descriptor drift before it imports any source", async () => {
    const importCapsule = vi.spyOn(GhostLocalVault.prototype, "importCapsule");
    await expect(runGhostPreservationCorpus({
      ...corpusFixture,
      cases: corpusFixture.cases.map((entry) => entry.id === "corrupt-rejected" ? { ...entry, source: { ...entry.source, hash: "0".repeat(16) } } : entry),
    })).rejects.toThrow(/source descriptor drifted before Vault import/u);
    expect(importCapsule).not.toHaveBeenCalled();
  });
});
