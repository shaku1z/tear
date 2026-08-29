import { describe, expect, it } from "vitest";

import { PLAYGROUND_RUNTIME_STAGE_IDS } from "../../src/gameplay/stages";
import type { LiveTearRuntimeEnvironmentContext, TearStructuredRuntimeEnvironment } from "../../src/tearbench/live-runtime-contracts";
import type { LiveRuntimeSnapshotController } from "../../src/tearbench/live-runtime-snapshots";
import { launchResolvedLiveState } from "../../src/tearbench/live-state-forge-scenario-launch";
import { captureProductionReplayCheckpoint, createProductionGhostReplayComposition } from "../../src/tearbench/production-replay-composition";
import { compileResolvedTearSdlSnapshot } from "../../src/tearbench/state-forge-live-compiler";
import { PALE_STAGE_ENGINEERING_TEARSDL } from "../../src/tearbench/pale-stage-engineering-scenario";
import { resolveTearSdl } from "../../src/tearbench/tearsdl";
import type { TearSnapshotV1 } from "../../src/tearbench/contracts";

function sourceSnapshot(): TearSnapshotV1 {
  const source = createProductionGhostReplayComposition({ seed: "pale-stage-wave-41", mode: "campaign" }).create(undefined);
  return captureProductionReplayCheckpoint(source.replay, source.combat, source.waveReward, "pale-stage-wave-41-source").snapshot;
}

describe("Pale stage State Forge entry", () => {
  it("resolves a reachable engineering-only Playground preview entry", () => {
    const resolved = resolveTearSdl(PALE_STAGE_ENGINEERING_TEARSDL);
    expect(resolved.structural.valid).toBe(true);
    expect(resolved.reachability.reachable).toBe(true);
    expect(resolved.scenario.start).toMatchObject({ mode: "playground", stage: "pale-traverse", wave: 1 });
    expect(resolved.scenario.tags).toEqual(expect.arrayContaining([
      "presentation", "state-forge", "engineering-only", "non-publishable",
    ]));
  });

  it("compiles the exact isolated preview stage without campaign ownership", () => {
    const resolved = resolveTearSdl(PALE_STAGE_ENGINEERING_TEARSDL);
    const compiled = compileResolvedTearSdlSnapshot(sourceSnapshot(), resolved);
    expect(compiled.state["tear.run.v1"]).toMatchObject({ mode: "playground", wave: 1, stage: 6, _biomeIdx: 6 });
  });

  it("loads the real Pale stage before capture and transactional restore", () => {
    const resolved = resolveTearSdl(PALE_STAGE_ENGINEERING_TEARSDL);
    const source = sourceSnapshot();
    const calls: string[] = [];
    let restored: TearSnapshotV1 | undefined;
    const environment = { reset: () => { calls.push("reset"); return {} as never; } } as unknown as TearStructuredRuntimeEnvironment;
    const context = {
      replayProgression: (ledger: unknown) => {
        calls.push(`replay:${String((ledger as { targetWave: number }).targetWave)}`);
        return { reachable: true };
      },
      loadStage: (index: number) => { calls.push(`load-stage:${String(index)}`); },
    } as unknown as LiveTearRuntimeEnvironmentContext;
    const snapshots: LiveRuntimeSnapshotController = {
      capture: () => { calls.push("capture"); return source; },
      restore: (snapshot) => {
        calls.push("restore"); restored = snapshot;
        return { ok: true, exactHash: snapshot.hashes.exact, semanticHash: snapshot.hashes.semantic };
      },
    };

    expect(launchResolvedLiveState(resolved, environment, snapshots, context).ok).toBe(true);
    expect(calls).toEqual(["reset", `load-stage:${String(PLAYGROUND_RUNTIME_STAGE_IDS.indexOf("pale-traverse"))}`, "capture", "restore"]);
    expect(restored?.state["tear.run.v1"]).toMatchObject({ mode: "playground", wave: 1, stage: 6, _biomeIdx: 6 });
  });
});
