import { describe, expect, it } from "vitest";

import { CAMPAIGN_STAGE_IDS } from "../../src/gameplay/stages";
import type {
  LiveTearRuntimeEnvironmentContext,
  TearStructuredRuntimeEnvironment,
} from "../../src/tearbench/live-runtime-contracts";
import type { LiveRuntimeSnapshotController } from "../../src/tearbench/live-runtime-snapshots";
import { launchResolvedLiveState } from "../../src/tearbench/live-state-forge-scenario-launch";
import { captureProductionReplayCheckpoint, createProductionGhostReplayComposition } from "../../src/tearbench/production-replay-composition";
import { compileResolvedTearSdlSnapshot } from "../../src/tearbench/state-forge-live-compiler";
import { resolveTearSdl } from "../../src/tearbench/tearsdl";
import {
  VERDANT_STAGE_ENGINEERING_TEARSDL,
  VERDANT_WAVE_ENGINEERING_TEARSDL,
} from "../../src/tearbench/verdant-stage-engineering-scenario";
import type { TearSnapshotV1 } from "../../src/tearbench/contracts";

function sourceSnapshot(): TearSnapshotV1 {
  const source = createProductionGhostReplayComposition({ seed: "verdant-stage-wave-31", mode: "campaign" }).create(undefined);
  return captureProductionReplayCheckpoint(
    source.replay,
    source.combat,
    source.waveReward,
    "verdant-stage-wave-31-source",
  ).snapshot;
}

describe("Verdant stage State Forge entry", () => {
  it("locks exact engineering-only early, middle, and late wave scenarios", () => {
    expect(VERDANT_WAVE_ENGINEERING_TEARSDL.map((scenario) => scenario.start.wave)).toEqual([31, 35, 39]);
    expect(VERDANT_WAVE_ENGINEERING_TEARSDL.map((scenario) => scenario.constraints?.verdantComposition)).toEqual([
      { profile: "early", localWave: 1, controlBudget: 0, maxRootbinders: 0 },
      { profile: "middle", localWave: 5, controlBudget: 5, maxRootbinders: 1 },
      { profile: "late", localWave: 9, controlBudget: 9, maxRootbinders: 2 },
    ]);
    for (const document of VERDANT_WAVE_ENGINEERING_TEARSDL) {
      const resolved = resolveTearSdl(document);
      expect(resolved.structural.valid).toBe(true);
      expect(resolved.reachability.reachable).toBe(true);
      expect(resolved.scenario.start).toMatchObject({ mode: "campaign", stage: "verdant-sanctum" });
      expect(resolved.scenario.tags).toEqual(expect.arrayContaining(["wave-composition", "engineering-only", "non-publishable"]));
    }
  });

  it("compiles the exact campaign stage and rejects a stage-wave contradiction", () => {
    for (const document of VERDANT_WAVE_ENGINEERING_TEARSDL) {
      const resolved = resolveTearSdl(document);
      const compiled = compileResolvedTearSdlSnapshot(sourceSnapshot(), resolved);
      expect(compiled.state["tear.run.v1"]).toMatchObject({ wave: document.start.wave, stage: 3, _biomeIdx: 3 });
    }
    const resolved = resolveTearSdl(VERDANT_STAGE_ENGINEERING_TEARSDL);
    expect(() => compileResolvedTearSdlSnapshot(sourceSnapshot(), {
      ...resolved,
      scenario: { ...resolved.scenario, start: { ...resolved.scenario.start, wave: 21 } },
    })).toThrow(/wave does not belong/u);
  });

  it("loads the real stage boundary before capture and restore", () => {
    const resolved = resolveTearSdl(VERDANT_STAGE_ENGINEERING_TEARSDL);
    const source = sourceSnapshot();
    const calls: string[] = [];
    let restored: TearSnapshotV1 | undefined;
    const environment = {
      reset: () => { calls.push("reset"); return {} as never; },
    } as unknown as TearStructuredRuntimeEnvironment;
    const context = {
      replayProgression: (ledger: unknown) => { calls.push(`replay:${String((ledger as { targetWave: number }).targetWave)}`); return { reachable: true }; },
      loadStage: (index: number) => { calls.push(`load-stage:${String(index)}`); },
    } as unknown as LiveTearRuntimeEnvironmentContext;
    const snapshots: LiveRuntimeSnapshotController = {
      capture: () => { calls.push("capture"); return source; },
      restore: (snapshot) => {
        calls.push("restore");
        restored = snapshot;
        return { ok: true, exactHash: snapshot.hashes.exact, semanticHash: snapshot.hashes.semantic };
      },
    };

    const result = launchResolvedLiveState(resolved, environment, snapshots, context);

    expect(result.ok).toBe(true);
    expect(calls).toEqual(["reset", "replay:31", `load-stage:${String(CAMPAIGN_STAGE_IDS.indexOf("verdant-sanctum"))}`, "capture", "restore"]);
    expect(restored?.state["tear.run.v1"]).toMatchObject({ wave: 31, stage: 3, _biomeIdx: 3 });
  });
});
