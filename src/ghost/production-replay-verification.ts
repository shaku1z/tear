import { asRecord } from "../domain/records";
import { readGhostBossMemory } from "./boss-memory-origin";
import { verifyBossMemory } from "./boss-memory";
import { readSeedRaceDecisions } from "./seed-race-decisions";
import { requireGhostForkPermit, type GhostForkPermit } from "./fork-origin";
import { createProductionGhostReplayComposition } from "../tearbench/production-replay-composition";
import type { GhostReadCapsule } from "./capsule-reader";
import { mapGhostCapsuleToReplayEnvelope } from "./capsule-replay-envelope";
import { readGhostAuthoritativeReceipt, type GhostAuthoritativeReceiptV1 } from "./authoritative-receipt";
import { GhostProductionReplayWorld } from "./replay-world";
import {
  assessGhostReplayBootstrap,
  issueGhostRecordedOpeningPermit,
  readGhostReplayRunContext,
} from "./replay-admission";
import { createGhostV3 } from "./truth-kernel";
import { stableVerificationHash } from "../domain/hash";
import { AuthoritativeInputState, type AuthoritativeInputSnapshot } from "../gameplay/runtime/authoritative-input";
import { AIM_MAGNITUDE_SCALE } from "../input/game-action";
import { readGhostApplicationClockSchedule, type GhostApplicationClockSchedule } from "./application-frame-events";

/** Only explicit validated full magnitude has the canonical omitted-full spelling. Keep every other field. */
function canonicalReceiptInput(input: AuthoritativeInputSnapshot): AuthoritativeInputSnapshot {
  if (input.aimMagnitude !== AIM_MAGNITUDE_SCALE) return input;
  const canonical = { ...input };
  delete canonical.aimMagnitude;
  return canonical;
}

/** Current v1 has no initial reset witness. Only linked original aim assignments establish missing magnitude. */
function legacyAimRefusals(
  capsule: GhostReadCapsule,
  mapped: ReturnType<typeof mapGhostCapsuleToReplayEnvelope>,
  receipts: readonly GhostAuthoritativeReceiptV1[],
): readonly GhostProductionReceiptComparison[] {
  const legacy = receipts.filter((receipt) => receipt.input.aimMagnitude === undefined);
  if (legacy.length === 0) return [];
  const context = readGhostReplayRunContext(capsule.manifest.provenance);
  const linked = context !== undefined && assessGhostReplayBootstrap(capsule, context) === undefined;
  const owner = new AuthoritativeInputState();
  let known = false,
    index = 0;
  const refusals: GhostProductionReceiptComparison[] = [];
  for (const receipt of [...legacy].sort((a, b) => a.tick - b.tick)) {
    while (index < mapped.ghost.actions.length) {
      const action = mapped.ghost.actions[index];
      if (action === undefined) throw new TypeError("admitted action history is incomplete");
      const tick = action.tick;
      if (tick > receipt.tick) break;
      const start = index;
      while (mapped.ghost.actions[index]?.tick === tick) index++;
      const group = mapped.ghost.actions.slice(start, index);
      owner.beginTick(tick, group);
      if (linked && group.some((entry) => entry.command.type === "aim")) known = true;
    }
    const magnitude = owner.snapshot().aimMagnitude ?? AIM_MAGNITUDE_SCALE;
    if (!known || magnitude !== AIM_MAGNITUDE_SCALE)
      refusals.push(
        Object.freeze({
          tick: receipt.tick,
          expectedHash: receipt.stateHash,
          equal: false,
          reason: !known
            ? "legacy held aim magnitude is unknown: no preceding source-linked admitted aim assignment"
            : `legacy held aim magnitude is absent but original actions establish ${String(magnitude)}`,
        }),
      );
  }
  return Object.freeze(refusals);
}

export interface GhostProductionReceiptComparison {
  readonly tick: number;
  readonly snapshotId?: string;
  readonly expectedHash: string;
  readonly actualHash?: string;
  readonly equal: boolean;
  readonly reason?: string;
}

export interface GhostOpeningContinuationVerification extends GhostProductionReplayVerification {
  readonly comparisons: readonly (GhostProductionReceiptComparison & { readonly inputEqual?: boolean })[];
  readonly continuation: Readonly<{
    kind: "opening-only-derived-in-memory";
    sourceRootIntegrity: string;
    sourceAnchorId: string | undefined;
    steps: number;
    laterKeyframesUsed: false;
    derivedRootHash?: string;
    terminalWitness?: Readonly<{ terminalTick: number; authoritativeTick: number; introClearedTick: number }>;
  }>;
}

/** Disclosed in-memory opening-only execution; never replaces or edits archive keyframes. */
export function verifyGhostCapsuleOpeningContinuation(capsule: GhostReadCapsule): GhostOpeningContinuationVerification {
  const mapped = mapGhostCapsuleToReplayEnvelope(capsule);
  let targets = [60, 120, 180],
    finalWitness: Readonly<{ tick: number; stateHash: string }> | undefined;
  let terminalWitness:
    Readonly<{ terminalTick: number; authoritativeTick: number; introClearedTick: number }> | undefined;
  const receipts = capsule.tracks.results.flatMap((entry) => {
    const receipt = readGhostAuthoritativeReceipt(entry.value);
    return receipt?.tick === entry.tick ? [receipt] : [];
  });
  const anchor = mapped.ghost.snapshots.find((snapshot) => snapshot.tick === 0);
  const comparisons: (GhostProductionReceiptComparison & { readonly inputEqual?: boolean })[] = [];
  let steps = 0;
  const evidence = () =>
    Object.freeze({
      kind: "opening-only-derived-in-memory" as const,
      sourceRootIntegrity: capsule.manifest.rootIntegrity,
      sourceAnchorId: anchor?.id,
      steps,
      laterKeyframesUsed: false as const,
      ...(terminalWitness === undefined ? {} : { terminalWitness }),
    });
  if (mapped.issues.length > 0)
    return Object.freeze({
      status: "unavailable",
      comparisons: Object.freeze([]),
      continuation: evidence(),
      mappingIssues: Object.freeze(
        mapped.issues.map((issue) => `${issue.track}@${String(issue.tick)}: ${issue.reason}`),
      ),
    });
  try {
    const refusals = legacyAimRefusals(
      capsule,
      mapped,
      receipts.filter((receipt) => receipt.tick === 0),
    );
    if (refusals.length > 0)
      return Object.freeze({
        status: "unavailable",
        comparisons: refusals,
        continuation: evidence(),
        mappingIssues: Object.freeze([]),
      });
    const permit = issueGhostRecordedOpeningPermit(capsule);
    const context = readGhostReplayRunContext(capsule.manifest.provenance);
    const applicationClock = readGhostApplicationClockSchedule(
      capsule,
      context?.run.id ?? "",
      context?.simulation.applicationFrames !== undefined,
    );
    if (
      context?.run.mode === "bossonly" &&
      context.simulation.opening !== undefined &&
      applicationClock !== undefined
    ) {
      const install = applicationClock.events.find((event) => event.payload.format === "tearghost-intro-install");
      const clear = applicationClock.events.find(
        (event) =>
          event.sequence > (install?.sequence ?? Infinity) &&
          event.payload.format === "tearghost-application-frame" &&
          event.payload.kind === "end" &&
          !event.payload.introActive,
      );
      const terminals = capsule.tracks.results.flatMap((entry) => {
        const value = asRecord(entry.value);
        if (value === undefined) return [];
        return entry.tick === capsule.maxTick &&
          value.mode === context.run.mode &&
          value.diff === context.run.difficulty &&
          Number.isSafeInteger(value.authoritativeTick) &&
          Number(value.authoritativeTick) > (clear?.tick ?? Infinity) &&
          Number(value.authoritativeTick) < entry.tick &&
          typeof value.authoritativeStateHash === "string" &&
          /^[a-f0-9]{16}$/iu.test(value.authoritativeStateHash)
          ? [
              {
                tick: Number(value.authoritativeTick),
                stateHash: value.authoritativeStateHash,
                terminalTick: entry.tick,
              },
            ]
          : [];
      });
      const terminal = terminals[0];
      if (install === undefined || clear === undefined || terminals.length !== 1 || terminal === undefined)
        throw new TypeError(
          "fresh boss continuation requires an original authoritative terminal witness after recorded intro clearing",
        );
      finalWitness = terminal;
      terminalWitness = Object.freeze({
        terminalTick: terminal.terminalTick,
        authoritativeTick: terminal.tick,
        introClearedTick: clear.tick,
      });
      targets = [
        ...new Set([
          ...receipts
            .filter((receipt) => receipt.tick > 0 && receipt.tick <= terminal.tick)
            .map((receipt) => receipt.tick),
          terminal.tick,
        ]),
      ].sort((a, b) => a - b);
      const sameTick = receipts.find((receipt) => receipt.tick === terminal.tick);
      if (sameTick !== undefined && sameTick.stateHash !== terminal.stateHash)
        throw new TypeError("source terminal and receipt hashes disagree");
    }
    if (
      permit === undefined ||
      anchor === undefined ||
      mapped.issues.length !== 0 ||
      targets.some(
        (tick) => tick !== finalWitness?.tick && receipts.filter((receipt) => receipt.tick === tick).length !== 1,
      )
    ) {
      return Object.freeze({
        status: "unavailable" as const,
        comparisons,
        continuation: evidence(),
        mappingIssues: [
          "opening continuation requires admitted anchor, valid command/event mapping, and unique60/120/180 receipts",
        ],
      });
    }
    const derived = createGhostV3({ ...mapped.ghost, snapshots: [anchor] });
    const composition = createProductionGhostReplayComposition({
      seed: anchor.seed,
      openingPermit: permit,
      raceDecisions: readSeedRaceDecisions(capsule, context?.run.id ?? ""),
      requireRecordedApplicationFrames: true,
      ...(applicationClock === undefined ? {} : { applicationClock }),
    });
    const replay = new GhostProductionReplayWorld(derived, {
      create(snapshot) {
        const session = composition.create(snapshot);
        return Object.freeze({
          ...session,
          afterReplayAdvance() {
            steps++;
            const tick = session.simulation.scheduler.tick;
            if (!targets.includes(tick)) return;
            const receipt = receipts.find((candidate) => candidate.tick === tick);
            const expected = receipt ?? (finalWitness?.tick === tick ? finalWitness : undefined);
            if (expected === undefined) throw new Error("opening receipt disappeared");
            const actualHash = stableVerificationHash(session.semanticProjection());
            const inputEqual =
              receipt === undefined
                ? undefined
                : stableVerificationHash(session.simulation.input.snapshot()) ===
                  stableVerificationHash(canonicalReceiptInput(receipt.input));
            comparisons.push(
              Object.freeze({
                tick,
                expectedHash: expected.stateHash,
                actualHash,
                ...(inputEqual === undefined ? {} : { inputEqual }),
                equal: inputEqual !== false && actualHash === expected.stateHash,
              }),
            );
          },
        });
      },
    });
    const lastTick = targets.at(-1);
    if (lastTick === undefined) throw new TypeError("opening continuation has no original target");
    replay.seek(lastTick);
    return Object.freeze({
      status:
        comparisons.length === targets.length && comparisons.every((entry) => entry.equal) && steps === lastTick
          ? ("verified" as const)
          : ("mismatch" as const),
      comparisons: Object.freeze(comparisons),
      continuation: Object.freeze({ ...evidence(), derivedRootHash: derived.rootHash }),
      mappingIssues: Object.freeze([]),
    });
  } catch (error) {
    return Object.freeze({
      status: "mismatch" as const,
      comparisons: Object.freeze(comparisons),
      continuation: evidence(),
      mappingIssues: Object.freeze([error instanceof Error ? error.message : String(error)]),
    });
  }
}

export interface GhostProductionReplayVerification {
  readonly status: "verified" | "mismatch" | "unavailable";
  readonly comparisons: readonly GhostProductionReceiptComparison[];
  readonly mappingIssues: readonly string[];
}

/**
 * Verifies durable V3 receipt bytes only after they are rebuilt through the
 * source-owned production replay composition. It does not promote capsule
 * trust, mutate custody, or substitute a visual/presentation result.
 */
export function verifyGhostCapsuleProductionReplay(
  capsule: GhostReadCapsule,
  forkPermit?: GhostForkPermit,
): GhostProductionReplayVerification {
  try {
    if (readGhostBossMemory(capsule.manifest.provenance)) return verifyBossMemory(capsule);
  } catch (error) {
    return {
      status: "unavailable",
      comparisons: [],
      mappingIssues: [error instanceof Error ? error.message : String(error)],
    };
  }
  let forkOrigin;
  try {
    forkOrigin = requireGhostForkPermit(capsule, forkPermit);
  } catch (error) {
    return {
      status: "unavailable",
      comparisons: [],
      mappingIssues: [error instanceof Error ? error.message : "Fork parent unavailable."],
    };
  }
  const mapped = mapGhostCapsuleToReplayEnvelope(capsule);
  const receipts = capsule.tracks.results.flatMap((entry) => {
    const receipt = readGhostAuthoritativeReceipt(entry.value);
    return receipt?.tick === entry.tick ? [receipt] : [];
  });
  const mappingIssues = Object.freeze(
    mapped.issues.map((issue) => `${issue.track}@${String(issue.tick)}: ${issue.reason}`),
  );
  if (receipts.length === 0 || mapped.ghost.snapshots.length === 0) {
    return Object.freeze({ status: "unavailable", comparisons: Object.freeze([]), mappingIssues });
  }
  if (mappingIssues.length > 0)
    return Object.freeze({ status: "mismatch", comparisons: Object.freeze([]), mappingIssues });
  const refusals = legacyAimRefusals(capsule, mapped, receipts);
  if (refusals.length > 0) return Object.freeze({ status: "unavailable", comparisons: refusals, mappingIssues });
  const inputs = new Map(receipts.map((receipt) => [receipt.tick, receipt.input]));
  let applicationClock: GhostApplicationClockSchedule | undefined;
  let raceDecisions: ReturnType<typeof readSeedRaceDecisions>;
  try {
    const context = readGhostReplayRunContext(capsule.manifest.provenance);
    applicationClock = readGhostApplicationClockSchedule(
      capsule,
      context?.run.id ?? "",
      context?.simulation.applicationFrames !== undefined,
    );
    raceDecisions = readSeedRaceDecisions(capsule, context?.run.id ?? "");
  } catch (error) {
    return Object.freeze({
      status: "unavailable",
      comparisons: Object.freeze([]),
      mappingIssues: Object.freeze([...mappingIssues, error instanceof Error ? error.message : String(error)]),
    });
  }
  let openingPermit;
  try {
    openingPermit = issueGhostRecordedOpeningPermit(capsule);
  } catch (error) {
    return Object.freeze({
      status: "mismatch",
      comparisons: Object.freeze([]),
      mappingIssues: Object.freeze([...mappingIssues, error instanceof Error ? error.message : String(error)]),
    });
  }
  const composition = createProductionGhostReplayComposition({
    seed: mapped.ghost.snapshots[0]?.seed ?? "unknown",
    inputSnapshots: inputs,
    ...(forkOrigin === undefined ? {} : { forkOrigin }),
    raceDecisions,
    requireRecordedApplicationFrames: true,
    ...(applicationClock === undefined ? {} : { applicationClock }),
    ...(openingPermit === undefined ? {} : { openingPermit }),
  });
  const replayGhost =
    forkOrigin === undefined
      ? mapped.ghost
      : createGhostV3({
          ...mapped.ghost,
          snapshots: mapped.ghost.snapshots.filter((snapshot) => snapshot.tick === forkOrigin.checkpoint.tick),
        });
  const comparisons: GhostProductionReceiptComparison[] = [];
  for (const receipt of receipts) {
    const snapshot = mapped.ghost.snapshots.find((candidate) => candidate.tick === receipt.tick);
    if (snapshot === undefined) {
      comparisons.push(
        Object.freeze({
          tick: receipt.tick,
          expectedHash: receipt.stateHash,
          equal: false,
          reason: "receipt has no same-tick recorded-canonical State Forge snapshot",
        }),
      );
      continue;
    }
    try {
      let restoredInput: AuthoritativeInputSnapshot | undefined,
        currentInput: (() => AuthoritativeInputSnapshot) | undefined;
      const result = new GhostProductionReplayWorld(replayGhost, {
        create(snapshot) {
          const session = composition.create(snapshot);
          restoredInput = session.simulation.input.snapshot();
          currentInput = () => session.simulation.input.snapshot();
          return session;
        },
      }).seek(receipt.tick);
      const inputEqual =
        stableVerificationHash(forkOrigin === undefined ? restoredInput : currentInput?.()) ===
        stableVerificationHash(canonicalReceiptInput(receipt.input));
      comparisons.push(
        Object.freeze({
          tick: receipt.tick,
          snapshotId: snapshot.id,
          expectedHash: receipt.stateHash,
          actualHash: result.semanticHash,
          equal: inputEqual && result.semanticHash === receipt.stateHash,
          ...(inputEqual ? {} : { reason: "restored held input does not match original receipt fields" }),
        }),
      );
    } catch (error) {
      comparisons.push(
        Object.freeze({
          tick: receipt.tick,
          snapshotId: snapshot.id,
          expectedHash: receipt.stateHash,
          equal: false,
          reason: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }
  return Object.freeze({
    status: comparisons.every((comparison) => comparison.equal) ? "verified" : "mismatch",
    comparisons: Object.freeze(comparisons),
    mappingIssues,
  });
}
