import { describe, expect, it } from "vitest";

import { INACTIVE_CINEMATIC_DIRECTOR_STATE_V1 } from "../../src/gameplay/runtime/cinematic-director";
import { stagePlatforms } from "../../src/gameplay/stages";
import { CONFIG } from "../../src/config/game-config";
import { UPGRADES } from "../../src/gameplay/upgrades";
import { stableVerificationHash } from "../../src/replay/hash";
import {
  CAMPAIGN_VICTORY_FINAL_WAVE,
  CAMPAIGN_VICTORY_ORIGIN_WAVE,
  createCampaignVictoryOrigin,
  createCampaignWave59RewardFrontier,
} from "../../src/tearbench/campaign-victory-origin";
import type { TearSnapshotV1 } from "../../src/tearbench/contracts";
import { projectEnvironmentHash } from "../../src/tearbench/environment-codec";
import { reconstructProgression, synthesizeProgression } from "../../src/tearbench/progression-ledger";

function sourceSnapshot(): TearSnapshotV1 {
  const state = {
    "tear.player.v1": { id: "player", x: 800, y: 700, hp: 100, maxHp: 100 },
    "tear.blade.v1": { id: "blade", ownerId: "player", weaponId: "sword", x: 800, y: 700 },
    "tear.run.v1": {
      mode: "campaign", difficulty: "normal", diff: "normal", weaponId: "sword",
      wave: 1, stage: 0, _biomeIdx: 0, tick: 12, score: 0,
      mods: { owned: {}, tiers: {}, ownedOrder: [] }, spawnQueue: [{ kind: "charger" }],
    },
    "tear.world.v1": {
      clock: 12, floaters: [], identityState: {
        nextEntityId: 9, nextWallSequence: 2, nextSlowZoneSequence: 3, claimedIds: ["enemy:8"],
      },
      runtime: {
        lifecycle: {
          phase: "wave-prepared", sessionId: "campaign-session", wave: 1, bossWave: false,
          activationDeferred: true, reward: null, outcome: null, revision: 2,
        },
        chapterBinding: { stageIndex: 0 },
        stageBanner: { name: "The Grounds", seconds: 2 },
        cinemaProtection: { active: true, lastMode: "intro" },
      },
    },
    "tear.enemy.v1": [{ id: "enemy:8", factoryId: "charger", x: 10, y: 20 }],
    "tear.boss.v1": [{ id: "enemy:9", factoryId: "warden", x: 30, y: 40 }],
    "tear.projectile.v1": [{ id: "projectile:1", factoryId: "projectile", x: 50, y: 60 }],
    "tear.platform.v1": [{ x: 0, y: 0, w: 1, h: 1 }],
    "tear.hazard.v1": { slowZones: [], walls: [] },
    "tear.ui.v1": { screen: "playing", focusId: "-1" },
    "tear.reward.v1": { selection: null },
    "tear.configuration.v1": { rulesetVersion: "production", values: {} },
    "tear.rng.v1": { combat: { algorithm: "mulberry32", state: 1 } },
    "tear.cinematic.v1": INACTIVE_CINEMATIC_DIRECTOR_STATE_V1,
  };
  return {
    format: "tear-contract", kind: "snapshot", schemaVersion: 1,
    id: "campaign-source", tick: 12, stateClass: "recorded-canonical", seed: "campaign-frontier-unit",
    hashes: {
      exact: stableVerificationHash(state), semantic: "semantic", visual: "visual",
      progression: "source-progression", environment: stableVerificationHash(state["tear.world.v1"]),
    },
    provenance: {
      actor: "scripted-bot", producer: "unit", executionClass: "engineering",
      observationClass: "privileged-diagnostic", trainingConsent: "no-training",
      build: {
        version: "unit", revision: "unit", target: "test-standalone", rulesetVersion: "production",
        contentHash: "content", configHash: "config",
      },
    },
    rng: {}, codecs: {}, state,
  };
}

function codec(snapshot: TearSnapshotV1, id: string): Record<string, unknown> {
  const value = snapshot.state[id];
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError(`${id} is not an object`);
  return value as Record<string, unknown>;
}

describe("campaign victory State Forge origin", () => {
  it("retains the six-stage wave-59 history and removes only the false terminal event", () => {
    const source = synthesizeProgression({
      mode: "campaign", difficulty: "normal", weapon: "sword",
      targetWave: CAMPAIGN_VICTORY_ORIGIN_WAVE,
      configuredCampaignWaves: CAMPAIGN_VICTORY_FINAL_WAVE,
      policy: "coverage-seeking",
    });
    const origin = createCampaignVictoryOrigin();

    expect(origin).toMatchObject({
      id: "campaign-wave-59-victory-origin", legal: true, terminal: false,
      currentWave: 59, nextWave: 60,
      provenance: {
        kind: "canonical-nonterminal-progression-prefix",
        producer: "synthesizeProgression",
        sourceProgressionHash: source.ledger.progressionHash,
        removedEvent: { type: "run.completed", wave: 59 },
      },
    });
    expect(origin.ledger.events).toEqual(source.ledger.events.slice(0, -1));
    expect(source.ledger.events).toHaveLength(origin.ledger.events.length + 1);
    expect(origin.ledger.events.some((event) => event.type === "run.completed")).toBe(false);
    expect(origin.ledger.events.at(-1)).toMatchObject({ type: "reward.granted", wave: 59 });
    expect(origin.ledger.events.filter((event) => event.type === "wave.started")).toHaveLength(59);
    expect(origin.ledger.events.filter((event) => event.type === "wave.cleared")).toHaveLength(59);
    expect(origin.finalReward).toMatchObject({ type: "draft", wave: 59 });
    expect(origin.finalReward.offeredIds).toContain(origin.finalReward.selectedId);
  });

  it("is deterministic, reconstructible, and carries the canonical configuration and build", () => {
    const first = createCampaignVictoryOrigin();
    const second = createCampaignVictoryOrigin();
    const reconstructed = reconstructProgression(first.ledger);

    expect(second).toEqual(first);
    expect(reconstructed.progressionHash).toBe(first.ledger.progressionHash);
    expect(reconstructed.configurationHash).toBe(first.configurationHash);
    expect(reconstructed.build).toEqual(first.build);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.ledger.events)).toBe(true);
  });

  it("creates the deterministic post-selection frontier without running wave 60 or mutating its source", () => {
    const source = sourceSnapshot();
    const before = structuredClone(source);
    const certificate = createCampaignVictoryOrigin();
    const frontier = createCampaignWave59RewardFrontier(source, certificate, (index) => stagePlatforms(index, CONFIG));
    const run = codec(frontier, "tear.run.v1");
    const world = codec(frontier, "tear.world.v1");
    const runtime = world.runtime as Record<string, unknown>;
    const reward = codec(frontier, "tear.reward.v1").selection as Record<string, unknown>;
    const waveLog = run.waveLog as readonly { wave: number | string; time: number; kills: number; peak: number }[];

    expect(source).toEqual(before);
    expect(frontier).toMatchObject({
      id: "campaign-wave-59-reward-frontier",
      tick: certificate.statistics.elapsedTicks,
      stateClass: "reconstructed-reachable",
      lineage: {
        parentId: source.id, relation: "forked-at", parentRootHash: source.hashes.exact, forkTick: source.tick,
      },
      provenance: { actor: "state-forge", producer: "campaign-victory-origin", sourceId: source.id },
    });
    expect(run).toMatchObject({
      mode: "campaign", difficulty: "normal", diff: "normal", weaponId: "sword",
      wave: 59, stage: 6, _biomeIdx: 6, spawnQueue: [], chapterState: "WAVE_LIVE",
      score: certificate.statistics.score,
    });
    expect(waveLog).toHaveLength(59);
    expect(waveLog.reduce((sum, entry) => sum + entry.kills, 0)).toBe(certificate.statistics.kills);
    expect(waveLog.reduce((sum, entry) => sum + entry.time, 0)).toBeCloseTo(certificate.statistics.elapsedTicks / 120, 10);
    expect(waveLog.filter((entry) => entry.wave === "BOSS")).toHaveLength(
      certificate.ledger.events.filter((event) => event.type === "boss.defeated").length,
    );
    expect(frontier.state["tear.enemy.v1"]).toEqual([]);
    expect(frontier.state["tear.boss.v1"]).toEqual([]);
    expect(frontier.state["tear.projectile.v1"]).toEqual([]);
    expect(frontier.state["tear.platform.v1"]).toEqual(stagePlatforms(6, CONFIG));
    expect(frontier.state["tear.cinematic.v1"]).toEqual(INACTIVE_CINEMATIC_DIRECTOR_STATE_V1);
    expect(codec(frontier, "tear.player.v1")).toMatchObject({
      cinematicProtected: false, cinematicGraceT: 0,
    });
    expect(runtime).toMatchObject({
      lifecycle: {
        phase: "reward-pending", sessionId: "campaign-session", wave: 59, bossWave: false,
        activationDeferred: false, reward: "draft", outcome: null, revision: 237,
      },
      chapterBinding: null, stageBanner: { name: "The Tear", seconds: 0 },
      cinemaProtection: { active: false, lastMode: null },
    });
    expect(codec(frontier, "tear.ui.v1").screen).toBe("draft");
    expect(reward).toMatchObject({ phase: "complete", mode: "campaign", wave: 59, revision: 2 });
    const choices = reward.choices as readonly { id: string }[];
    expect(choices.map((choice) => choice.id)).toEqual(certificate.finalReward.offeredIds);
    const selectedChoice = choices.find((choice) => choice.id === certificate.finalReward.selectedId);
    const catalogChoice = UPGRADES.find((choice) => choice.id === certificate.finalReward.selectedId);
    expect(selectedChoice).toMatchObject({
      id: catalogChoice?.id, name: catalogChoice?.name, cat: catalogChoice?.cat, desc: catalogChoice?.desc,
    });
    expect(selectedChoice).not.toHaveProperty("apply");
    expect(certificate.ledger.events.some((event) => event.type === "run.completed")).toBe(false);
    expect(frontier.hashes).toMatchObject({
      exact: stableVerificationHash(frontier.state),
      progression: certificate.ledger.progressionHash,
      environment: stableVerificationHash(projectEnvironmentHash(frontier.state["tear.hazard.v1"])),
    });
  });

  it("fails closed for a wrong source mode, corrupt source hash, or altered certificate", () => {
    const certificate = createCampaignVictoryOrigin();
    const wrongMode = structuredClone(sourceSnapshot());
    (wrongMode.state["tear.run.v1"] as { mode: string }).mode = "endless";
    (wrongMode.hashes as { exact: string }).exact = stableVerificationHash(wrongMode.state);
    expect(() => createCampaignWave59RewardFrontier(wrongMode, certificate, (index) => stagePlatforms(index, CONFIG))).toThrow(/Campaign Normal Sword/u);

    const corrupt = structuredClone(sourceSnapshot());
    (corrupt.state["tear.run.v1"] as { score: number }).score = 99;
    expect(() => createCampaignWave59RewardFrontier(corrupt, certificate, (index) => stagePlatforms(index, CONFIG))).toThrow(/source exact hash/u);

    const altered = structuredClone(certificate);
    (altered.finalReward as { selectedId: string }).selectedId = "not-the-certified-choice";
    expect(() => createCampaignWave59RewardFrontier(sourceSnapshot(), altered, (index) => stagePlatforms(index, CONFIG))).toThrow(/canonical wave-59 certificate/u);
  });
});
