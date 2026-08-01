import type { CommandEnvelope } from "../domain/envelopes";
import type { GameAction } from "../input/game-action";
import { normalizeGameAction } from "../input/game-action";
import { stableVerificationHash } from "../replay/hash";
import type { TearSimulationEnemyView } from "../simulation/runtime-world-port";
import type { RunRandomStreamsSnapshot } from "../simulation/run-random";
import type { TearCausalEventV1, TearObservationV1, TearScenarioV1, TearSnapshotV1,
  TearStateClass } from "./contracts";
import { TEAR_CONTRACT_FORMAT, TEAR_CONTRACT_VERSION } from "./contracts";
import { DIFFICULTY_REGISTRY, ENTITY_KIND_REGISTRY, RUN_MODE_REGISTRY, WEAPON_REGISTRY,
  type TearEntityKindId } from "./registries";
import type { TearScenarioTransition } from "./runner";
import { validateTearContract } from "./validation";
import { createLiveRuntimeSnapshotController } from "./live-runtime-snapshots"; import { projectLiveNavigationObservation } from "./live-observation-navigation";
import { projectLiveProjectiles } from "./live-observation-projectiles"; import { launchResolvedLiveState } from "./live-state-forge-scenario-launch";
import { projectLiveActorMechanics, projectLiveBehaviorMode, projectLiveBladeMechanics, projectLivePlayerMechanics } from "./live-observation-actors";
import { certifyWave99HammerProgression, createCanonicalWave99HammerProgression, createWave99HistoricalRunState,
  forgeExitLaunchSnapshot } from "./state-forge-exit-gate";
import { createGameplayCausalEvent } from "./gameplay-causal-events";
import type { StateForgeExitLaunch } from "./state-forge-exit-gate";
import type { LiveTearRuntimeEnvironmentContext, TearClassARuntimeEnvironment,
  TearClassBRuntimeEnvironment, TearRuntimeAccessClass, TearRuntimeEnvironmentMetrics,
  TearStructuredRuntimeEnvironment } from "./live-runtime-contracts";
export type * from "./live-runtime-contracts";
function availableActions(screen: string, runMode: string): readonly GameAction["type"][] {
  if (screen === "playing") return Object.freeze([
    "move", "aim", "weapon", "jump", "dash", ...(runMode === "playground" ? ["ability" as const] : []), "pause",
  ]);
  if (screen === "draft") return Object.freeze(["draft-choice"]);
  if (screen === "reserve") return Object.freeze(["reserve-choice", "cancel"]);
  if (screen === "tierup") return Object.freeze(["tier-up-choice"]);
  if (screen === "paused") return Object.freeze(["confirm", "cancel", "pause"]);
  return Object.freeze(["interact", "confirm", "cancel"]);
}

function numericSeed(seed: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) || 1;
}

function entityKind(enemy: TearSimulationEnemyView): TearEntityKindId {
  let raw = enemy.kind;
  if (typeof enemy.bossId === "string" && enemy.bossId.length > 0) raw = enemy.bossId;
  else if (enemy.kind === "support" && "supportType" in enemy && typeof enemy.supportType === "string") {
    raw = enemy.supportType;
  } else if (enemy.kind === "reflection") raw = "reflection";
  else if (enemy.kind === "wisp" && enemy.isVoidWisp === true) raw = "void-wisp";
  const candidate = raw.toLowerCase();
  if (!ENTITY_KIND_REGISTRY.has(candidate)) throw new RangeError(`unregistered live entity kind: ${candidate || "(empty)"}`);
  return candidate;
}

/** Canonical live projection over the same host-owned actors consumed by gameplay;
 * callers cannot supply transition fixtures. */
export function projectLiveTearObservation(
  context: Pick<LiveTearRuntimeEnvironmentContext, "state" | "stage" | "lifecycle" | "screen" |
    "width" | "height" | "actorId" | "choiceIds" | "platforms">,
  tick: number,
  accessClass: Exclude<TearRuntimeAccessClass, "C">,
): TearObservationV1 {
  const run = context.state.run();
  const player = context.state.player();
  const blade = context.state.blade();
  if (run === null || player === undefined || blade === undefined) {
    throw new Error("Tear runtime observation requires an active live run");
  }
  const livingEnemies = context.state.enemies().filter((enemy) => !enemy.dead);
  const boss = livingEnemies.find((enemy) => enemy.isBoss);
  return Object.freeze({
    format: TEAR_CONTRACT_FORMAT,
    kind: "observation",
    schemaVersion: TEAR_CONTRACT_VERSION,
    tick,
    observationClass: accessClass === "A" ? "privileged-diagnostic" : "structured-state",
    player: Object.freeze({
      x: player.x, y: player.y, vx: player.vx, vy: player.vy,
      hp: player.hp, maxHp: player.maxHp, facing: player.facing >= 0 ? 1 : -1,
      grounded: player.onGround, dashCharges: player.dashCharges, ...projectLivePlayerMechanics(player, accessClass),
    }),
    blade: Object.freeze({
      handX: blade.x, handY: blade.y, tipX: blade.tipX, tipY: blade.tipY,
      vx: blade.vx, vy: blade.vy, tipSpeed: blade.tipSpeed, state: blade.state,
      ...projectLiveBladeMechanics(blade, accessClass),
    }),
    entities: Object.freeze([...livingEnemies.map((enemy) => {
      const authoredState = "state" in enemy && typeof enemy.state === "string" ? enemy.state : undefined,
        attackState = typeof enemy.atk === "string" && enemy.atk.length > 0 ? enemy.atk : undefined,
        behaviorState = typeof enemy.behavior === "string" && enemy.behavior.length > 0 ? enemy.behavior : undefined,
        behaviorMode = projectLiveBehaviorMode(enemy, accessClass);
      return Object.freeze({
        id: context.actorId(enemy), kind: entityKind(enemy), x: enemy.x, y: enemy.y,
        vx: enemy.vx, vy: enemy.vy, hpRatio: enemy.maxHp > 0 ? enemy.hp / enemy.maxHp : 0,
        state: authoredState ?? attackState ?? behaviorState ?? "idle",
        ...(behaviorMode === undefined ? {} : { behaviorMode }),
        ...projectLiveActorMechanics(enemy, accessClass),
        threat: enemy.isBoss ? 1 : Math.min(1, Math.max(0, enemy.contactDmg / Math.max(1, player.maxHp))),
      });
    }), ...projectLiveProjectiles(context.state.projectiles(), player, accessClass)]),
    navigation: projectLiveNavigationObservation(context.platforms(), context.stage().name),
    run: Object.freeze({
      mode: RUN_MODE_REGISTRY.assert(run.mode),
      difficulty: DIFFICULTY_REGISTRY.assert(run.diff),
      weapon: WEAPON_REGISTRY.assert(run.weaponId),
      stage: context.stage().name, wave: run.wave, score: run.score, elapsedTicks: tick,
    }),
    ...(accessClass === "A" ? {
      diagnostics: Object.freeze({
        worldBounds: Object.freeze({ minX: 0, maxX: context.width, minY: 0, maxY: context.height }),
        waveComplete: livingEnemies.length === 0 && run.spawnQueue.length === 0,
        livingWaveEnemies: livingEnemies.length,
        ...(boss === undefined ? {} : {
          boss: Object.freeze({
            id: boss.bossId ?? boss.kind,
            phase: "phase" in boss && (typeof boss.phase === "string" || typeof boss.phase === "number")
              ? String(boss.phase)
              : ("state" in boss && typeof boss.state === "string" ? boss.state : "active"),
            validPhases: Object.freeze(boss.phaseMarks.map((mark) => String(mark))),
          }),
        }),
        paused: context.screen() === "paused",
        ui: Object.freeze({ focusableIds: Object.freeze([...context.choiceIds()]) }),
        progressTick: tick,
        softlockLimitTicks: 120 * 30,
        lifecyclePhase: context.lifecycle().phase,
      }),
    } : {}),
    availableActions: availableActions(context.screen(), run.mode),
  });
}

function createEvent(id: number, tick: number, type: TearCausalEventV1["type"],
  payload: Readonly<Record<string, unknown>>, source: TearCausalEventV1["source"] = "derived"): TearCausalEventV1 {
  const event: TearCausalEventV1 = {
    format: TEAR_CONTRACT_FORMAT, kind: "event", schemaVersion: TEAR_CONTRACT_VERSION,
    id: `live:${String(tick)}:${String(id)}`, type, tick, phase: "post-simulation-commit",
    sequence: id, source, payload: Object.freeze(payload),
  };
  return Object.freeze(event);
}

function requireStructured(accessClass: TearRuntimeAccessClass, operation: string): asserts accessClass is "A" | "B" {
  if (accessClass === "C") {
    throw new Error(`Class C is pixel/physical-input only; ${operation} is not available`);
  }
}

/** Creates the test-build-only controller for the actual browser gameplay host. */
export function createLiveTearRuntimeEnvironment(
  context: LiveTearRuntimeEnvironmentContext,
  accessClass: "A" | "B",
): TearClassARuntimeEnvironment | TearClassBRuntimeEnvironment {
  let scenario: TearScenarioV1 | null = null;
  let paused = false;
  let terminated = false;
  let observation: TearObservationV1 | null = null;
  let sequence = 0;
  let resets = 0;
  let fixedTicks = 0;
  let acceptedActions = 0;
  let screenshotCount = 0;
  let lastCallerEnvelopeId = 0;
  const eventLog: TearCausalEventV1[] = [];
  context.subscribeEngineEvent((event) => {
    if (scenario === null) return;
    eventLog.push(createGameplayCausalEvent(event, sequence, `live:${String(event.tick)}:${String(sequence++)}`));
  });

  const observe = (): TearObservationV1 => {
    requireStructured(accessClass, "structured observation");
    if (observation === null) throw new Error("Tear runtime must be reset before observation");
    observation = projectLiveTearObservation(context, context.authoritative()?.tick ?? observation.tick, accessClass);
    return observation;
  };
  const metrics = (): TearRuntimeEnvironmentMetrics => Object.freeze({
    resets, fixedTicks, acceptedActions, emittedEvents: eventLog.length, screenshots: screenshotCount,
  });
  const snapshots = createLiveRuntimeSnapshotController(context, accessClass, (snapshot, result) => {
    lastCallerEnvelopeId = 0;
    context.resetSemanticInput();
    context.drainConsumedActions();
    observation = projectLiveTearObservation(context, snapshot.tick, accessClass);
    eventLog.push(createEvent(sequence++, snapshot.tick, "system.checkpoint", {
      snapshotId: snapshot.id, operation: "restored", exactHash: result.exactHash,
    }, "developer"));
  });

  const environment: TearStructuredRuntimeEnvironment & Readonly<{ rng(): RunRandomStreamsSnapshot }> = {
    accessClass,
    reset(nextScenario) {
      requireStructured(accessClass, "programmatic reset");
      const validation = validateTearContract(nextScenario);
      if (!validation.ok || validation.value.kind !== "scenario") {
        throw new TypeError(`invalid Tear scenario: ${validation.ok ? "wrong contract kind"
          : validation.issues.map((issue) => `${issue.path} ${issue.message}`).join("; ")}`);
      }
      if (nextScenario.start.mode === "sandbox") throw new RangeError("sandbox is not a live run mode");
      if (nextScenario.stateClass !== "recorded-canonical") {
        throw new RangeError(`live reset does not forge ${nextScenario.stateClass} state; use State Forge`);
      }
      if (nextScenario.start.stage !== undefined) throw new RangeError("live reset stage selection requires State Forge");
      if (nextScenario.start.wave !== undefined && nextScenario.start.wave !== 1) {
        throw new RangeError("live reset supports only the natural opening wave; use State Forge for exact waves");
      }
      if (nextScenario.start.bossPhase !== undefined) throw new RangeError("boss-phase reset requires State Forge");
      if (nextScenario.start.boss !== undefined) {
        if (nextScenario.start.mode !== "bossonly") throw new RangeError("boss selection requires bossonly mode");
        context.selectBoss(nextScenario.start.boss);
      }
      context.stopFrameLoop();
      // Structured TearBench runs own the canonical action source for their
      // lifetime. Physical pointer sampling remains available only to the
      // visible Class-C/manual route.
      context.setSemanticInputAuthority(true);
      context.setRunSeed(numericSeed(nextScenario.seed));
      context.selectWeapon(nextScenario.start.weapon);
      context.startRun(nextScenario.start.mode, nextScenario.start.difficulty);
      context.resetSemanticInput();
      scenario = nextScenario;
      paused = false;
      terminated = false;
      sequence = 0;
      fixedTicks = 0;
      acceptedActions = 0;
      lastCallerEnvelopeId = 0;
      context.drainConsumedActions();
      eventLog.length = 0;
      resets += 1;
      observation = projectLiveTearObservation(context, 0, accessClass);
      eventLog.push(createEvent(sequence++, 0, "run.started", {
        scenarioId: nextScenario.id, seed: nextScenario.seed, runSeed: context.state.run()?.runSeed,
      }, "engine"));
      context.render();
      return observation;
    },
    observe,
    step(actions = []) {
      requireStructured(accessClass, "semantic fixed-tick step");
      if (scenario === null || observation === null) throw new Error("Tear runtime must be reset before stepping");
      const currentObservation = observation;
      if (paused) {
        return Object.freeze({ observation, events: Object.freeze([]), actions: Object.freeze([]),
          terminated: false, truncated: false, info: Object.freeze({ paused: true, stateHash: this.stateHash() }) });
      }
      if (terminated) throw new Error("cannot step a terminated Tear runtime");
      const normalizedActions = actions.map((entry) => {
        if (!Number.isSafeInteger(entry.id) || entry.id <= lastCallerEnvelopeId) {
          throw new RangeError("action envelope IDs must be strictly increasing positive command IDs");
        }
        if (entry.tick !== currentObservation.tick + 1) throw new RangeError("action envelope tick must target the next fixed tick");
        lastCallerEnvelopeId = entry.id;
        const normalized = normalizeGameAction(entry.command);
        if (!normalized.ok) throw new TypeError(normalized.reason);
        return Object.freeze({ ...entry, command: normalized.action });
      });
      const routedActions: GameAction[] = [];
      const simulationActions: typeof normalizedActions = [];
      for (const entry of normalizedActions) {
        if (["ability", "interact", "pause", "confirm", "cancel", "draft-choice",
          "reserve-choice", "tier-up-choice"].includes(entry.command.type)) routedActions.push(entry.command);
        else {
          context.pushAction(entry.command);
          simulationActions.push(entry);
        }
      }
      acceptedActions += normalizedActions.length;
      if (simulationActions.length === 0 && routedActions.length > 0 && context.screen() !== "playing") {
        for (const action of routedActions) {
          if (!context.routeAction(action)) throw new Error(`live runtime could not consume ${action.type} in ${context.screen()}`);
        }
        observation = projectLiveTearObservation(context, observation.tick, accessClass);
        const routedEvent = createEvent(sequence++, observation.tick, "ui.action-confirmed", {
          actions: routedActions.map((action) => action.type),
        }, "agent");
        eventLog.push(routedEvent);
        context.render();
        return Object.freeze({
          observation, events: Object.freeze([routedEvent]), actions: Object.freeze(normalizedActions),
          terminated, truncated: false,
          info: Object.freeze({
            stateHash: this.stateHash(), canonicalStateHash: context.authoritative()?.stateHash ?? "",
            lifecycle: context.lifecycle().phase, screen: context.screen(),
            simulationActions: 0, routedActions: routedActions.length,
          }),
        });
      }
      const prior = observation;
      const steps = context.advanceFixedTick();
      if (steps !== 1) throw new Error(`live fixed-tick bridge advanced ${String(steps)} ticks instead of exactly one`);
      for (const action of routedActions) {
        if (!context.routeAction(action)) throw new Error(`live runtime could not consume ${action.type} in ${context.screen()}`);
      }
      fixedTicks += 1;
      const consumedActions = context.drainConsumedActions();
      observation = projectLiveTearObservation(context, context.authoritative()?.tick ?? fixedTicks, accessClass);
      const tickEvents: TearCausalEventV1[] = [];
      if (normalizedActions.length > 0) tickEvents.push(createEvent(sequence++, observation.tick, "system.checkpoint", {
        acceptedActions: normalizedActions.map((entry) => entry.command.type),
      }, "agent"));
      if (observation.player.hp < prior.player.hp) tickEvents.push(createEvent(sequence++, observation.tick,
        "player.damaged", { amount: prior.player.hp - observation.player.hp }));
      eventLog.push(...tickEvents);
      context.render();
      const run = context.state.run();
      const runEnded = context.screen() === "gameover" || context.screen() === "win";
      return Object.freeze({
        observation, events: Object.freeze(tickEvents),
        actions: Object.freeze([...consumedActions, ...normalizedActions.filter((entry) =>
          routedActions.includes(entry.command))]),
        terminated: runEnded, truncated: observation.tick >= scenario.maxTicks,
        info: Object.freeze({
          stateHash: this.stateHash(), canonicalStateHash: context.authoritative()?.stateHash ?? "",
          lifecycle: context.lifecycle().phase, screen: context.screen(), score: run?.score ?? 0,
          simulationActions: simulationActions.length, routedActions: routedActions.length,
        }),
      });
    },
    renderFrame(deltaSeconds, actions = []) {
      requireStructured(accessClass, "render-profile step");
      if (!(deltaSeconds > 0) || !Number.isFinite(deltaSeconds)) {
        throw new RangeError("render-frame delta must be finite and positive");
      }
      if (scenario === null || observation === null) throw new Error("Tear runtime must be reset before stepping");
      if (paused || terminated) throw new Error("render-profile stepping requires a running Tear runtime");
      const normalizedActions = actions.map((entry) => {
        if (!Number.isSafeInteger(entry.id) || entry.id <= lastCallerEnvelopeId) {
          throw new RangeError("action envelope IDs must be strictly increasing positive command IDs");
        }
        lastCallerEnvelopeId = entry.id;
        const normalized = normalizeGameAction(entry.command);
        if (!normalized.ok) throw new TypeError(normalized.reason);
        if (["ability", "interact", "pause", "confirm", "cancel", "draft-choice",
          "reserve-choice", "tier-up-choice"].includes(normalized.action.type)) {
          throw new TypeError("render-profile stepping accepts simulation actions only");
        }
        return Object.freeze({ ...entry, command: normalized.action });
      });
      for (const entry of normalizedActions) context.pushAction(entry.command);
      acceptedActions += normalizedActions.length;
      const steps = context.advanceRenderFrame(deltaSeconds);
      fixedTicks += steps;
      const consumedActions = context.drainConsumedActions();
      observation = projectLiveTearObservation(context, context.authoritative()?.tick ?? fixedTicks, accessClass);
      context.render();
      return Object.freeze({
        observation, events: Object.freeze([]), actions: Object.freeze(consumedActions),
        terminated: context.screen() === "gameover" || context.screen() === "win",
        truncated: observation.tick >= scenario.maxTicks,
        info: Object.freeze({
          renderDeltaSeconds: deltaSeconds, simulationSteps: steps,
          stateHash: this.stateHash(), canonicalStateHash: context.authoritative()?.stateHash ?? "",
        }),
      });
    },
    actionBatch(entries) {
      const transitions: TearScenarioTransition[] = [];
      for (const entry of entries) {
        if (!Number.isSafeInteger(entry.ticks) || entry.ticks < 1) throw new RangeError("batch ticks must be a positive integer");
        for (let index = 0; index < entry.ticks; index += 1) transitions.push(this.step(index === 0 ? entry.actions : []));
      }
      return Object.freeze(transitions);
    },
    pause() {
      requireStructured(accessClass, "programmatic pause");
      if (!terminated) {
        paused = true;
        context.setScreen("paused");
        if (observation !== null) observation = projectLiveTearObservation(context, observation.tick, accessClass);
      }
    },
    resume() {
      requireStructured(accessClass, "programmatic resume");
      if (paused && !terminated) {
        paused = false;
        context.setScreen("playing");
        if (observation !== null) observation = projectLiveTearObservation(context, observation.tick, accessClass);
      }
    },
    terminate() {
      requireStructured(accessClass, "programmatic termination");
      context.terminateRun();
      context.setSemanticInputAuthority(false);
      terminated = true;
      if (observation !== null) observation = projectLiveTearObservation(context, observation.tick, accessClass);
      eventLog.push(createEvent(sequence++, observation?.tick ?? 0, "run.abandoned", {}));
    },
    metrics,
    events() {
      requireStructured(accessClass, "event stream");
      return Object.freeze([...eventLog]);
    },
    rng() {
      if (accessClass !== "A") throw new Error("RNG state is available only to Class A privileged diagnostics");
      return context.random();
    },
    stateHash() {
      requireStructured(accessClass, "state hash");
      const canonical = context.authoritative()?.stateHash;
      if (canonical !== undefined) return canonical;
      const value = observe();
      return stableVerificationHash({
        tick: value.tick, player: value.player, blade: value.blade, entities: value.entities, run: value.run,
      });
    },
    screenshot() {
      screenshotCount += 1;
      context.render();
      return context.screenshot();
    },
  };
  if (accessClass === "A") return Object.freeze({
    ...environment,
    accessClass: "A" as const,
    rng: () => context.random(),
    canonicalState: () => context.authoritative()?.state ?? null,
    setTimeEffectsForTest: (effects: Readonly<{ hitStop?: number; slowMotion?: number; timeScale?: number }>) => {
      context.setTimeEffectsForTest(effects);
    },
    captureSnapshot: (id: string, stateClass?: TearStateClass) => snapshots.capture(id, stateClass),
    restoreSnapshot: (snapshot: TearSnapshotV1) => snapshots.restore(snapshot),
    forgeExitLaunch: (launch: StateForgeExitLaunch) =>
      snapshots.restore(forgeExitLaunchSnapshot(snapshots.capture(`source-${launch.id}`), launch)),
    forgeWave99Hammer: () => {
      const progression = createCanonicalWave99HammerProgression();
      const replay = context.replayProgression(progression.ledger);
      const certificate = certifyWave99HammerProgression(progression), history = createWave99HistoricalRunState(certificate);
      const run = context.state.run(), player = context.state.player();
      if (run === null || player === undefined) throw new Error("wave-99 forge requires an active live run");
      run.wave = 99; run.score = certificate.metrics.score; run.waveKills = history.currentWaveKills; run.runTime = history.runTime; run.waveLog = [...history.waveLog];
      run.mult = certificate.metrics.style; player.maxHp = certificate.metrics.maxHp; player.hp = certificate.metrics.hp;
      Reflect.set(run, "stateForgeEvidence", { ...certificate, liveReplay: replay, ledger: progression.ledger });
      const forged = snapshots.capture("wave99-start", "reconstructed-reachable");
      return Object.freeze({ ok: true as const, exactHash: forged.hashes.exact, semanticHash: forged.hashes.semantic });
    },
    forgeResolvedScenario: (resolved: Parameters<TearClassARuntimeEnvironment["forgeResolvedScenario"]>[0]) => launchResolvedLiveState(resolved, environment, snapshots, context),
  });
  return Object.freeze({
    accessClass: "B" as const,
    reset: (scenarioInput: TearScenarioV1) => environment.reset(scenarioInput),
    observe: () => environment.observe(),
    step: (actions?: readonly CommandEnvelope<GameAction>[]) => environment.step(actions),
    renderFrame: (deltaSeconds: number, actions?: readonly CommandEnvelope<GameAction>[]) =>
      environment.renderFrame(deltaSeconds, actions),
    actionBatch: (entries: readonly Readonly<{
      actions: readonly CommandEnvelope<GameAction>[];
      ticks: number;
    }>[]) => environment.actionBatch(entries),
    pause: () => { environment.pause(); },
    resume: () => { environment.resume(); },
    terminate: () => { environment.terminate(); },
    metrics: () => environment.metrics(),
    events: () => environment.events(),
    stateHash: () => environment.stateHash(),
    screenshot: () => environment.screenshot(),
  });
}
