import { createBeatThisRunService } from "../../src/ghost/browser-beat-this-run";
import { prepareCompleteGhostCapsuleArchive } from "../../src/ghost/capsule-archive";
import { createLiveEconomyRuntime } from "../../src/gameplay/scoring/live-economy-runtime";
import { ghostPublicationSourceEligibility } from "../../src/ghost/local-publication-job";
import { newMods, UPGRADES } from "../../src/gameplay/upgrades";
import { createRewardRuntime } from "../../src/gameplay/run/reward-runtime";
import {
  createSeedRaceDecision,
  createSeedRaceDecisionPlayback,
  type SeedRaceDecision,
} from "../../src/ghost/seed-race-decisions";
import { describe, expect, it } from "vitest";
import {
  createProductionGhostReplayComposition,
  captureProductionReplayCheckpoint,
} from "../../src/tearbench/production-replay-composition";
import { GhostLiveRecorder } from "../../src/ghost/live-recorder";
import { GhostLocalVault } from "../../src/ghost/capsule-vault";
import { createMemoryGhostVaultBackend, type GhostVaultBackend } from "../../src/ghost/capsule-vault-backend";
import { GhostCapsuleReader } from "../../src/ghost/capsule-reader";
import { createGhostReplayRunContext, readGhostReplayRunContext } from "../../src/ghost/replay-admission";
import { createGhostAuthoritativeReceipt } from "../../src/ghost/authoritative-receipt";
import { ghostLiveBootstrapEventId, createLiveGhostCausalEvent } from "../../src/ghost/live-causal-events";
import { createBrowserGhostCareer } from "../../src/app/replay/browser-ghost-career";
import type { LiveGhostRecordingSessionState } from "../../src/app/replay/ghost-recording-session-state";
import { stableVerificationHash } from "../../src/replay/hash";
import {
  assertBeatRuntimeCompatibility,
  createBeatThisRunCode,
  validateBeatSource,
  decodeBeatThisRunCode,
  encodeBeatThisRunCode,
  beatRunBinding,
  evaluateBeatThisRun,
  readBeatThisRunCode,
  type BeatThisRunCode,
} from "../../src/ghost/beat-this-run";
import { verifyGhostCapsuleProductionReplay } from "../../src/ghost/production-replay-verification";
import { tracksAchievements } from "../../src/gameplay/progression/achievement-runtime";

// Actual source-owned world, recorder, receipt writer and Career observer. The
// explicit unit Quit is constructed; it is not a natural browser victory/cohort.
async function nativeSource(
  id: string,
  code?: BeatThisRunCode,
  backend: GhostVaultBackend = createMemoryGhostVaultBackend(),
  constructedTerminal: "quit" | "victory" = "quit",
) {
  const host = createProductionGhostReplayComposition({
    seed: "117",
    mode: "endless",
    difficulty: "easy",
    weaponId: "riftlock",
  }).create(undefined);
  const vault = new GhostLocalVault(backend),
    run = host.replay.world.state.run();
  if (!run) throw new Error("run unavailable");
  if (code) run.beatThisRun = beatRunBinding(code);
  const capture = () =>
    captureProductionReplayCheckpoint(
      host.replay,
      host.combat,
      host.waveReward,
      `${id}-${String(host.simulation.scheduler.tick)}`,
    );
  const initial = capture(),
    context = createGhostReplayRunContext({
      runId: host.replay.world.lifecycle.snapshot().sessionId ?? "unit-run",
      seed: "117",
      mode: run.mode,
      difficulty: run.diff,
      weaponId: run.weaponId,
      ticksPerSecond: 120,
      build: initial.snapshot.provenance.build,
      rng: host.replay.random.streams.snapshot(),
    });
  const recorder = new GhostLiveRecorder({
    createVault: () => Promise.resolve(vault),
    now: () => "2026-10-20T00:00:01Z",
  });
  recorder.start({
    sessionId: id,
    createdAt: "2026-10-20T00:00:00Z",
    provenance: { replayContext: context, ...(code ? { beatCode: code, beatThisRun: beatRunBinding(code) } : {}) },
  });
  const session = {
    recorder: () => recorder,
    replayContext: () => context,
  } as unknown as LiveGhostRecordingSessionState;
  const career = createBrowserGhostCareer(undefined, {} as Document, {
    session,
    run: () => run,
    tick: () => host.simulation.scheduler.tick,
    enemies: () => [],
    actorId: () => "unused",
  });
  career.start();
  const record = () => {
    const c = capture(),
      tick = host.simulation.scheduler.tick;
    const snapshot = {
      ...c.snapshot,
      stateClass: "recorded-canonical" as const,
      provenance: { ...c.snapshot.provenance, sourceId: ghostLiveBootstrapEventId(id) },
    };
    recorder.record("keyframes", tick, snapshot);
    recorder.record("rng", tick, snapshot.state["tear.rng.v1"]);
    recorder.record("results", tick, createGhostAuthoritativeReceipt(tick, c.semanticHash, c.input));
  };
  record();
  host.simulation.advanceOne([]);
  record();
  const event = {
    kind: "run" as const,
    tick: host.simulation.scheduler.tick,
    transition: constructedTerminal === "quit" ? ("abandoned" as const) : ("completed" as const),
    runId: context.run.id,
    mode: run.mode,
    difficulty: run.diff,
    weaponId: run.weaponId,
    wave: run.wave,
    score: run.score,
    runTimeSeconds: run.runTime,
  };
  if (constructedTerminal === "victory") career.terminal("victory");
  else career.observe(event);
  recorder.record("events", event.tick, createLiveGhostCausalEvent(event, 1));
  await recorder.finish({ outcome: "quit" });
  return new GhostCapsuleReader(vault).read(id);
}

describe("Beat This Run native authority", () => {
  it("derives a code from native receipts/terminal and refuses a resealed invented threshold", async () => {
    const source = await nativeSource("beat-source");
    expect(verifyGhostCapsuleProductionReplay(source)).toMatchObject({ status: "verified" });
    const code = createBeatThisRunCode(
      source,
      {
        capsule: source.manifest.id,
        root: source.manifest.rootIntegrity,
        manifest: stableVerificationHash(source.manifest),
        contentSha256: "a".repeat(64),
      },
      "score",
    );
    expect(decodeBeatThisRunCode(encodeBeatThisRunCode(code))).toEqual(code);
    const runtime = readGhostReplayRunContext(source.manifest.provenance)?.build;
    if (!runtime) throw new Error("Native runtime unavailable");
    expect(() => {
      assertBeatRuntimeCompatibility(code, runtime);
    }).not.toThrow();
    expect(() => {
      assertBeatRuntimeCompatibility(code, { ...runtime, revision: `${runtime.revision}-other` });
    }).toThrow(/different game build/);
    const changed = Object.fromEntries(Object.entries(code).filter(([key]) => key !== "hash"));
    changed.target = Number(code.target) + 1;
    const forged = readBeatThisRunCode({ ...changed, hash: stableVerificationHash(changed) });
    expect(() => {
      validateBeatSource(forged, source);
    }).toThrow(/target\/setup/);
    const before = JSON.stringify(source);
    expect(() => createBeatThisRunCode(source, code.source, "damage")).toThrow(/victory/);
    expect(JSON.stringify(source)).toBe(before);
    const attempt = await nativeSource("beat-child", code);
    expect(evaluateBeatThisRun(code, source, attempt)).toMatchObject({ status: "abandoned", rule: "score" });
    expect(tracksAchievements({ mode: "endless", runTime: 0, clearTimer: 0, beatThisRun: beatRunBinding(code) })).toBe(
      false,
    );
    expect(() => evaluateBeatThisRun(code, source, source)).toThrow(/declaration/);
  });
  it("preserves abandoned for a victory-only goal with no invented child metric", async () => {
    // Constructed native terminal-fact control, NOT a naturally won course.
    const source = await nativeSource("unit-victory-fact", undefined, createMemoryGhostVaultBackend(), "victory");
    const code = createBeatThisRunCode(
      source,
      {
        capsule: source.manifest.id,
        root: source.manifest.rootIntegrity,
        manifest: stableVerificationHash(source.manifest),
        contentSha256: "a".repeat(64),
      },
      "completion-time",
    );
    const child = await nativeSource("unit-abandoned-time", code);
    expect(evaluateBeatThisRun(code, source, child)).toMatchObject({ status: "abandoned", actual: null });
  });
  it("refuses unsupported/malformed code and accessors without evaluating them", () => {
    let reads = 0;
    expect(() =>
      readBeatThisRunCode(
        Object.defineProperty({}, "format", {
          enumerable: true,
          get() {
            reads++;
            return "tear-beat-code";
          },
        }),
      ),
    ).toThrow();
    expect(reads).toBe(0);
    expect(() => decodeBeatThisRunCode("BTR1.e30")).toThrow();
  });
});

describe("Beat original byte custody and durable result", () => {
  it("resolves actual native archive bytes, saves once and reopens the guarded result after response loss", async () => {
    const sourceBackend = createMemoryGhostVaultBackend(),
      source = await nativeSource("published-native", undefined, sourceBackend),
      sourceVault = new GhostLocalVault(sourceBackend);
    const exported = await prepareCompleteGhostCapsuleArchive(sourceVault, source.manifest.id),
      before = await sourceVault.exportCapsule(source.manifest.id);
    const publication = {
      available: true,
      readPublished: () =>
        Promise.resolve({
          bytes: exported.bytes,
          metadata: {
            capsule_id: source.manifest.id,
            visibility: "public",
            build_id: stableVerificationHash(readGhostReplayRunContext(source.manifest.provenance)?.build),
            verdict_json: JSON.stringify({
              status: "verified",
              moderation: "cleared",
              capsuleId: source.manifest.id,
              buildId: stableVerificationHash(readGhostReplayRunContext(source.manifest.provenance)?.build),
              contentHash: exported.binding.sha256,
              resultHash: source.manifest.rootIntegrity,
            }),
          },
        }),
    };
    // Explicit local provider-port contract; no deployed publication/auth claim.
    const code = await createBeatThisRunService(() => Promise.resolve(sourceVault), publication).create(
      source.manifest.id,
      "score",
      new AbortController().signal,
    );
    const destination = createMemoryGhostVaultBackend(),
      vault = new GhostLocalVault(destination),
      service = createBeatThisRunService(() => Promise.resolve(vault), publication);
    await service.resolve(code, new AbortController().signal);
    expect(await vault.exportCapsule(source.manifest.id)).toBe(before);
    const child = await nativeSource("native-beat-child", code, destination);
    let lost = false,
      writes = 0;
    const uncertain: GhostVaultBackend = {
      ...destination,
      async commitIfMatches(guards, changes) {
        if (changes.some((write) => write.key === `beat-result:v1:${child.manifest.id}`)) {
          writes++;
          await destination.commitIfMatches(guards, changes);
          if (!lost) {
            lost = true;
            throw new Error("committed response lost");
          }
          return;
        }
        await destination.commitIfMatches(guards, changes);
      },
    };
    const saved = await createBeatThisRunService(
      () => Promise.resolve(new GhostLocalVault(uncertain)),
      publication,
    ).review(child.manifest.id, true);
    expect(saved).toMatchObject({ saved: true, result: { status: "abandoned" } });
    expect(writes).toBe(1);
    expect(await service.review(child.manifest.id, false)).toMatchObject({ saved: true, code, result: saved.result });
    expect(await sourceVault.exportCapsule(source.manifest.id)).toBe(before);
    const binding = beatRunBinding(code),
      addCoins = () => {
        throw new Error("must not award progression");
      };
    expect(
      createLiveEconomyRuntime({
        run: () => ({ beatThisRun: binding, wave: 10, diff: "easy", coinMod: 1, mods: { owned: {} } }),
        meta: { addCoins, coins: () => 0, level: () => 0 },
        shop: [],
        shopId: () => "",
        remoteCoinMultiplier: () => 1,
        achievementTracking: () => true,
        addProfileStat: addCoins,
      }).awardCoins(100000),
    ).toBe(0);
    expect(
      ghostPublicationSourceEligibility(child.manifest, {
        resumed: false,
        modded: false,
        coached: false,
        ghostAssisted: false,
        bot: false,
        debug: false,
        stateForge: false,
      }),
    ).toMatchObject({ coached: true, ghostAssisted: true });
  });
  it("rejects changed bytes and cancellation before import with zero destination custody", async () => {
    const backend = createMemoryGhostVaultBackend(),
      source = await nativeSource("cancel-source", undefined, backend),
      exported = await prepareCompleteGhostCapsuleArchive(new GhostLocalVault(backend), source.manifest.id);
    const published = {
      capsule: source.manifest.id,
      root: source.manifest.rootIntegrity,
      manifest: stableVerificationHash(source.manifest),
      contentSha256: exported.binding.sha256,
    };
    const code = createBeatThisRunCode(source, published, "survival"),
      destination = createMemoryGhostVaultBackend();
    const control = new AbortController(),
      service = createBeatThisRunService(() => Promise.resolve(new GhostLocalVault(destination)), {
        available: true,
        readPublished: () => {
          control.abort();
          return Promise.resolve({ bytes: exported.bytes, metadata: {} });
        },
      });
    await expect(service.resolve(code, control.signal)).rejects.toThrow();
    const bad = createBeatThisRunService(() => Promise.resolve(new GhostLocalVault(destination)), {
      available: true,
      readPublished: () =>
        Promise.resolve({
          bytes: exported.bytes,
          metadata: {
            capsule_id: source.manifest.id,
            visibility: "public",
            verdict_json: JSON.stringify({
              status: "verified",
              moderation: "cleared",
              capsuleId: source.manifest.id,
              buildId: stableVerificationHash(readGhostReplayRunContext(source.manifest.provenance)?.build),
              contentHash: "0".repeat(64),
              resultHash: source.manifest.rootIntegrity,
            }),
          },
        }),
    });
    await expect(bad.resolve(code, new AbortController().signal)).rejects.toThrow(/receipt|bytes/);
    const wrongBuild = createBeatThisRunService(() => Promise.resolve(new GhostLocalVault(destination)), {
      available: true,
      readPublished: () =>
        Promise.resolve({
          bytes: exported.bytes,
          metadata: {
            capsule_id: source.manifest.id,
            visibility: "public",
            build_id: "f".repeat(16),
            verdict_json: JSON.stringify({
              status: "verified",
              moderation: "cleared",
              capsuleId: source.manifest.id,
              buildId: "f".repeat(16),
              contentHash: exported.binding.sha256,
              resultHash: source.manifest.rootIntegrity,
            }),
          },
        }),
    });
    await expect(wrongBuild.resolve(code, new AbortController().signal)).rejects.toThrow(/manifest.*verdict/);
    expect(await destination.keys("manifests")).toEqual([]);
    expect(await destination.keys("chunks")).toEqual([]);
    expect(await destination.keys("analysis")).toEqual([]);
  });
  it("records ordinary private draft decisions before mutation and consumes each only at the next scheduler tick", () => {
    const binding = {
      format: "tear-beat-attempt" as const,
      version: 1 as const,
      codeHash: "a".repeat(16),
      source: { capsule: "source", root: "b".repeat(16), manifest: "c".repeat(16) },
    };
    const build = () => ({
      beatThisRun: binding,
      mode: "endless" as const,
      wave: 1,
      mods: newMods(),
      specialBlock: 0,
      specialsOffered: 0,
      reservedUpgrade: null,
    });
    const run = build(),
      other = build(),
      events: SeedRaceDecision[] = [];
    let picked = 0,
      replayPicked = 0;
    const make = (value: typeof run, applied: () => void) =>
      createRewardRuntime({
        run: () => value,
        roll: () => UPGRADES.slice(0, 3),
        beforeDecision: (decision, before) => {
          expect(picked).toBe(0);
          const original = createSeedRaceDecision(4, 7, "run", binding.codeHash, before, decision);
          events.push({
            ...original,
            id: "beat-decision-4",
            payload: { ...original.payload, format: "tear-beat-run-decision" },
          });
          return 4;
        },
        transitionPorts: {
          applyUpgrade: applied,
          tierUp: () => undefined,
          ghostLoadout: () => undefined,
          ghostEvent: () => undefined,
          consumeInput: () => undefined,
          resetUi: () => undefined,
          setScreen: () => undefined,
          startNextWave: () => undefined,
          requestPointer: () => undefined,
        },
      });
    const a = make(run, () => {
        picked++;
      }),
      b = make(other, () => {
        replayPicked++;
      });
    a.openDraft();
    b.openDraft();
    expect(a.snapshot()?.seedLocked).toBeUndefined();
    a.selectDraft(0);
    expect(picked).toBe(1);
    const playback = createSeedRaceDecisionPlayback(events, 0, b);
    playback(7);
    expect(replayPicked).toBe(0);
    playback(8);
    playback(8);
    expect(replayPicked).toBe(1);
    expect(b.snapshot()).toEqual(a.snapshot());
  });
});
