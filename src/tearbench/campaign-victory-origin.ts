import { stableVerificationHash } from "../replay/hash";
import { RunLifecycleController } from "../gameplay/run/lifecycle";
import { INACTIVE_CINEMATIC_DIRECTOR_STATE_V1 } from "../gameplay/runtime/cinematic-director";
import { STAGES, stageAt } from "../gameplay/stages";
import { UPGRADES } from "../gameplay/upgrades";
import type { TearSnapshotV1 } from "./contracts";
import { projectEnvironmentHash } from "./environment-codec";
import {
  reconstructProgression,
  synthesizeProgression,
  type TearProgressionEvent,
  type TearProgressionLedger,
  type TearSynthesizedProgression,
} from "./progression-ledger";

/** Six-stage engineering-branch finale boundary; not publishable campaign truth. */
export const CAMPAIGN_VICTORY_ORIGIN_WAVE = 59 as const;
export const CAMPAIGN_VICTORY_FINAL_WAVE = 60 as const;

export interface CampaignVictoryOriginCertificate {
  readonly id: "campaign-wave-59-victory-origin";
  readonly legal: true;
  readonly terminal: false;
  readonly currentWave: typeof CAMPAIGN_VICTORY_ORIGIN_WAVE;
  readonly nextWave: typeof CAMPAIGN_VICTORY_FINAL_WAVE;
  readonly ledger: TearProgressionLedger;
  readonly build: Readonly<Record<string, number>>;
  readonly statistics: TearSynthesizedProgression["statistics"];
  readonly configurationHash: string;
  readonly finalReward: Readonly<{
    type: "draft";
    wave: typeof CAMPAIGN_VICTORY_ORIGIN_WAVE;
    offeredIds: readonly string[];
    selectedId: string;
  }>;
  readonly provenance: Readonly<{
    kind: "canonical-nonterminal-progression-prefix";
    producer: "synthesizeProgression";
    sourceProgressionHash: string;
    removedEvent: Extract<TearProgressionEvent, { type: "run.completed" }>;
  }>;
}

/**
 * Creates a reachable campaign history immediately before the final wave.
 * Synthesis currently closes every requested target with `run.completed`, so
 * this helper removes that one false terminal assertion and retains every
 * canonical wave, reward, and configuration event through wave 59.
 */
export function createCampaignVictoryOrigin(): CampaignVictoryOriginCertificate {
  const synthesized = synthesizeProgression({
    mode: "campaign",
    difficulty: "normal",
    weapon: "sword",
    targetWave: CAMPAIGN_VICTORY_ORIGIN_WAVE,
    configuredCampaignWaves: CAMPAIGN_VICTORY_FINAL_WAVE,
    policy: "coverage-seeking",
  });
  if (!synthesized.reachable) {
    throw new TypeError(`campaign victory origin is unreachable: ${synthesized.explanation ?? "unknown reason"}`);
  }
  const sourceEvents = synthesized.ledger.events;
  const terminalEvents = sourceEvents.filter((event) => event.type === "run.completed");
  const terminal = terminalEvents[0];
  if (terminalEvents.length !== 1 || terminal?.type !== "run.completed"
    || terminal.wave !== CAMPAIGN_VICTORY_ORIGIN_WAVE
    || sourceEvents.at(-1) !== terminal) {
    throw new TypeError("campaign victory origin requires exactly one final synthesized completion event");
  }
  const events = Object.freeze(sourceEvents.slice(0, -1));
  const ledger: TearProgressionLedger = Object.freeze({
    ...synthesized.ledger,
    events,
    progressionHash: stableVerificationHash(events),
  });
  const reconstructed = reconstructProgression(ledger);
  if (reconstructed.configurationHash !== synthesized.configurationHash) {
    throw new TypeError("campaign victory origin changed the synthesized configuration history");
  }
  const finalOffer = [...events].reverse().find((event) =>
    event.type === "draft.offered" && event.wave === CAMPAIGN_VICTORY_ORIGIN_WAVE);
  const finalSelection = [...events].reverse().find((event) =>
    event.type === "draft.selected" && event.wave === CAMPAIGN_VICTORY_ORIGIN_WAVE);
  if (finalOffer?.type !== "draft.offered" || finalSelection?.type !== "draft.selected"
    || !finalOffer.ids.includes(finalSelection.id)) {
    throw new TypeError("campaign victory origin requires a selected wave-59 draft offer");
  }
  return Object.freeze({
    id: "campaign-wave-59-victory-origin",
    legal: true,
    terminal: false,
    currentWave: CAMPAIGN_VICTORY_ORIGIN_WAVE,
    nextWave: CAMPAIGN_VICTORY_FINAL_WAVE,
    ledger,
    build: reconstructed.build,
    statistics: synthesized.statistics,
    configurationHash: reconstructed.configurationHash,
    finalReward: Object.freeze({
      type: "draft",
      wave: CAMPAIGN_VICTORY_ORIGIN_WAVE,
      offeredIds: Object.freeze([...finalOffer.ids]),
      selectedId: finalSelection.id,
    }),
    provenance: Object.freeze({
      kind: "canonical-nonterminal-progression-prefix",
      producer: "synthesizeProgression",
      sourceProgressionHash: synthesized.ledger.progressionHash,
      removedEvent: terminal,
    }),
  });
}

type MutableRecord = Record<string, unknown>;

function record(value: unknown, label: string): MutableRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value as MutableRecord;
}

function certifyFrontierInput(certificate: CampaignVictoryOriginCertificate): void {
  const canonical = createCampaignVictoryOrigin();
  if (stableVerificationHash(certificate) !== stableVerificationHash(canonical)) {
    throw new TypeError("campaign reward frontier certificate is not the canonical wave-59 certificate");
  }
  if (certificate.ledger.targetWave !== CAMPAIGN_VICTORY_ORIGIN_WAVE
    || certificate.ledger.events.some((event) => event.type === "run.completed")) {
    throw new TypeError("campaign reward frontier certificate is terminal or targets the wrong wave");
  }
  const reconstructed = reconstructProgression(certificate.ledger);
  if (reconstructed.configurationHash !== certificate.configurationHash
    || stableVerificationHash(certificate.ledger.events) !== certificate.ledger.progressionHash) {
    throw new TypeError("campaign reward frontier certificate integrity failed");
  }
  const offer = certificate.ledger.events.find((event) => event.type === "draft.offered"
    && event.wave === CAMPAIGN_VICTORY_ORIGIN_WAVE);
  const selected = certificate.ledger.events.find((event) => event.type === "draft.selected"
    && event.wave === CAMPAIGN_VICTORY_ORIGIN_WAVE);
  if (offer?.type !== "draft.offered" || selected?.type !== "draft.selected"
    || offer.ids.join("\0") !== certificate.finalReward.offeredIds.join("\0")
    || selected.id !== certificate.finalReward.selectedId || !offer.ids.includes(selected.id)) {
    throw new TypeError("campaign reward frontier final reward provenance is invalid");
  }
}

function historicalWaveLog(certificate: CampaignVictoryOriginCertificate) {
  const count = CAMPAIGN_VICTORY_ORIGIN_WAVE;
  const totalSeconds = certificate.statistics.elapsedTicks / 120;
  const seconds = totalSeconds / count;
  const baseKills = Math.floor(certificate.statistics.kills / count);
  const extraKills = certificate.statistics.kills % count;
  const bossWaves = new Set(certificate.ledger.events.flatMap((event) =>
    event.type === "boss.defeated" ? [event.wave] : []));
  return Object.freeze(Array.from({ length: count }, (_, index) => Object.freeze({
    wave: bossWaves.has(index + 1) ? "BOSS" : index + 1,
    time: index === count - 1 ? totalSeconds - seconds * (count - 1) : seconds,
    kills: baseKills + (index < extraKills ? 1 : 0),
    peak: certificate.statistics.style,
  })));
}

function portableUpgradeChoice(id: string): Readonly<Record<string, unknown>> {
  const choice = UPGRADES.find((candidate) => candidate.id === id);
  if (choice === undefined) {
    throw new TypeError(`campaign reward frontier references unknown production upgrade ${id}`);
  }
  return Object.freeze({
    id: choice.id,
    name: choice.name,
    unique: choice.unique,
    cat: choice.cat,
    desc: choice.desc,
    ...(choice.rare === undefined ? {} : { rare: choice.rare }),
    ...(choice.maxStacks === undefined ? {} : { maxStacks: choice.maxStacks }),
    ...(choice.tiers === undefined ? {} : {
      tiers: Object.freeze(choice.tiers.map((tier) => Object.freeze({ desc: tier.desc }))),
    }),
  });
}

/**
 * Builds the synchronous post-selection/pre-`start-next-wave` State Forge
 * position. It never executes wave 60 and never mutates the captured source.
 */
export function createCampaignWave59RewardFrontier(
  sourceSnapshot: TearSnapshotV1,
  certificate: CampaignVictoryOriginCertificate,
  platformsForStage: (index: number) => readonly unknown[],
): TearSnapshotV1 {
  certifyFrontierInput(certificate);
  if (stableVerificationHash(sourceSnapshot.state) !== sourceSnapshot.hashes.exact) {
    throw new TypeError("campaign reward frontier source exact hash is invalid");
  }
  const sourceRun = record(sourceSnapshot.state["tear.run.v1"], "run codec");
  const difficulty = sourceRun.difficulty ?? sourceRun.diff;
  if (sourceRun.mode !== "campaign" || difficulty !== "normal" || sourceRun.weaponId !== "sword") {
    throw new TypeError("campaign reward frontier requires a Campaign Normal Sword source");
  }
  const forged = structuredClone(sourceSnapshot);
  const mutable = forged as unknown as MutableRecord;
  mutable.id = "campaign-wave-59-reward-frontier";
  mutable.tick = certificate.statistics.elapsedTicks;
  mutable.stateClass = "reconstructed-reachable";
  mutable.lineage = Object.freeze({
    parentId: sourceSnapshot.id,
    relation: "forked-at",
    parentRootHash: sourceSnapshot.hashes.exact,
    forkTick: sourceSnapshot.tick,
  });
  mutable.provenance = Object.freeze({
    ...sourceSnapshot.provenance,
    actor: "state-forge",
    producer: "campaign-victory-origin",
    sourceId: sourceSnapshot.id,
  });

  const run = record(forged.state["tear.run.v1"], "run codec");
  const player = record(forged.state["tear.player.v1"], "player codec");
  const world = record(forged.state["tear.world.v1"], "world codec");
  const runtime = record(world.runtime, "world runtime");
  const ui = record(forged.state["tear.ui.v1"], "UI codec");
  const waveLog = historicalWaveLog(certificate);
  const finalWave = waveLog.at(-1);
  if (finalWave === undefined) throw new TypeError("campaign reward frontier history is empty");
  const sessionId = record(runtime.lifecycle, "run lifecycle").sessionId;
  if (typeof sessionId !== "string" || sessionId.length === 0) {
    throw new TypeError("campaign reward frontier requires a live source session");
  }
  const lifecycle = new RunLifecycleController();
  lifecycle.start(sessionId);
  for (let wave = 1; wave <= CAMPAIGN_VICTORY_ORIGIN_WAVE; wave += 1) {
    lifecycle.prepareWave(wave, wave % 10 === 0, false);
    lifecycle.activateWave();
    lifecycle.clearWave();
    lifecycle.prepareReward(wave % 10 === 0 ? "boss" : "draft");
  }
  const finalStageIndex = STAGES.length - 1;
  const stage = stageAt(finalStageIndex);
  Object.assign(run, {
    mode: "campaign", difficulty: "normal", diff: "normal", weaponId: "sword",
    wave: CAMPAIGN_VICTORY_ORIGIN_WAVE, stage: finalStageIndex, _biomeIdx: finalStageIndex,
    tick: certificate.statistics.elapsedTicks, score: certificate.statistics.score,
    runTime: certificate.statistics.elapsedTicks / 120,
    waveTime: finalWave.time, waveKills: finalWave.kills, wavePeak: finalWave.peak,
    waveLog, mult: certificate.statistics.style,
    spawnQueue: [], spawnTimer: 0, clearTimer: -1,
    isBossWave: false, horde: false, miniBoss: null, waveTag: "", waveKinds: [],
    bossesBeaten: certificate.ledger.events.filter((event) => event.type === "boss.defeated").length,
    bossIdx: finalStageIndex, curBoss: null, bossAdds: null, pendingBossOutro: null,
    chapterState: "WAVE_LIVE", _prologueShown: true,
  });
  Object.assign(world, { clock: certificate.statistics.elapsedTicks });
  Object.assign(runtime, {
    lifecycle: lifecycle.snapshot(), chapterBinding: null,
    stageBanner: { name: stage.name, seconds: 0 },
    cinemaProtection: { active: false, lastMode: null },
  });
  const identity = record(world.identityState, "identity allocator state");
  Object.assign(identity, { nextEntityId: 1, claimedIds: [] });
  Object.assign(player, { cinematicProtected: false, cinematicGraceT: 0 });
  ui.screen = "draft";
  const choices = certificate.finalReward.offeredIds.map(portableUpgradeChoice);
  const selectedIndex = certificate.finalReward.offeredIds.indexOf(certificate.finalReward.selectedId);
  if (selectedIndex < 0) throw new TypeError("campaign reward frontier selected choice is not offered");
  const specialCount = certificate.ledger.events.reduce((count, event) => {
    if (event.type !== "draft.offered" || event.wave < 41 || event.wave > CAMPAIGN_VICTORY_ORIGIN_WAVE) return count;
    return count + event.ids.filter((id) => UPGRADES.find((choice) => choice.id === id)?.tiers !== undefined).length;
  }, 0);
  (forged.state as MutableRecord)["tear.reward.v1"] = Object.freeze({
    selection: Object.freeze({
      phase: "complete", mode: "campaign", wave: CAMPAIGN_VICTORY_ORIGIN_WAVE,
      choices: Object.freeze(choices), reserveChoices: Object.freeze([]), reservedChoice: null,
      expandedDraft: false, reservePick: false, rerolls: 0,
      specialBlock: 4, specialsOffered: specialCount, revision: 2,
    }),
  });
  (forged.state as MutableRecord)["tear.enemy.v1"] = Object.freeze([]);
  (forged.state as MutableRecord)["tear.boss.v1"] = Object.freeze([]);
  (forged.state as MutableRecord)["tear.projectile.v1"] = Object.freeze([]);
  (forged.state as MutableRecord)["tear.platform.v1"] = Object.freeze(platformsForStage(finalStageIndex));
  (forged.state as MutableRecord)["tear.cinematic.v1"] = INACTIVE_CINEMATIC_DIRECTOR_STATE_V1;
  run.stateForgeVictoryOrigin = Object.freeze({
    certificateId: certificate.id,
    progressionHash: certificate.ledger.progressionHash,
    finalSelectedId: certificate.finalReward.selectedId,
    synchronousBoundary: "post-selection-before-start-next-wave",
    waveLogDerivation: "aggregate-seconds-kills-and-style-distributed-across-59-waves",
  });
  mutable.hashes = Object.freeze({
    ...forged.hashes,
    exact: stableVerificationHash(forged.state),
    progression: certificate.ledger.progressionHash,
    environment: stableVerificationHash(projectEnvironmentHash(forged.state["tear.hazard.v1"])),
  });
  return Object.freeze(forged);
}
