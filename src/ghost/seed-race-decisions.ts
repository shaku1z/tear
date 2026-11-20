import { isRecord } from "../domain/records";
import { readBeatRunBinding } from "../gameplay/run/beat-run";
import { stableVerificationHash } from "../domain/hash";
import type { RewardChoice, RewardSelectionSnapshot } from "../gameplay/run/reward-selection";
import type { RewardDecision, RewardRuntime } from "../gameplay/run/reward-runtime";
import type { TearCausalEventV1 } from "../tearbench/contracts";
import type { GhostReadCapsule } from "./capsule-reader";
import { readSeedRaceRun } from "./seed-race-contract";

export function raceRewardHash(snapshot: RewardSelectionSnapshot<RewardChoice>): string {
  return stableVerificationHash({
    ...snapshot,
    choices: snapshot.choices.map((c) => c.id),
    reserveChoices: snapshot.reserveChoices.map((c) => c.id),
    reservedChoice: snapshot.reservedChoice?.id ?? null,
  });
}
export interface SeedRaceDecision extends TearCausalEventV1 {
  readonly payload: Readonly<{
    format: "tear-seed-race-decision" | "tear-beat-run-decision";
    version: 1;
    runId: string;
    sharedHash: string;
    beforeHash: string;
    decision: RewardDecision;
  }>;
}
export function createSeedRaceDecision(
  sequence: number,
  tick: number,
  runId: string,
  sharedHash: string,
  before: RewardSelectionSnapshot<RewardChoice>,
  decision: RewardDecision,
): SeedRaceDecision {
  return Object.freeze({
    format: "tear-contract",
    kind: "event",
    schemaVersion: 1,
    id: `race-decision-${String(sequence)}`,
    type: "system.checkpoint",
    tick,
    sequence,
    phase: "post-simulation-commit",
    source: "engine",
    payload: Object.freeze({
      format: "tear-seed-race-decision",
      version: 1,
      runId,
      sharedHash,
      beforeHash: raceRewardHash(before),
      decision: Object.freeze({ ...decision }),
    }),
  });
}
export function readSeedRaceDecisions(capsule: GhostReadCapsule, runId: string): readonly SeedRaceDecision[] {
  const beat = readBeatRunBinding(capsule.manifest.provenance?.beatThisRun);
  const race = readSeedRaceRun(capsule.manifest.provenance?.seedRace),
    events: SeedRaceDecision[] = [];
  for (const entry of capsule.tracks.keyframes) {
    const snapshot = entry.value;
    if (!isRecord(snapshot) || !isRecord(snapshot.state) || !isRecord(snapshot.state["tear.run.v1"])) continue;
    const savedBeat = readBeatRunBinding(snapshot.state["tear.run.v1"].beatThisRun);
    if (stableVerificationHash(savedBeat ?? null) !== stableVerificationHash(beat ?? null))
      throw new TypeError("Beat binding differs across keyframes and provenance");
    const saved = readSeedRaceRun(snapshot.state["tear.run.v1"].seedRace);
    if (stableVerificationHash(saved ?? null) !== stableVerificationHash(race ?? null))
      throw new TypeError("Race declaration differs across recorded keyframes and provenance");
  }
  for (const entry of capsule.tracks.events) {
    const e = entry.value;
    if (
      !isRecord(e) ||
      !isRecord(e.payload) ||
      !["tear-seed-race-decision", "tear-beat-run-decision"].includes(String(e.payload.format))
    )
      continue;
    const p = e.payload,
      d = p.decision;
    const isBeat = p.format === "tear-beat-run-decision";
    if (
      (isBeat ? !beat || race !== undefined : !race || beat !== undefined) ||
      e.format !== "tear-contract" ||
      e.kind !== "event" ||
      e.schemaVersion !== 1 ||
      e.type !== "system.checkpoint" ||
      e.source !== "engine" ||
      e.phase !== "post-simulation-commit" ||
      e.tick !== entry.tick ||
      !Number.isSafeInteger(e.sequence) ||
      Number(e.sequence) < 1 ||
      e.id !== `${isBeat ? "beat" : "race"}-decision-${String(e.sequence)}` ||
      Object.keys(p).sort().join() !== "beforeHash,decision,format,runId,sharedHash,version" ||
      p.version !== 1 ||
      p.runId !== runId ||
      p.sharedHash !== (isBeat ? beat?.codeHash : race?.sharedHash) ||
      typeof p.beforeHash !== "string" ||
      !/^[a-f0-9]{16}$/u.test(p.beforeHash) ||
      !isRecord(d) ||
      typeof d.kind !== "string" ||
      !["draft", "reserve", "tier", "reroll"].includes(d.kind) ||
      (d.kind === "reroll"
        ? Object.keys(d).join() !== "kind"
        : Object.keys(d).sort().join() !== "index,kind" ||
          !Number.isSafeInteger(d.index) ||
          Number(d.index) < -2 ||
          Number(d.index) > 256) ||
      (events.length > 0 && Number(e.sequence) <= (events.at(-1)?.sequence ?? 0))
    )
      throw new TypeError("Invalid recorded race decision");
    events.push(Object.freeze(structuredClone(e)) as unknown as SeedRaceDecision);
  }
  return Object.freeze(events);
}
/** A snapshot carries its consumed frontier; later choices are never injected into an earlier anchor. */
export function createSeedRaceDecisionPlayback<T extends RewardChoice>(
  events: readonly SeedRaceDecision[],
  originTick: number,
  reward: RewardRuntime<T>,
) {
  let index = events.findIndex((e) => e.tick >= originTick && e.sequence > (reward.snapshot()?.decisionSequence ?? 0));
  if (index < 0) index = events.length;
  return (tick: number) => {
    while (index < events.length) {
      const e = events[index];
      if (!e || e.tick >= tick) return;
      const before = reward.snapshot();
      if (e.tick !== tick - 1 || !before || raceRewardHash(before) !== e.payload.beforeHash)
        throw new TypeError("Race decision differs from its original reward frontier");
      index++;
      reward.decide(e.payload.decision, e.sequence);
      if (reward.snapshot()?.decisionSequence !== e.sequence)
        throw new TypeError("Recorded race decision was not legally consumed");
    }
  };
}
