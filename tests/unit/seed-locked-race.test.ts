import type { TearCodecValue } from "../../src/tearbench/state-codecs";
import { createLiveEconomyRuntime } from "../../src/gameplay/scoring/live-economy-runtime";
import { LiveRecordingController } from "../../src/gameplay/run/live-recording-controller";
import { ghostPublicationSourceEligibility } from "../../src/ghost/local-publication-job";
import { provisionalCareerEntry } from "../../src/ghost/career-archive";
import { recordedGhostChallengeChoices, verifyRecordedGhostChallenge } from "../../src/ghost/recorded-challenge";
import { describe, expect, it, vi } from "vitest";
import { RewardSelectionController } from "../../src/gameplay/run/reward-selection";
import { rollSeedLockedDraft, seedRaceCatalogHash } from "../../src/gameplay/run/seed-locked-draft";
import { UPGRADES } from "../../src/gameplay/upgrades";
import { captureLiveRewardSelection } from "../../src/app/live-state-forge-adapter";
import { hydrateRewardCodecPayload } from "../../src/tearbench/reward-codec-hydrator";
import { createProductionGhostReplayComposition, captureProductionReplayCheckpoint, restoreProductionReplaySnapshot } from "../../src/tearbench/production-replay-composition";
import { declareSeedRace, readSeedRaceRun, seedRaceInitialBuildHash } from "../../src/ghost/seed-race-contract";
import { stableVerificationHash } from "../../src/replay/hash";
import { legalSeedRaceUpgrade, type SeedRaceRun } from "../../src/gameplay/run/seed-locked-draft";
import { createRewardRuntime } from "../../src/gameplay/run/reward-runtime";
import { createSeedRaceDecision, createSeedRaceDecisionPlayback } from "../../src/ghost/seed-race-decisions";

const spec = { policy: "seed-locked-common-offers.v1" as const, seed: 117, catalogHash: seedRaceCatalogHash() };
const roller = () => { throw new Error("Race must not consume the ordinary draft stream"); };
describe("Seed-Locked Race", () => {
  it("keeps an identical personal carried definition when the shared slot is selected", () => {
    const common = rollSeedLockedDraft(spec, 1, 0, 3).choices;
    const carried = common.find(choice => !choice.unique);
    if (!carried) throw new Error("fixture requires a stackable common card");
    const controller = new RewardSelectionController<(typeof UPGRADES)[number]>({ mode: "endless", seedLocked: spec, reservePick: true, reservedChoice: carried });
    controller.openDraft(1, roller);
    controller.selectDraft(common.indexOf(carried), () => true);
    expect(controller.snapshot().reservedChoice).toBe(carried);
    controller.selectReserve(-2);
    expect(controller.snapshot().reservedChoice).toBe(carried);
  });
  it("refuses a reserve snapshot with an out-of-coordinate card before hydration", () => {
    const controller = new RewardSelectionController<(typeof UPGRADES)[number]>({ mode: "endless", seedLocked: spec, reservePick: true });
    controller.openDraft(1, roller); controller.selectDraft(0, () => true);
    const captured = captureLiveRewardSelection({ ...controller.snapshot(), decisionSequence: 4 }, new Map());
    const outsider = UPGRADES.find(choice => !controller.snapshot().choices.includes(choice));
    if (!outsider) throw new Error("fixture requires an out-of-offer card");
    const forged = { ...(captured as Readonly<Record<string, TearCodecValue>>), reserveChoices: [{ id: outsider.id }] };
    expect(() => hydrateRewardCodecPayload(UPGRADES, { selection: forged })).toThrow(/common|coordinate|reserve/iu);
  });
  it("keeps coordinate offers independent of private picks, rerolls and game entropy", () => {
    const a = new RewardSelectionController<(typeof UPGRADES)[number]>({ mode: "endless", seedLocked: spec, rerolls: 3, expandedDraft: true });
    const b = new RewardSelectionController<(typeof UPGRADES)[number]>({ mode: "endless", seedLocked: spec, rerolls: 3, expandedDraft: true });
    let specials = 0;
    for (let wave = 1; wave <= 10; wave++) {
      a.openDraft(wave, roller); b.openDraft(wave, roller);
      expect(a.snapshot().choices).toEqual(b.snapshot().choices);
      specials += a.snapshot().choices.filter(c => c.tiers).length;
      if (wave <= 3) {
        const previous = a.snapshot().choices.map(c => c.id); a.reroll(roller);
        expect(a.snapshot().choices.every(c => !previous.includes(c.id))).toBe(true);
        expect(a.snapshot().choices).toEqual(rollSeedLockedDraft(spec, wave, 1, 4).choices);
      }
      a.selectDraft(0, () => true); b.selectDraft(1, () => true);
    }
    expect(specials).toBeGreaterThanOrEqual(2);
  });
  it("enforces unique/max-stack legality, consumes only the carried slot and allows an all-illegal pass", () => {
    expect(legalSeedRaceUpgrade({ id: "unique", unique: true }, { unique: 1 })).toBe(false);
    expect(legalSeedRaceUpgrade({ id: "stack", maxStacks: 2 }, { stack: 2 })).toBe(false);
    const carried = UPGRADES[0]; if (!carried) throw new Error("catalog empty");
    const controller = new RewardSelectionController<(typeof UPGRADES)[number]>({ mode: "endless", seedLocked: spec, reservedChoice: carried });
    controller.openDraft(1, roller);
    expect(controller.selectDraft(0, () => false).intents).toEqual([]);
    expect(controller.selectDraft(-1, () => false).intents.some(i => i.type === "apply-upgrade")).toBe(false);
    expect(controller.snapshot().phase).toBe("complete");
    controller.openDraft(2, roller);
    const result = controller.selectDraft(controller.snapshot().choices.length, () => true);
    expect(result.intents.filter(i => i.type === "apply-upgrade")).toHaveLength(1);
    expect(controller.snapshot().reservedChoice).toBeNull();
  });
  it("captures a real production mid-draft and preserves subsequent common offers, personal reserve and RNG", () => {
    const composition = createProductionGhostReplayComposition({ seed: "race-portable", mode: "endless" });
    const source = composition.create(undefined), run = requireRaceValue(source.replay.world.state.run());
    Object.assign(run.mods, { expandedDraft: true, reservePick: true, draftRerolls: 3 });
    const initial = captureProductionReplayCheckpoint(source.replay, source.combat, source.waveReward, "race-initial").snapshot;
    run.seedRace = declareSeedRace({ format: "tear-seed-race", version: 1, mode: "endless", difficulty: run.diff,
      weapon: run.weaponId, boss: "shuffle", seed: run.runSeed, metaRanks: { expanded: 1, reserve: 1, reroll: 3 }, variantDiscovery: run.variantDiscovery ?? [],
      headstartId: null, baselineHash: "1111111111111111", initialBuildHash: seedRaceInitialBuildHash(initial.state), build: initial.provenance.build,
      draft: { ...spec, seed: run.runSeed } });
    source.waveReward.reward.reset(); source.simulation.advanceOne([]);
    const clear = (host: typeof source) => { Object.assign(requireRaceValue(host.replay.world.state.run()), { spawnQueue: [] }); host.replay.world.state.setEnemies([]); host.waveReward.update(1.5); };
    clear(source);
    const beforeReroll = source.replay.world.context.services.random.snapshot();
    source.waveReward.reward.reroll();
    expect(source.replay.world.context.services.random.snapshot()).toEqual(beforeReroll);
    const captured = captureProductionReplayCheckpoint(source.replay, source.combat, source.waveReward, "race-draft");
    const restored = composition.create(JSON.parse(JSON.stringify(captured.snapshot)) as typeof captured.snapshot);
    expect(restored.waveReward.reward.snapshot()).toEqual(source.waveReward.reward.snapshot());
    const tick = source.simulation.scheduler.tick;
    const pickup = createSeedRaceDecision(100, tick, "race-run", run.seedRace.sharedHash, requireRaceValue(source.waveReward.reward.snapshot()), { kind: "draft", index: 0 });
    source.waveReward.reward.decide({ kind: "draft", index: 0 }, 100);
    const reserve = createSeedRaceDecision(110, tick, "race-run", run.seedRace.sharedHash, requireRaceValue(source.waveReward.reward.snapshot()), { kind: "reserve", index: 0 });
    source.waveReward.reward.decide({ kind: "reserve", index: 0 }, 110);
    const forward = createProductionGhostReplayComposition({ seed: "race-portable", raceDecisions: [pickup, reserve] }).create(captured.snapshot);
    for (const host of [source, forward]) { host.beforeReplayAdvance(tick + 1); host.simulation.advanceOne([]); }
    expect(forward.semanticProjection()).toEqual(source.semanticProjection());
    expect(forward.simulation.input.snapshot()).toEqual(source.simulation.input.snapshot());
    expect(forward.waveReward.reward.snapshot()).toEqual(source.waveReward.reward.snapshot());
    restored.waveReward.reward.selectDraft(1); restored.waveReward.reward.selectReserve(1);
    restored.beforeReplayAdvance(tick + 1); restored.simulation.advanceOne([]);
    clear(source); clear(restored);
    expect(restored.waveReward.reward.snapshot()?.choices.map(c => c.id)).toEqual(source.waveReward.reward.snapshot()?.choices.map(c => c.id));
    expect(restored.replay.world.context.services.random.snapshot()).toEqual(source.replay.world.context.services.random.snapshot());
    const bad = structuredClone(captured.snapshot);
    const badRun = bad.state["tear.run.v1"] as { seedRace: SeedRaceRun };
    const shared = { ...badRun.seedRace.shared, metaRanks: { unknown: 1 } };
    badRun.seedRace = { ...badRun.seedRace, shared, sharedHash: stableVerificationHash(shared) };
    const owners = [restored.replay.world.state.run(), restored.replay.world.state.player(), restored.replay.world.state.blade()];
    const rng = restored.replay.world.context.services.random.snapshot();
    expect(() => restoreProductionReplaySnapshot(restored.replay, bad)).toThrow(/race/iu);
    expect([restored.replay.world.state.run(), restored.replay.world.state.player(), restored.replay.world.state.blade()]).toEqual(owners);
    expect(restored.replay.world.context.services.random.snapshot()).toEqual(rng);
  });
  it("records before mutation and consumes a decision once across a pre-choice or post-choice snapshot", () => {
    const run = { seedRace: { shared: { draft: spec } } as SeedRaceRun, mode: "endless" as const, wave: 1, specialBlock: -1, specialsOffered: 0,
      reservedUpgrade: null, mods: { draftRerolls: 1, tier: {}, owned: {}, reservePick: false } };
    const events: ReturnType<typeof createSeedRaceDecision>[] = [];
    const make = (record = false) => createRewardRuntime({ run: () => run, roll: roller,
      ...(record ? { beforeDecision: (decision: Parameters<typeof createSeedRaceDecision>[5], before: Parameters<typeof createSeedRaceDecision>[4]) => {
        expect(source.snapshot()).toBe(before); expect(run.mods.owned).toEqual({});
        events.push(createSeedRaceDecision(events.length + 10, 12, "run", "1111111111111111", before, decision)); return requireRaceValue(events.at(-1)).sequence;
      } } : {}), transitionPorts: { applyUpgrade: () => undefined, tierUp: () => undefined, ghostLoadout: () => undefined,
        ghostEvent: () => undefined, consumeInput: () => undefined, resetUi: () => undefined, setScreen: () => undefined, startNextWave: () => undefined, requestPointer: () => undefined } });
    const source = make(true); source.openDraft(); const before = source.snapshot(); source.reroll();
    const after = source.snapshot(), target = make(); target.restore(before);
    const play = createSeedRaceDecisionPlayback(events, 12, target); play(13); play(14);
    expect(target.snapshot()).toEqual(after);
    target.restore(after); createSeedRaceDecisionPlayback(events, 12, target)(13); expect(target.snapshot()).toEqual(after);
    target.restore(before); target.selectDraft(0);
    expect(() => { createSeedRaceDecisionPlayback(events, 12, target)(13); }).toThrow(/frontier/iu);
  });
  it("preserves absence and refuses unknown ranks, weapons, bosses and accessor declarations", () => {
    expect(readSeedRaceRun(undefined)).toBeUndefined();
    let reads = 0;
    expect(() => readSeedRaceRun({ get role() { reads++; return "reference"; } })).toThrow();
    expect(reads).toBe(0);
  });
});


describe("Race source category", () => {
  it.each(["reference", "challenger"] as const)("retains %s recordings without economy, ordinary publication or ordinary-best eligibility", (role) => {
    const reference = declareSeedRace({ format: "tear-seed-race", version: 1, mode: "endless", difficulty: "normal", weapon: "sword", boss: "shuffle", seed: 117,
      metaRanks: {}, variantDiscovery: [], headstartId: null, initialBuildHash: "1".repeat(16), baselineHash: "2".repeat(16),
      build: { version: "1", revision: "r", target: "test", rulesetVersion: "v", contentHash: "c", configHash: "f" }, draft: spec });
    const race = role === "reference" ? reference : requireRaceValue(readSeedRaceRun({ ...reference, role, source: { id: "source", root: "3".repeat(16), manifestHash: "4".repeat(16) } }));
    const run = { seedRace: race, mode: "endless" as const, diff: "normal" as const, coinMod: 1, mods: { owned: {} }, wave: 3, score: 1200,
      runTime: 20, waveTime: 2, waveKills: 3, wavePeak: 1, waveLog: [], weaponId: "sword", damagedThisRun: false };
    const addCoins = vi.fn(), addProfileStat = vi.fn();
    const economy = createLiveEconomyRuntime({ run: () => run, remoteCoinMultiplier: () => 1, meta: { coins: () => 55, level: () => 0, addCoins }, shop: [], shopId: () => "", achievementTracking: () => true, addProfileStat });
    expect(economy.awardCoins(1200)).toBe(0); expect(addCoins).not.toHaveBeenCalled(); expect(addProfileStat).not.toHaveBeenCalled();
    const submitScore = vi.fn(), publishReplay = vi.fn(), storeReplay = vi.fn(() => "retained"), stopRecording = vi.fn(() => ({}));
    new LiveRecordingController({ snapshot: () => run, displayName: () => "", stageIndex: () => 0, loadout: () => [], authoritativeResult: () => null,
      stopRecording, storeReplay, recordingStopped: () => undefined, replayStored: () => undefined, submitScore, publishReplay, linkReplay: vi.fn(), attachShareId: vi.fn() }).finish(false);
    expect(storeReplay).toHaveBeenCalledWith({}, expect.objectContaining({ seedRace: race }));
    expect(submitScore).not.toHaveBeenCalled(); expect(publishReplay).not.toHaveBeenCalled();
    const manifest = { id: "race", rootIntegrity: "a".repeat(16), createdAt: "2026-10-20T00:00:00Z", provenance: { seedRace: race, actor: "bot" } } as unknown as Parameters<typeof provisionalCareerEntry>[0];
    expect(provisionalCareerEntry(manifest)).toMatchObject({ assisted: true, seedRaceRole: role, actor: "bot" });
    expect(ghostPublicationSourceEligibility(manifest, { resumed: false, modded: false, coached: false, ghostAssisted: false, bot: false, debug: false, stateForge: false })).toMatchObject({ coached: true, ghostAssisted: true, bot: true });
    const parent = { manifest } as Parameters<typeof recordedGhostChallengeChoices>[0];
    expect(recordedGhostChallengeChoices(parent, {} as never)).toEqual([]);
    expect(() => verifyRecordedGhostChallenge({} as never, parent, {} as never)).toThrow(/fresh Race This Reference/iu);
  });
});

function requireRaceValue<T>(value: T | null | undefined): T { if (value == null) throw new Error("Race fixture value unavailable"); return value; }
