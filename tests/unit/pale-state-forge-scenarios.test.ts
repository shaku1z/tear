import { describe, expect, it } from "vitest";
import { PALE_VARIANT_IDS } from "../../src/gameplay/variants";
import { captureProductionReplayCheckpoint, createProductionGhostReplayComposition } from "../../src/tearbench/production-replay-composition";
import {
  PALE_AURORA_TRACK_FORGE_TEARSDL,
  PALE_RIMEHOUND_PACK_FORGE_TEARSDL,
  PALE_VARIANT_STATE_FORGE_SCENARIOS,
  WHITE_HART_PHASE_STATE_FORGE_SCENARIOS,
} from "../../src/tearbench/pale-state-forge-scenarios";
import { compileResolvedTearSdlSnapshot } from "../../src/tearbench/state-forge-live-compiler";
import { resolveTearSdl } from "../../src/tearbench/tearsdl";

function sourceSnapshot() {
  const source = createProductionGhostReplayComposition({ seed: "pt3-c10-pale-forge", mode: "campaign" }).create(undefined);
  return captureProductionReplayCheckpoint(source.replay, source.combat, source.waveReward, "pt3-c10-pale-forge-source").snapshot;
}

describe("Pale source-owned State Forge scenarios", () => {
  it("compiles the surgical Aurora and Rimehound cases through existing codecs", () => {
    const aurora = compileResolvedTearSdlSnapshot(sourceSnapshot(), resolveTearSdl(PALE_AURORA_TRACK_FORGE_TEARSDL));
    expect(aurora.state["tear.run.v1"]).toMatchObject({ mode: "playground", wave: 41, stage: 6, _biomeIdx: 6 });
    expect(aurora.state["tear.hazard.v1"]).toMatchObject({
      fields: [expect.objectContaining({ kind: "aurora-track", direction: 1, ownerId: "pale-traverse" })],
      combatObjects: [], routes: [],
    });

    const pack = compileResolvedTearSdlSnapshot(sourceSnapshot(), resolveTearSdl(PALE_RIMEHOUND_PACK_FORGE_TEARSDL));
    expect(pack.state["tear.enemy.v1"]).toEqual([
      expect.objectContaining({ id: "enemy:1", factoryId: "rimehound" }),
      expect.objectContaining({ id: "enemy:2", factoryId: "rimehound" }),
      expect.objectContaining({ id: "enemy:3", factoryId: "rimehound" }),
    ]);
  });

  it("owns one production restore scenario per Pale variant", () => {
    expect(PALE_VARIANT_STATE_FORGE_SCENARIOS.map(({ variantId }) => variantId)).toEqual(PALE_VARIANT_IDS);
    expect(new Set(PALE_VARIANT_STATE_FORGE_SCENARIOS.map(({ id }) => id)).size).toBe(PALE_VARIANT_IDS.length);
  });

  it("resolves exact source-derived White Hart phase ordinals without replacing the natural encounter", () => {
    expect(WHITE_HART_PHASE_STATE_FORGE_SCENARIOS.map((document) => resolveTearSdl(document).scenario.start))
      .toEqual([
        expect.objectContaining({ mode: "bossonly", boss: "white-hart", bossPhase: "1" }),
        expect.objectContaining({ mode: "bossonly", boss: "white-hart", bossPhase: "2" }),
        expect.objectContaining({ mode: "bossonly", boss: "white-hart", bossPhase: "3" }),
      ]);
    expect(WHITE_HART_PHASE_STATE_FORGE_SCENARIOS.map((document) => document.state?.boss))
      .toEqual([
        expect.objectContaining({ phaseMarker: 1, atk: "antler-run" }),
        expect.objectContaining({ phaseMarker: 2, atk: "ghost-tracks" }),
        expect.objectContaining({ phaseMarker: 3, atk: "last-crossing" }),
      ]);
  });
});
