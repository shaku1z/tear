import {
  createGhostReplayRunContext,
  type GhostReplayRunContextInput,
  type GhostRecordedOpeningV1,
} from "../../ghost/replay-admission";
import type { TearCausalEventV1 } from "../../tearbench/contracts";
import { REPLAY_CONTENT_HASH } from "../../gameplay/snapshot/codec-ids";
import { stableVerificationHash } from "../../domain/hash";

export interface LiveOpeningCaptureBoundary {
  readonly phase: "opening-initialized-before-run-start";
  readonly runId: string;
  readonly seed: number;
}

/** The recording's start as the old recorder's sidecar context reads it. */
type OpeningRunContext = Readonly<{
  runId: string;
  seed: string;
  ticksPerSecond: number;
  build: Pick<GhostReplayRunContextInput["build"], "version" | "revision" | "target">;
  rulesetVersion: string;
}>;

interface OpeningCapturePorts {
  readonly screen: () => string;
  readonly tick: () => number;
  readonly replayRunId: () => string | undefined;
  readonly nextSequence: () => number;
  readonly record: (event: TearCausalEventV1) => void;
  readonly failed: (error: unknown) => void;
}

/** Observes the existing synchronous start transaction without owning its gameplay effects. */
export function createLiveGhostOpeningCapture(ports: OpeningCapturePorts) {
  let active: (LiveOpeningCaptureBoundary & { readonly previousScreen: string }) | undefined;
  let pendingRunId: string | undefined;
  const discard = () => {
    pendingRunId = undefined;
  };
  return Object.freeze({
    discard,
    withCapture(boundary: LiveOpeningCaptureBoundary, record: () => void): void {
      if (active !== undefined) throw new Error("nested opening recording boundary");
      discard();
      active = { ...boundary, previousScreen: ports.screen() };
      try {
        record();
      } catch (error) {
        discard();
        throw error;
      } finally {
        active = undefined;
      }
    },
    createContext(
      context: OpeningRunContext,
      run: Readonly<{ mode: string; diff: string; weaponId: string }>,
      configuration: unknown,
      rng: GhostReplayRunContextInput["rng"],
    ) {
      discard();
      if (active !== undefined && (active.runId !== context.runId || String(active.seed) !== context.seed))
        throw new Error("recording does not match its scoped opening boundary");
      if (configuration === undefined) throw new Error("Ghost V3 replay bootstrap lacks a configuration projection");
      const opening: GhostRecordedOpeningV1 | undefined =
        active === undefined
          ? undefined
          : {
              version: 1,
              phase: active.phase,
              previousScreen: active.previousScreen,
              destination: "playing",
              runId: active.runId,
            };
      return createGhostReplayRunContext({
        runId: context.runId,
        seed: context.seed,
        mode: run.mode,
        difficulty: run.diff,
        weaponId: run.weaponId,
        ticksPerSecond: context.ticksPerSecond,
        build: {
          version: context.build.version,
          revision: context.build.revision,
          target: context.build.target,
          rulesetVersion: context.rulesetVersion,
          contentHash: REPLAY_CONTENT_HASH,
          configHash: stableVerificationHash(configuration),
        },
        rng,
        ...(opening === undefined ? {} : { opening }),
      });
    },
    captured(runId: string): void {
      if (active?.runId === runId) pendingRunId = runId;
    },
    exposed(runId: string): void {
      if (pendingRunId !== runId) return;
      discard();
      try {
        if (ports.screen() !== "playing" || ports.tick() !== 0 || ports.replayRunId() !== runId) return;
        ports.record(
          Object.freeze({
            format: "tear-contract",
            kind: "event",
            schemaVersion: 1,
            id: `ghost-opening-playing-${runId}`,
            type: "system.checkpoint",
            tick: 0,
            phase: "pre-simulation",
            sequence: ports.nextSequence(),
            source: "engine",
            payload: Object.freeze({ boundary: "recorded-opening-playing-exposed", runId, screen: "playing" }),
          }),
        );
      } catch (error) {
        ports.failed(error);
      }
    },
  });
}
