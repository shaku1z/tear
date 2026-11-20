import { readSeedRaceDecisions } from "./seed-race-decisions";
import { readSeedRaceRun, seedRaceInitialBuildHash } from "../gameplay/run/seed-race-contract";
import { stableVerificationHash } from "../domain/hash";
import { replayEngine, type ReplayEngine } from "./replay-engine";
import { injectedBuildIdentity } from "../gameplay/snapshot/live-capture";
import { ENTITY_KIND_REGISTRY } from "../gameplay/snapshot/codec-ids";
import { CURRENT_RULESET_VERSION } from "../gameplay/run/ruleset-version";
import { TearGameplayEventBus } from "../gameplay/runtime/gameplay-events";
import { AIM_MAGNITUDE_SCALE } from "../input/game-action";
import { mapGhostCapsuleToReplayEnvelope } from "./capsule-replay-envelope";
import { verifyGhostCapsuleProductionReplay } from "./production-replay-verification";
import {
  issueGhostRecordedOpeningPermit,
  readGhostReplayRunContext,
  type GhostReplayBuildFingerprint,
} from "./replay-admission";
import { readGhostApplicationClockSchedule } from "./application-frame-events";
import type { GhostReadCapsule } from "./capsule-reader";
import { readGhostAuthoritativeReceipt } from "./authoritative-receipt";
import {
  ghostReferenceArena,
  ghostReferenceBoundary,
  type GhostLiveReference,
  type GhostReferenceFrame,
} from "./live-ghost-reference-data";

/** Existing production replay, one forward pass. No reconstructed actors escape. */
export async function prepareGhostLiveReference(
  capsule: GhostReadCapsule,
  yieldToHost: () => Promise<void>,
  cancelled: () => boolean = () => false,
): Promise<GhostLiveReference> {
  const context = readGhostReplayRunContext(capsule.manifest.provenance);
  if (
    capsule.manifest.status !== "complete" ||
    capsule.manifest.provenance?.bossMemory !== undefined ||
    context === undefined ||
    capsule.manifest.provenance?.forkOrigin !== undefined ||
    capsule.manifest.provenance?.finaleCompanion !== undefined ||
    capsule.manifest.provenance?.ghostAssistance !== undefined ||
    !["endless", "campaign", "bossonly", "gauntlet"].includes(context.run.mode)
  )
    throw new TypeError("Chase requires a complete, unassisted compatible run from its original opening.");
  const current = injectedBuildIdentity("production-headless", stableVerificationHash(ENTITY_KIND_REGISTRY.ids));
  if (current !== undefined) {
    const ordinary =
      context.build.rulesetVersion === CURRENT_RULESET_VERSION &&
      context.build.contentHash === stableVerificationHash(ENTITY_KIND_REGISTRY.ids);
    const detached =
      context.build.rulesetVersion === current.rulesetVersion && context.build.contentHash === current.contentHash;
    if (
      ["version", "revision", "target"].some(
        (key) =>
          current[key as "version" | "revision" | "target"] !== context.build[key as keyof GhostReplayBuildFingerprint],
      ) ||
      (!ordinary && !detached)
    )
      throw new TypeError("This reference needs its original compatible game build.");
  }
  if (cancelled()) throw new Error("Reference preparation cancelled.");
  const verified = verifyGhostCapsuleProductionReplay(capsule);
  if (verified.status !== "verified") throw new TypeError("Reference authoritative playback could not be verified.");
  const mapped = mapGhostCapsuleToReplayEnvelope(capsule),
    anchor = mapped.ghost.snapshots.find((s) => s.tick === 0);
  if (mapped.issues.length || anchor === undefined) throw new TypeError("Reference opening is unavailable.");
  const seedRace = readSeedRaceRun(capsule.manifest.provenance?.seedRace);
  const anchorRace = readSeedRaceRun((anchor.state["tear.run.v1"] as Record<string, unknown>).seedRace);
  if (
    stableVerificationHash(seedRace ?? null) !== stableVerificationHash(anchorRace ?? null) ||
    (seedRace &&
      (seedRace.role !== "reference" ||
        seedRace.shared.initialBuildHash !== seedRaceInitialBuildHash(anchor.state) ||
        stableVerificationHash(seedRace.shared.build) !== stableVerificationHash(context.build)))
  )
    throw new TypeError("Race source declaration differs from its original opening");
  const terminalTick =
    mapped.ghost.events.find(
      (event) => event.source === "engine" && ["run.completed", "run.defeated", "run.abandoned"].includes(event.type),
    )?.tick ?? Infinity;
  const last = Math.min(
    terminalTick,
    verified.comparisons.reduce((end, comparison) => (comparison.equal ? Math.max(end, comparison.tick) : end), 0),
  );
  if (last < 1 || last > 1_000_000) throw new RangeError("Reference has no bounded verified continuation.");
  const clock = readGhostApplicationClockSchedule(
    capsule,
    context.run.id,
    context.simulation.applicationFrames !== undefined,
  );
  const openingPermit = issueGhostRecordedOpeningPermit(capsule);
  const receipts = new Map(
    capsule.tracks.results.flatMap((entry) => {
      const receipt = readGhostAuthoritativeReceipt(entry.value);
      return receipt?.tick === entry.tick ? [[receipt.tick, receipt] as const] : [];
    }),
  );
  const input = receipts.get(0)?.input;
  if (input === undefined) throw new TypeError("Reference opening input is unavailable.");
  const gameplayEvents = new TearGameplayEventBus();
  let replayTick = 0,
    boundaries: GhostLiveReference["splits"][number][] = [];
  const sampling: {
    session?: ReturnType<ReturnType<ReplayEngine["createProductionGhostReplayComposition"]>["create"]>;
  } = {};
  gameplayEvents.setTickSource(() => replayTick);
  gameplayEvents.subscribe((event) => {
    const active = sampling.session;
    if (active && event.kind === "wave") {
      const run = active.replay.world.state.run();
      if (!run) throw new TypeError("Reference run unavailable at native boundary.");
      const boundary = ghostReferenceBoundary(event, { stage: active.replay.stage.index, time: run.runTime });
      if (boundary) boundaries.push(boundary);
    }
  });
  const composition = replayEngine.loaded().createProductionGhostReplayComposition({
    seed: anchor.seed,
    raceDecisions: readSeedRaceDecisions(capsule, context.run.id),
    requireRecordedApplicationFrames: true,
    gameplayEvents,
    inputSnapshots: new Map([[0, input]]),
    ...(clock === undefined ? {} : { applicationClock: clock }),
    ...(openingPermit === undefined ? {} : { openingPermit }),
  });
  const session = composition.create(anchor),
    frames: GhostReferenceFrame[] = [],
    splits: GhostLiveReference["splits"][number][] = [];
  sampling.session = session;
  boundaries = []; // Constructor setup is not an emitted continuation boundary.
  if (session.replay.world.state.run()?.ghostAssistance !== undefined)
    throw new TypeError("An assisted source cannot become an unassisted recorded best.");
  const actions = new Map<number, typeof mapped.ghost.actions>();
  for (const action of mapped.ghost.actions) actions.set(action.tick, [...(actions.get(action.tick) ?? []), action]);
  const capture = (tick: number) => {
    const run = session.replay.world.state.run(),
      player = session.replay.world.state.player(),
      blade = session.replay.world.state.blade();
    if (!run || !player || !blade) throw new TypeError("Reference actor state unavailable.");
    const receipt = receipts.get(tick);
    if (receipt) {
      const expectedInput = { ...receipt.input };
      if (expectedInput.aimMagnitude === AIM_MAGNITUDE_SCALE) delete expectedInput.aimMagnitude;
      if (
        stableVerificationHash(session.semanticProjection()) !== receipt.stateHash ||
        stableVerificationHash(session.simulation.input.snapshot()) !== stableVerificationHash(expectedInput)
      )
        throw new TypeError(
          `Reference forward continuation differs from its original receipt at tick ${String(tick)}.`,
        );
    }
    const hasBoundary = boundaries.length > 0;
    splits.push(...boundaries);
    boundaries = [];
    if (tick % 6 !== 0 && tick !== last && !hasBoundary) return;
    frames.push(
      Object.freeze({
        tick,
        time: run.runTime,
        stage: session.replay.stage.index,
        wave: run.wave,
        score: run.score,
        hp: player.hp,
        maxHp: player.maxHp,
        waveTime: run.waveTime,
        arena: ghostReferenceArena(session.replay.stage.platforms),
        blocked:
          session.waveReward.screen() !== "playing" ||
          session.replay.world.context.cinema.active ||
          session.replay.world.state.bossIntro() !== null,
        player: Object.freeze({ x: player.x, y: player.y, hw: player.hw, hh: player.hh, facing: player.facing }),
        blade: Object.freeze({ x: blade.x, y: blade.y, tipX: blade.tipX, tipY: blade.tipY, state: blade.state }),
      }),
    );
  };
  capture(0);
  session.completeRecordedOpening();
  for (let tick = 1; tick <= last; tick++) {
    if (cancelled()) throw new Error("Reference preparation cancelled.");
    replayTick = tick;
    session.beforeReplayAdvance(tick);
    session.simulation.advanceExact(() => actions.get(tick) ?? [], session.replayLifecycle);
    capture(tick);
    if (tick % 32 === 0) await yieldToHost();
  }
  const actor = capsule.manifest.provenance?.actor;
  return Object.freeze({
    ...(seedRace === undefined ? {} : { seedRace }),
    version: 1,
    mode: context.run.mode,
    difficulty: context.run.difficulty,
    weapon: context.run.weaponId,
    seed: context.run.seed,
    build: context.build,
    assistance: Object.freeze({
      format: "tear-ghost-chase",
      version: 1,
      sourceId: capsule.manifest.id,
      sourceManifestHash: stableVerificationHash(capsule.manifest),
      sourceRoot: capsule.manifest.rootIntegrity,
      actor: actor === "human" ? "human" : actor === "bot" || actor === "tearbot" ? "bot" : "unknown",
      coachEnabled: true,
      ghostVisible: true,
      competitiveEligible: false,
    }),
    frames: Object.freeze(frames),
    splits: Object.freeze(splits),
  });
}
