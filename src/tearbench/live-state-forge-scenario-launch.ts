import type { TearScenarioV1 } from "./contracts";
import type {
  LiveTearRuntimeEnvironmentContext,
  TearStructuredRuntimeEnvironment,
} from "./live-runtime-contracts";
import type { LiveRuntimeSnapshotController } from "./live-runtime-snapshots";
import { synthesizeProgression } from "./progression-ledger";
import { compileResolvedTearSdlSnapshot } from "./state-forge-live-compiler";
import type { TearLiveRestoreResult } from "./live-state-snapshot";
import type { TearSdlResolved } from "./tearsdl";
import { CAMPAIGN_STAGE_IDS, stageRuntimeIndexForSurface, type StageId } from "../gameplay/stages";

function naturalScenario(resolved: TearSdlResolved): TearScenarioV1 {
  const requested = resolved.scenario;
  const mode = requested.start.mode === "sandbox" ? "endless" : requested.start.mode;
  return Object.freeze({
    ...requested,
    id: `${requested.id}.natural-source`,
    stateClass: "recorded-canonical",
    start: Object.freeze({
      mode,
      difficulty: requested.start.difficulty,
      weapon: requested.start.weapon,
      wave: 1,
      ...(mode === "bossonly" && requested.start.boss !== undefined
        ? { boss: requested.start.boss } : {}),
    }),
  });
}

function seekBoss(
  environment: TearStructuredRuntimeEnvironment,
  context: LiveTearRuntimeEnvironmentContext,
): void {
  for (let tick = 0; tick < 1_500 && !context.state.enemies().some((enemy) => enemy.isBoss); tick += 1) {
    environment.step();
  }
  if (!context.state.enemies().some((enemy) => enemy.isBoss)) {
    throw new Error("State Forge could not reach the requested boss source");
  }
}

export function launchResolvedLiveState(
  resolved: TearSdlResolved,
  environment: TearStructuredRuntimeEnvironment,
  snapshots: LiveRuntimeSnapshotController,
  context: LiveTearRuntimeEnvironmentContext,
): TearLiveRestoreResult {
  environment.reset(naturalScenario(resolved));
  if (resolved.scenario.start.boss !== undefined) seekBoss(environment, context);
  const wave = resolved.scenario.start.wave ?? 1;
  if (resolved.document.stateClass === "reconstructed-reachable" && wave > 1) {
    const progression = synthesizeProgression({
      mode: resolved.scenario.start.mode,
      difficulty: resolved.scenario.start.difficulty,
      weapon: resolved.scenario.start.weapon,
      targetWave: wave,
      policy: "exact-ledger",
      configuredCampaignWaves: CAMPAIGN_STAGE_IDS.length * 10,
    });
    if (!progression.reachable) throw new TypeError(progression.explanation ?? "progression is unreachable");
    context.replayProgression(progression.ledger);
  }
  const stageId = resolved.scenario.start.stage;
  if (stageId !== undefined) {
    const surface = resolved.scenario.start.mode === "playground" ? "playground" : "adventure";
    const stageIndex = stageRuntimeIndexForSurface(stageId as StageId, surface);
    if (stageIndex < 0) throw new RangeError(`State Forge stage does not exist: ${stageId}`);
    context.loadStage(stageIndex);
  }
  const source = snapshots.capture(`${resolved.document.id}.source`);
  const forged = compileResolvedTearSdlSnapshot(source, resolved);
  return snapshots.restore(forged);
}
