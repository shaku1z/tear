import { stableVerificationHash } from "../domain/hash";
import type { TearCausalEventV1, TearSnapshotV1 } from "../tearbench/contracts";
import { createProductionGhostReplayComposition } from "../tearbench/production-replay-composition";
import { TearGameplayEventBus } from "../gameplay/runtime/gameplay-events";
import { createGameplayCausalEvent } from "../tearbench/gameplay-causal-events";
import { mapGhostCapsuleToReplayEnvelope } from "./capsule-replay-envelope";
import type { GhostReadCapsule } from "./capsule-reader";
import { readGhostAuthoritativeReceipt } from "./authoritative-receipt";
import { readGhostApplicationClockSchedule } from "./application-frame-events";
import { GhostProductionReplayWorld } from "./replay-world";
import { createGhostV3 } from "./truth-kernel";
import { readGhostReplayRunContext } from "./replay-admission";
import { requireGhostForkPermit, type GhostForkPermit } from "./fork-origin";
import { createChallengeAttemptProof } from "./player-experiences";

export interface RecordedGhostChallenge {
  readonly format: "tearghost-local-challenge";
  readonly schemaVersion: 1;
  readonly parentId: string;
  readonly parentRoot: string;
  readonly forkTick: number;
  readonly rule: "blade-return" | "wave-clear" | "boss-defeat";
  readonly target: string;
  readonly limitTicks: number;
  readonly label: string;
}
export interface RecordedGhostChallengeResult {
  readonly format: "tearghost-local-challenge-result";
  readonly schemaVersion: 1;
  readonly definition: RecordedGhostChallenge;
  readonly attemptId: string;
  readonly attemptRoot: string;
  readonly status: "succeeded" | "abandoned" | "defeated";
  readonly elapsedTicks: number;
  readonly eventId?: string;
  readonly finalTick: number;
  readonly proof: ReturnType<typeof createChallengeAttemptProof>;
}
const record = (value: unknown): Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : {};

export function readRecordedGhostChallenge(value: unknown): RecordedGhostChallenge {
  const raw = record(value);
  if (
    Object.keys(raw).sort().join() !==
      ["format", "schemaVersion", "parentId", "parentRoot", "forkTick", "rule", "target", "limitTicks", "label"]
        .sort()
        .join() ||
    raw.format !== "tearghost-local-challenge" ||
    raw.schemaVersion !== 1 ||
    !["blade-return", "wave-clear", "boss-defeat"].includes(String(raw.rule)) ||
    !Number.isSafeInteger(raw.forkTick) ||
    Number(raw.forkTick) < 0 ||
    !Number.isSafeInteger(raw.limitTicks) ||
    Number(raw.limitTicks) < 1 ||
    Number(raw.limitTicks) > 20000 ||
    [raw.parentId, raw.parentRoot, raw.target, raw.label].some(
      (field) => typeof field !== "string" || field.length === 0 || field.length > 256,
    )
  )
    throw new TypeError("Unsupported local challenge rule.");
  return Object.freeze(structuredClone(raw)) as unknown as RecordedGhostChallenge;
}

export function challengeGoal(
  definition: RecordedGhostChallenge,
  events: readonly TearCausalEventV1[],
): TearCausalEventV1 | undefined {
  const after = events.filter(
    (event) =>
      event.source === "engine" &&
      event.tick > definition.forkTick &&
      event.tick <= definition.forkTick + definition.limitTicks,
  );
  if (definition.rule === "wave-clear")
    return after.find((event) => event.type === "wave.cleared" && String(event.payload.wave) === definition.target);
  if (definition.rule === "boss-defeat")
    return after.find(
      (event) =>
        event.type === "enemy.defeated" &&
        event.actorId === definition.target &&
        typeof event.payload.cause === "string",
    );
  const throws = new Map(
    after
      .filter(
        (event) =>
          event.type === "blade.thrown" &&
          Number.isSafeInteger(event.payload.throwId) &&
          typeof event.payload.weaponId === "string",
      )
      .map((event) => [`${String(event.payload.weaponId)}:${String(event.payload.throwId)}`, event.tick]),
  );
  return after.find(
    (event) =>
      event.type === "blade.caught" &&
      Number.isSafeInteger(event.payload.throwId) &&
      (throws.get(`${String(event.payload.weaponId)}:${String(event.payload.throwId)}`) ?? Infinity) <= event.tick,
  );
}

/** Definitions are derived from the selected immutable source, not caller counters. */
export function recordedGhostChallengeChoices(
  parent: GhostReadCapsule,
  snapshot: TearSnapshotV1,
): readonly RecordedGhostChallenge[] {
  if (parent.manifest.provenance?.seedRace !== undefined) return Object.freeze([]);
  const mapped = mapGhostCapsuleToReplayEnvelope(parent),
    tick = snapshot.tick,
    run = record(snapshot.state["tear.run.v1"]);
  if (mapped.issues.length > 0 || !["playing", "paused"].includes(String(record(snapshot.state["tear.ui.v1"]).screen)))
    return [];
  const make = (
    rule: RecordedGhostChallenge["rule"],
    target: string,
    label: string,
    limitTicks = 20000,
  ): RecordedGhostChallenge =>
    Object.freeze({
      format: "tearghost-local-challenge",
      schemaVersion: 1,
      parentId: parent.manifest.id,
      parentRoot: mapped.ghost.rootHash,
      forkTick: tick,
      rule,
      target,
      label,
      limitTicks,
    });
  const choices: RecordedGhostChallenge[] = [];
  const reference = challengeGoal(make("blade-return", "transport", "Blade return"), mapped.ghost.events);
  if (reference !== undefined)
    choices.push(
      make("blade-return", "transport", `RETURN RACE · ${String(reference.tick - tick)} TICKS`, reference.tick - tick),
    );
  if (Number.isSafeInteger(run.wave) && Number(run.wave) > 0)
    choices.push(make("wave-clear", String(run.wave), `CLEAR WAVE ${String(run.wave)}`));
  const bosses = snapshot.state["tear.boss.v1"];
  if (Array.isArray(bosses))
    for (const boss of bosses) {
      const actor = record(boss);
      if (
        typeof actor.id === "string" &&
        typeof actor.bossId === "string" &&
        Number(actor.hp) > 0 &&
        actor.dead !== true
      )
        choices.push(make("boss-defeat", actor.id, `BOSS MEMORY · ${actor.bossId.toUpperCase()}`));
    }
  return Object.freeze(choices);
}

/** Rebuild from the origin ONLY; later archive keyframes cannot manufacture a goal. */
export function verifyRecordedGhostChallenge(
  capsule: GhostReadCapsule,
  parent: GhostReadCapsule,
  permit: GhostForkPermit,
): RecordedGhostChallengeResult {
  if (parent.manifest.provenance?.seedRace !== undefined)
    throw new TypeError(
      "Seed-Locked Race requires a fresh Race This Reference start; local challenge forks are unsupported",
    );
  const origin = requireGhostForkPermit(capsule, permit);
  if (origin === undefined) throw new TypeError("Challenge requires a recorded fork origin.");
  const definition = readRecordedGhostChallenge(capsule.manifest.provenance?.challenge);
  if (stableVerificationHash(definition) !== origin.challengeHash)
    throw new TypeError("Challenge declaration changed.");
  const parentSnapshot = mapGhostCapsuleToReplayEnvelope(parent).ghost.snapshots.find(
    (snapshot) => snapshot.id === origin.checkpoint.id,
  );
  if (
    parentSnapshot === undefined ||
    !recordedGhostChallengeChoices(parent, parentSnapshot).some(
      (choice) => stableVerificationHash(choice) === origin.challengeHash,
    )
  )
    throw new TypeError("Challenge is not supported by the parent checkpoint.");
  const mapped = mapGhostCapsuleToReplayEnvelope(capsule),
    anchor = mapped.ghost.snapshots.find((snapshot) => snapshot.tick === origin.checkpoint.tick);
  const receipts = capsule.tracks.results.flatMap((entry) => {
    const receipt = readGhostAuthoritativeReceipt(entry.value);
    return receipt?.tick === entry.tick ? [receipt] : [];
  });
  const last = receipts.at(-1),
    initial = receipts.find((receipt) => receipt.tick === origin.checkpoint.tick);
  if (
    anchor === undefined ||
    last === undefined ||
    initial === undefined ||
    last.tick - origin.checkpoint.tick > definition.limitTicks ||
    receipts.some((receipt, index) => index > 0 && receipt.tick <= Number(receipts[index - 1]?.tick))
  )
    throw new TypeError("Challenge has no bounded unique final authoritative receipt.");
  const context = readGhostReplayRunContext(capsule.manifest.provenance);
  if (context === undefined) throw new TypeError("Challenge run context unavailable.");
  const events: TearCausalEventV1[] = [],
    bus = new TearGameplayEventBus();
  let tick = anchor.tick;
  bus.setTickSource(() => tick);
  bus.subscribe((event) => {
    events.push(createGameplayCausalEvent(event, events.length + 1, `reexecuted-${String(events.length)}`, "engine"));
  });
  const clock = readGhostApplicationClockSchedule(
    capsule,
    context.run.id,
    context.simulation.applicationFrames !== undefined,
  );
  const composition = createProductionGhostReplayComposition({
    seed: anchor.seed,
    forkOrigin: origin,
    inputSnapshots: new Map([[anchor.tick, initial.input]]),
    gameplayEvents: bus,
    requireRecordedApplicationFrames: true,
    ...(clock === undefined ? {} : { applicationClock: clock }),
  });
  const replay = new GhostProductionReplayWorld(createGhostV3({ ...mapped.ghost, snapshots: [anchor] }), {
    create(snapshot) {
      const session = composition.create(snapshot);
      return {
        ...session,
        beforeReplayAdvance(next: number) {
          tick = next;
          session.beforeReplayAdvance(next);
        },
        afterReplayAdvance() {
          const expected = receipts.find((receipt) => receipt.tick === tick);
          if (expected !== undefined && stableVerificationHash(session.semanticProjection()) !== expected.stateHash)
            throw new TypeError(`Challenge continuation mismatch at ${String(tick)}.`);
        },
      };
    },
  });
  const final = replay.seek(last.tick);
  if (final.semanticHash !== last.stateHash)
    throw new TypeError("Challenge final state disagrees with native execution.");
  const actual = challengeGoal(definition, events),
    recorded = challengeGoal(
      definition,
      mapped.ghost.events.filter((event) => event.tick <= last.tick),
    );
  if (
    (actual === undefined) !== (recorded === undefined) ||
    (actual !== undefined &&
      recorded !== undefined &&
      (actual.tick !== recorded.tick ||
        stableVerificationHash({ type: actual.type, actorId: actual.actorId ?? null, payload: actual.payload }) !==
          stableVerificationHash({
            type: recorded.type,
            actorId: recorded.actorId ?? null,
            payload: recorded.payload,
          })))
  )
    throw new TypeError("Recorded challenge goal was not reproduced by native execution.");
  const endings = capsule.tracks.results.filter((entry) => record(entry.value).format === "tearghost-challenge-end");
  const end = record(endings[0]?.value),
    reason = end.reason;
  if (
    endings.length !== 1 ||
    end.authoritativeTick !== last.tick ||
    end.originTick !== definition.forkTick ||
    Object.keys(end).sort().join() !== ["format", "reason", "authoritativeTick", "originTick"].sort().join() ||
    !["goal", "abandoned", "defeated"].includes(String(reason))
  )
    throw new TypeError("Challenge end is missing, unsupported or ambiguous.");
  const defeated = events.some((event) => event.type === "run.defeated" && event.tick === last.tick);
  if (
    (reason === "defeated") !== defeated ||
    (reason === "goal" && recorded?.tick !== last.tick) ||
    (reason === "abandoned" && recorded !== undefined)
  )
    throw new TypeError("Challenge endpoint disagrees with native goal/defeat execution.");
  const status =
    reason === "goal" && recorded !== undefined ? "succeeded" : reason === "defeated" ? "defeated" : "abandoned";
  const elapsedTicks = (recorded?.tick ?? last.tick) - definition.forkTick;
  const proof = createChallengeAttemptProof(
    {
      id: stableVerificationHash(definition),
      kind: definition.rule === "boss-defeat" ? "boss-memory" : "seed-locked-race",
      sourceGhostId: definition.parentId,
      sourceRootHash: definition.parentRoot,
      rulesVersion: "native-local-challenge-v1",
      seedPolicy: { kind: "locked", seed: context.run.seed },
      conditions: [{ metric: "nativeGoalReexecuted", operator: "==", value: "yes" }],
    },
    { id: capsule.manifest.id, rootHash: mapped.ghost.rootHash },
    { nativeGoalReexecuted: status === "succeeded" ? "yes" : "no", elapsedTicks },
  );
  return Object.freeze({
    format: "tearghost-local-challenge-result",
    schemaVersion: 1,
    definition,
    attemptId: capsule.manifest.id,
    attemptRoot: capsule.manifest.rootIntegrity,
    status,
    elapsedTicks,
    finalTick: last.tick,
    ...(recorded === undefined ? {} : { eventId: recorded.id }),
    proof,
  });
}
