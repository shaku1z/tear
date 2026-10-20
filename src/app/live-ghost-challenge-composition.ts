import { stableVerificationHash } from "../replay/hash";
import type { TearSnapshotV1 } from "../tearbench/contracts";
import type { AuthoritativeInputSnapshot } from "../gameplay/runtime/authoritative-input";
import { captureLiveStateForgeSnapshot, type LiveStateForgeSnapshotCapture } from "../tearbench/live-runtime-snapshots";
import type { TearLiveWorldAdapter } from "../tearbench/live-state-snapshot";
import type { TearStateCodecRegistry } from "../tearbench/state-codecs";
import { readGhostAuthoritativeReceipt, createGhostAuthoritativeReceipt } from "../ghost/authoritative-receipt";
import { readBrowserGhostCapsule } from "../ghost/browser-capsule-vault";
import { reopenRecordedGhostChallenge } from "../ghost/browser-recorded-challenge";
import { ghostReplayContextFingerprint, readGhostReplayRunContext } from "../ghost/replay-admission";
import { ghostLiveBootstrapEventId } from "../ghost/live-causal-events";
import type { GhostForkOriginV1 } from "../ghost/fork-origin";
import { recordedGhostChallengeChoices, readRecordedGhostChallenge } from "../ghost/recorded-challenge";
import { createGhostProductionReplaySession } from "../ghost/production-replay-session";
import type { LiveGhostRecordingSessionState } from "./live-ghost-recording-session-state";
import type { createLiveGhostFrameRecording } from "./live-ghost-frame-recording";
import type { GhostPracticeLaunchResult } from "./ghost-practice-launch";
import type { GhostPracticeChild } from "../ghost/replay-world";
import { createLiveGhostChallengeController } from "./live-ghost-challenge-controller";

export interface LiveGhostChallengeCompositionPorts {
  readonly factory: IDBFactory | undefined; readonly recording: LiveGhostRecordingSessionState;
  readonly frames: ReturnType<typeof createLiveGhostFrameRecording>; readonly stateForge: TearLiveWorldAdapter<unknown>;
  readonly registry: TearStateCodecRegistry;
  launch(child: GhostPracticeChild): GhostPracticeLaunchResult;
  input(): AuthoritativeInputSnapshot; releaseInput(tick: number): void; startInput(): void; stopInput(): void;
  stateHash(): string; tick(): number; pause(): void; abandon(reason: string): void; notice(message: string): void;
  captureReceipt(tick: number): void;
  rng(): LiveStateForgeSnapshotCapture["rng"];
}

export function createLiveGhostChallengeComposition(ports: LiveGhostChallengeCompositionPorts) {
  let attemptId: string | undefined, originTick = 0;
  const controller = createLiveGhostChallengeController({ pause: () => { ports.pause(); }, notice: (message) => { ports.notice(message); },
    captureEndpoint(tick) {
      const recorder = ports.recording.recorder();
      // Capture the committed frontier before a paused frame consumes skipped scheduler ticks.
      // The root captures cadence endpoints later in this SAME afterStep callback.
      if (recorder?.active === true && tick > originTick && tick % recorder.keyframeIntervalTicks !== 0) ports.captureReceipt(tick);
    },
    async prepare(child, signal) {
      const definition = readRecordedGhostChallenge(child.challenge), parent = await readBrowserGhostCapsule(ports.factory, child.sourceGhostId);
      if (parent === undefined) throw new TypeError("Selected parent recording is unavailable.");
      const parentSession = createGhostProductionReplaySession(parent), checked = parentSession.forkPractice(child.forkTick, "race-practice");
      const context = readGhostReplayRunContext(parent.manifest.provenance), receipt = parent.tracks.results.map((entry) => readGhostAuthoritativeReceipt(entry.value)).find((value) => value?.tick === child.forkTick);
      if (context === undefined || receipt === undefined || stableVerificationHash(checked.snapshot) !== stableVerificationHash(child.snapshot)
        || checked.sourceRootHash !== child.sourceRootHash || !recordedGhostChallengeChoices(parent, child.snapshot).some((choice) => stableVerificationHash(choice) === stableVerificationHash(definition))) throw new TypeError("Selected challenge or source changed.");
      const recorder = ports.recording.recorder();
      if (recorder === null || recorder.active) throw new TypeError("Local recorder unavailable or another recording is active.");
      signal.throwIfAborted();
      const launched = ports.launch(child);
      if (!launched.ok) return launched;
      ports.releaseInput(child.forkTick); ports.frames.reset(); ports.recording.reset();
      attemptId = `ghost-challenge-${crypto.randomUUID()}`; originTick = child.forkTick;
      const capture = (): TearSnapshotV1 => captureLiveStateForgeSnapshot({ id: `${String(attemptId)}-origin-${String(originTick)}`, tick: originTick,
        stateClass: "recorded-canonical", seed: context.run.seed, stateForge: ports.stateForge, registry: ports.registry,
        observationClass: "structured-state", producer: "local-recorded-challenge", target: context.build.target,
        contentHash: context.build.contentHash, staticBuild: context.build, rng: ports.rng(), visualHash: stableVerificationHash("not-captured"), sourceId: ghostLiveBootstrapEventId(attemptId ?? ""), trainingConsent: "no-training", executionClass: "engineering" });
      const anchor = capture(), initial = createGhostAuthoritativeReceipt(originTick, ports.stateHash(), ports.input(), ports.frames.receipt({ id: anchor.id, exactHash: anchor.hashes.exact }));
      const origin: GhostForkOriginV1 = { format: "tearghost-fork-origin", schemaVersion: 1,
        parent: { capsuleId: parent.manifest.id, rootIntegrity: parent.manifest.rootIntegrity, replayRootHash: parentSession.sourceRootHash, contextHash: ghostReplayContextFingerprint(context) },
        checkpoint: { id: child.snapshot.id, tick: originTick, exactHash: child.snapshot.hashes.exact, semanticHash: child.snapshot.hashes.semantic, receiptHash: stableVerificationHash(receipt) },
        childAnchor: { id: anchor.id, exactHash: anchor.hashes.exact, semanticHash: anchor.hashes.semantic, inputHash: stableVerificationHash(initial.input), configurationHash: stableVerificationHash(anchor.state["tear.configuration.v1"]), rngHash: stableVerificationHash(anchor.state["tear.rng.v1"]) },
        inputPolicy: "release-all", framePolicy: "fresh-child-frame-from-committed-frontier", sourceFrameReceiptHash: stableVerificationHash(receipt.applicationFrames ?? null), challengeHash: stableVerificationHash(definition) };
      recorder.start({ sessionId: attemptId, createdAt: new Date().toISOString(), provenance: { replayContext: context, forkOrigin: origin, challenge: definition,
        captureDisposition: "local-challenge-no-training-no-publication" } }); ports.recording.setReplayContext(context);
      recorder.record("keyframes", originTick, anchor); recorder.record("rng", originTick, anchor.state["tear.rng.v1"]);
      recorder.record("results", originTick, initial);
      ports.pause();
      const ownedId = attemptId, ownedContext = ports.recording.replayContext();
      const cancel = () => {
        if (recorder.active && recorder.activeSessionId === ownedId) void recorder.finish({ format: "tearghost-challenge-end", reason: "abandoned", authoritativeTick: originTick, originTick });
        if (ports.recording.replayContext() === ownedContext) ports.recording.setReplayContext(undefined);
      };
      signal.addEventListener("abort", cancel, { once: true });
      try { await recorder.drain(); signal.throwIfAborted(); }
      catch (error) { cancel(); throw error; }
      finally { signal.removeEventListener("abort", cancel); }
      ports.startInput();
      return { ok: true, child, semanticHash: launched.semanticHash };
    },
    async finish(reason, tick) {
      const recorder = ports.recording.recorder();
      if (recorder?.active !== true || attemptId === undefined) throw new TypeError("Challenge recording is unavailable.");
      // Capture before optional cleanup; never package through score publication.
      if (ports.frames.receipt().cursor.open !== undefined) throw new TypeError("Challenge application frame has not committed.");
      ports.stopInput();
      const capturedContext = ports.recording.replayContext();
      if (reason !== "defeated") ports.abandon(reason === "goal" ? "challenge-goal-reached" : "challenge-stopped");
      const id = attemptId;
      const manifest = await recorder.finish({ format: "tearghost-challenge-end", reason, authoritativeTick: tick, originTick });
      if (ports.recording.replayContext() === capturedContext) ports.recording.setReplayContext(undefined);
      if (manifest?.id !== id) throw new TypeError("Challenge recording failed to seal.");
      const capsule = await readBrowserGhostCapsule(ports.factory, id);
      if (capsule === undefined) throw new TypeError("Sealed challenge recording could not be reopened.");
      const reopened = await reopenRecordedGhostChallenge(ports.factory, capsule, true);
      if (reopened === undefined) throw new TypeError("Challenge origin unavailable.");
      if (attemptId === id) attemptId = undefined;
      return reopened.result;
    },
  });
  return Object.freeze({ ...controller, request(child: GhostPracticeChild): GhostPracticeLaunchResult {
    if (child.challenge !== undefined) return controller.launch(child);
    controller.reset(); return ports.launch(child);
  } });
}
