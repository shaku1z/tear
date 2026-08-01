import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import type { CommandEnvelope } from "../../src/domain/envelopes";
import type { FinaleIntent } from "../../src/gameplay/campaign/finale-controller";
import type { FinaleOutwardCall } from "../../src/gameplay/campaign/finale-outward-call";
import type {
  OutcomeChronologyEffect,
  OutcomeChronologyEntry,
} from "../../src/gameplay/run/outcome-chronology-journal";
import { TearGameplayEventBus, type TearGameplayEvent } from
  "../../src/gameplay/runtime/gameplay-events";
import { applyWeapon } from "../../src/gameplay/weapons";
import type { GameAction } from "../../src/input/game-action";
import {
  applyTearCodecConfiguration,
  hydrateTearCodecWorld,
  type TearCodecValue,
} from "../../src/tearbench";
import { projectGameplayEventForParity, type TearSemanticEngineEventV1 } from
  "../../src/tearbench/gameplay-causal-events";
import {
  createDetachedCombatSimulation,
  createDetachedFinaleComposition,
  createDetachedRunOutcomeController,
  createDetachedWaveRewardRuntime,
  createDetachedWorld,
  type CapturedSynchronousOutcomeInputs,
  restoreDetachedChapterBinding,
  restoreDetachedTransientRuntime,
} from "./detached-world-harness";

const ARTIFACT = resolve("artifacts/tearbench/c27a/campaign-source-victory.json");
interface RuntimeSnapshot {
  readonly tick: number;
  readonly state: Record<string, TearCodecValue>;
}

interface CampaignVictoryArtifact {
  readonly scenario: { readonly seed: string };
  readonly preFinale: RuntimeSnapshot;
  readonly preFinaleHeldActions: readonly GameAction[];
  readonly terminal: RuntimeSnapshot;
  readonly finaleIntents: readonly (readonly FinaleIntent[])[];
  readonly finaleOutward: readonly FinaleOutwardCall[];
  readonly outcomeChronology: readonly OutcomeChronologyEntry[];
  readonly events: readonly TearSemanticEngineEventV1[];
  readonly terminalRun: Readonly<Record<string, unknown>>;
  readonly terminalWorld: Readonly<Record<string, unknown>>;
  readonly terminalUi: Readonly<Record<string, unknown>>;
  readonly terminalCinema: Readonly<Record<string, unknown>>;
}

function readArtifact(): CampaignVictoryArtifact | null {
  if (!existsSync(ARTIFACT)) return null;
  const parsed = JSON.parse(readFileSync(ARTIFACT, "utf8")) as Partial<CampaignVictoryArtifact>;
  return parsed.preFinale === undefined || parsed.preFinaleHeldActions === undefined
    || parsed.finaleIntents === undefined || parsed.finaleOutward === undefined
    || parsed.outcomeChronology === undefined
    ? null
    : parsed as CampaignVictoryArtifact;
}

function effectsOf<Type extends OutcomeChronologyEffect["type"]>(
  chronology: readonly OutcomeChronologyEntry[],
  type: Type,
): readonly Extract<OutcomeChronologyEffect, Readonly<{ type: Type }>>[] {
  const effects = chronology.map((entry) => entry.effect).filter((effect) => effect.type === type);
  return effects as unknown as readonly Extract<OutcomeChronologyEffect, Readonly<{ type: Type }>>[];
}

function requireSingleEffect<Type extends OutcomeChronologyEffect["type"]>(
  chronology: readonly OutcomeChronologyEntry[],
  type: Type,
): Extract<OutcomeChronologyEffect, Readonly<{ type: Type }>> {
  const entries = effectsOf(chronology, type);
  if (entries.length !== 1 || entries[0] === undefined) {
    throw new Error(`campaign victory outcome transcript requires one ${type}, received ${String(entries.length)}`);
  }
  return entries[0];
}

function deriveCapturedSynchronousOutcomeInputs(
  chronology: readonly OutcomeChronologyEntry[],
): CapturedSynchronousOutcomeInputs {
  const score = requireSingleEffect(chronology, "outcome.score-newness-decided");
  const coinAward = requireSingleEffect(chronology, "outcome.coins-awarded");
  const wallet = requireSingleEffect(chronology, "outcome.wallet-read");
  const terminal = requireSingleEffect(chronology, "outcome.terminal-published");
  const telemetry = requireSingleEffect(chronology, "outcome.economy-telemetry-read");
  const intents = requireSingleEffect(chronology, "outcome.victory-intents-dispatched");
  const stored = requireSingleEffect(chronology, "outcome.prepared-stored");
  const pending = requireSingleEffect(chronology, "outcome.pending-finale-write-requested");
  const presentation = requireSingleEffect(chronology, "outcome.presentation-dispatched");
  const policies = effectsOf(chronology, "outcome.achievement-policy-read");
  const bestReads = effectsOf(chronology, "outcome.best-read");
  if (terminal.outcome !== "victory" || presentation.outcome !== "victory") {
    throw new Error("campaign victory outcome transcript contains a non-victory terminal adapter result");
  }
  if (coinAward.score !== score.run.score || telemetry.earned !== coinAward.earned) {
    throw new Error("campaign victory outcome transcript has incompatible score/economy adapter inputs");
  }
  const prepared = Object.freeze({ isNew: score.isNew, earned: coinAward.earned, coins: wallet.coins });
  expect(stored.prepared).toEqual(prepared);
  expect(terminal.run).toEqual(score.run);
  if (policies.length !== 3 || policies.some((policy) => policy.enabled !== policies[0]?.enabled)) {
    throw new Error("campaign victory outcome transcript must retain three consistent achievement-policy reads");
  }
  if (bestReads.length !== 2 || bestReads[0] === undefined || bestReads[1] === undefined) {
    throw new Error("campaign victory outcome transcript must retain both best-score reads");
  }
  expect(bestReads[0].run).toEqual(score.run);
  expect(bestReads[1].run).toEqual(score.run);
  expect(bestReads[1].best).toEqual(bestReads[0].best);
  return Object.freeze({
    run: score.run,
    prepared,
    best: bestReads[0].best,
    achievementTracking: policies[0]?.enabled ?? false,
    economyTelemetry: telemetry.telemetry,
    victoryIntents: intents.intents,
    pendingFinale: pending.record,
    presentation: Object.freeze({ outcome: presentation.outcome, result: presentation.result }),
  });
}

function restorePreFinale(artifact: CampaignVictoryArtifact) {
  const detached = createDetachedWorld({ seed: artifact.scenario.seed, mode: "campaign" });
  const codecWorld = {
    components: new Map(Object.entries(artifact.preFinale.state)),
    references: new Map<string, string>(),
    entityIds: new Set<string>(),
  } as never;
  const staged = hydrateTearCodecWorld(
    { ...detached.world.entities, hydrateReward: () => null },
    codecWorld,
    { requireIdentity: (id: string) => id },
  );
  const { world } = detached;
  world.state.setRun(staged.run);
  world.state.setPlayer(staged.player);
  world.state.setBlade(staged.blade);
  world.state.setEnemies(staged.enemies);
  world.state.setProjectiles(staged.projectiles);
  world.state.setFloaters(staged.floaters as never);
  world.state.setSlowZones(staged.slowZones as never);
  world.state.setTemporaryWalls(staged.walls as never);

  detached.configuration.resetToBase();
  const weapon = applyWeapon(detached.configuration.value, staged.weaponId);
  const restoredConfiguration = detached.configuration.snapshot();
  applyTearCodecConfiguration(restoredConfiguration, staged.configuration);
  detached.configuration.restore(restoredConfiguration);
  Object.assign(staged.blade as { weapon: unknown; model: unknown }, { weapon, model: weapon.model });
  const rng = artifact.preFinale.state["tear.rng.v1"];
  if (rng !== undefined) world.context.services.random.restore(rng as never);
  detached.stage.index = staged.stageIndex;
  detached.stage.platforms = [...staged.platforms];

  restoreDetachedTransientRuntime(detached, staged.runtime);
  restoreDetachedChapterBinding(detached, staged.runtime);
  return { detached, staged };
}

function withoutSequence(event: TearSemanticEngineEventV1): Omit<TearSemanticEngineEventV1, "sequence"> {
  const { sequence, ...rest } = event;
  void sequence;
  return rest;
}

const artifact = readArtifact();

describe.skipIf(artifact === null)("detached finale against the live campaign victory", () => {
  it("replays the exact post-defeat boundary through identical finale intents and victory state", () => {
    if (artifact === null) throw new Error("campaign victory artifact is missing the finale parity boundary");
    const { detached, staged } = restorePreFinale(artifact);
    const native: TearGameplayEvent[] = [];
    const events = new TearGameplayEventBus(() => artifact.preFinale.tick);
    events.subscribe((event) => { native.push(event); });
    const capturedOutcomeInputs = deriveCapturedSynchronousOutcomeInputs(artifact.outcomeChronology);
    const outcome = createDetachedRunOutcomeController(detached, events, { capturedInputs: capturedOutcomeInputs });
    const finale = createDetachedFinaleComposition(detached, events, outcome);
    let updateWave: (seconds: number) => void = () => undefined;
    const core = createDetachedCombatSimulation(detached, {
      platforms: detached.stage.platforms,
      gameplayEvents: events,
      updateWave: (seconds) => { updateWave(seconds); },
      finale: {
        snapshot: finale.snapshot,
        markLanded: finale.markLanded,
        tryBladeCut: finale.tryBladeCut,
      },
      snapshot: (tick) => ({
        tick,
        lifecycle: detached.world.lifecycle.snapshot(),
        cinema: detached.world.context.cinema.captureState(),
        finale: finale.snapshot(),
      }),
    });
    const waves = createDetachedWaveRewardRuntime(
      detached,
      events,
      (enemy) => core.combatEntityRuntime.id(enemy, "enemy"),
      detached.stage.platforms,
      finale,
    );
    updateWave = waves.update;
    core.combatEntityRuntime.restoreIdentityState(staged.identityState as never);
    for (const binding of staged.identityBindings) core.combatEntityRuntime.bindId(binding.entity, binding.id);
    core.simulationRuntime.reset(artifact.preFinale.tick);
    core.authoritativeInput.beginTick(
      artifact.preFinale.tick,
      artifact.preFinaleHeldActions.map((command, index): CommandEnvelope<GameAction> => ({
        kind: "command", tick: artifact.preFinale.tick, id: index + 1, command,
      })),
    );
    events.setTickSource(() => core.simulationRuntime.scheduler.tick);

    let clearSteps = 0;
    while (detached.world.lifecycle.phase !== "finale" && clearSteps < 1_200) {
      core.simulationRuntime.advanceOne([]);
      clearSteps += 1;
    }
    expect(detached.world.lifecycle.phase).toBe("finale");
    expect(clearSteps).toBeGreaterThan(0);
    expect(clearSteps).toBeLessThan(1_200);

    let frames = 0;
    while (detached.world.lifecycle.phase !== "terminated" && frames < 900) {
      if (frames === 0) detached.world.context.cinema.requestSkip();
      finale.advanceApplicationFrame(
        1 / 60,
        (seconds) => core.simulationRuntime.advance(seconds * 1_000, () => []),
      );
      frames += 1;
    }

    expect(frames).toBeLessThan(900);
    outcome.assertCapturedInputsConsumed();
    expect(finale.intentBatches).toEqual(artifact.finaleIntents);
    expect(finale.outwardCalls).toEqual(artifact.finaleOutward);
    expect(finale.outcomeChronology).toEqual(artifact.outcomeChronology);
    expect(finale.outwardCalls
      .filter((call) => call.type === "world-zoom" || call.type === "flash" || call.type === "shake")
      .map((call) => ({ type: call.type, receipt: call.receipt })))
      .toEqual([
        { type: "world-zoom", receipt: { requested: 0.84, immediate: true,
          before: { current: 0.8000000001419295, target: 1 }, after: { current: 0.84, target: 0.84 } } },
        { type: "flash", receipt: { requested: 0.135, before: 0, after: 0.135, aggregation: "maximum" } },
        { type: "shake", receipt: { requested: 5, before: 16.125, after: 16.125, aggregation: "maximum" } },
        { type: "flash", receipt: { requested: 0.17, before: 0.135, after: 0.17, aggregation: "maximum" } },
        { type: "shake", receipt: { requested: 7, before: 16.125, after: 16.125, aggregation: "maximum" } },
        { type: "flash", receipt: { requested: 0.20500000000000002, before: 0.17,
          after: 0.20500000000000002, aggregation: "maximum" } },
        { type: "shake", receipt: { requested: 9, before: 16.125, after: 16.125, aggregation: "maximum" } },
        { type: "world-zoom", receipt: { requested: 1, immediate: true,
          before: { current: 0.84, target: 0.84 }, after: { current: 1, target: 1 } } },
      ]);
    expect(finale.outwardCalls
      .filter((call) => call.type === "ring" || call.type === "burst")
      .map((call) => call.receipt))
      .toEqual([
        { accepted: true, requested: 1, emitted: 1, rejected: { culled: 0, budget: 0 }, listDelta: 1 },
        { accepted: true, requested: 14, emitted: 14, rejected: { culled: 0, budget: 0 }, listDelta: 14 },
        { accepted: true, requested: 1, emitted: 1, rejected: { culled: 0, budget: 0 }, listDelta: 1 },
        { accepted: true, requested: 14, emitted: 14, rejected: { culled: 0, budget: 0 }, listDelta: 14 },
        { accepted: true, requested: 1, emitted: 1, rejected: { culled: 0, budget: 0 }, listDelta: 1 },
        { accepted: true, requested: 14, emitted: 14, rejected: { culled: 0, budget: 0 }, listDelta: 14 },
      ]);
    const liveAfterBoundary = artifact.events
      .filter((event) => event.tick > artifact.preFinale.tick)
      .map(withoutSequence);
    expect(native.map((event, sequence) => withoutSequence(projectGameplayEventForParity(event, sequence))))
      .toEqual(liveAfterBoundary);

    const run = detached.world.state.run() as never as Record<string, unknown>;
    expect(detached.world.lifecycle.snapshot()).toMatchObject({ phase: "terminated", outcome: "victory", wave: 50 });
    expect(detached.world.context.cinema.active).toBe(false);
    expect(finale.snapshot()).toBeNull();
    expect(finale.outcome.pendingFinale()).toBeNull();
    const presented = finale.outcome.presented();
    expect(presented?.outcome).toBe("victory");
    expect(presented?.result).toMatchObject({ win: true, campaign: true, wave: 50 });
    expect(run).toMatchObject({
      mode: artifact.terminalRun.mode,
      diff: artifact.terminalRun.diff,
      weaponId: artifact.terminalRun.weaponId,
      wave: artifact.terminalRun.wave,
      score: artifact.terminalRun.score,
    });
    expect(detached.world.lifecycle.snapshot()).toMatchObject(
      (artifact.terminalWorld.runtime as { lifecycle: Record<string, unknown> }).lifecycle,
    );
    expect(finale.outcome.presented()?.outcome).toBe(artifact.terminalUi.screen === "win" ? "victory" : undefined);
    expect(detached.world.context.cinema.active).toBe(artifact.terminalCinema.active);
  });
});
