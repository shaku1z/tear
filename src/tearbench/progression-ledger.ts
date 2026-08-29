import type { UpgradeDefinition } from "../gameplay/upgrades";
import { DIFFICULTY_CATALOG } from "../gameplay/run/difficulty-catalog";
import { describeWave } from "../gameplay/run/wave-rules";
import { calculateCoinAward } from "../gameplay/scoring/coin-awards";
import { stableVerificationHash } from "../replay/hash";
import { CAMPAIGN_STAGE_IDS } from "../gameplay/stages";
import type { TearDifficultyId, TearRunModeId, TearWeaponId } from "./registries";
import {
  draftCandidates,
  maximumUpgradeTier,
  PRODUCTION_CONFIGURATION_REVISION,
  PRODUCTION_UPGRADE_BY_ID,
  tierCandidates,
  type ProgressionDesiredBuild,
  type ProgressionMutableBuild,
} from "./progression-synthesis-policy";

export type TearBuildSynthesisPolicy =
  | "exact-ledger" | "replay-derived" | "human-population" | "agent-population"
  | "archetype" | "optimized" | "low-roll" | "anti-synergy" | "coverage-seeking" | "corruption";

export type TearProgressionEvent =
  | Readonly<{ index: number; type: "configuration.reset"; revision: string }>
  | Readonly<{ index: number; type: "run.setup"; mode: TearRunModeId; difficulty: TearDifficultyId }>
  | Readonly<{ index: number; type: "weapon.selected"; weapon: TearWeaponId }>
  | Readonly<{ index: number; type: "meta.applied"; id: string; value: number }>
  | Readonly<{ index: number; type: "stage.entered"; stage: number; wave: number }>
  | Readonly<{ index: number; type: "wave.started"; wave: number; boss: boolean }>
  | Readonly<{ index: number; type: "wave.cleared"; wave: number }>
  | Readonly<{ index: number; type: "draft.earned"; wave: number; slot: number }>
  | Readonly<{ index: number; type: "draft.offered"; wave: number; slot: number; ids: readonly string[] }>
  | Readonly<{ index: number; type: "draft.selected"; wave: number; id: string; tier: number }>
  | Readonly<{ index: number; type: "boss.defeated"; wave: number; bossIndex: number }>
  | Readonly<{ index: number; type: "tier.earned"; wave: number; slot: number }>
  | Readonly<{ index: number; type: "tier.offered"; wave: number; slot: number; ids: readonly string[] }>
  | Readonly<{ index: number; type: "tier.selected"; wave: number; id: string; tier: number }>
  | Readonly<{
    index: number; type: "configuration.mutated"; wave: number; source: "draft" | "tier";
    id: string; occurrence: number; tier: number;
  }>
  | Readonly<{ index: number; type: "reward.granted"; wave: number; currency: number }>
  | Readonly<{ index: number; type: "player.revived"; wave: number; hp: number }>
  | Readonly<{ index: number; type: "run.completed"; wave: number }>;

export interface TearProgressionLedger {
  readonly format: "tear-progression-ledger";
  readonly schemaVersion: 1;
  readonly events: readonly TearProgressionEvent[];
  readonly targetWave: number;
  readonly draftOpportunities: number;
  readonly tierOpportunities: number;
  readonly progressionHash: string;
}

export interface TearBuildSelection {
  readonly id: string;
  /**
   * Repeatable upgrades use this as the desired owned count. Unique tiered
   * abilities use it as the desired final production tier.
   */
  readonly tier: number;
  readonly unique?: boolean;
}

export interface TearProgressionRequest {
  readonly mode: TearRunModeId;
  readonly difficulty: TearDifficultyId;
  readonly weapon: TearWeaponId;
  readonly targetWave: number;
  readonly configuredCampaignWaves?: number;
  readonly meta?: Readonly<Record<string, number>>;
  readonly economy?: Readonly<{
    readonly score?: number;
    readonly remoteMultiplier?: number;
    readonly coinMagnetLevel?: number;
    readonly fortuneLevel?: number;
  }>;
  readonly selections?: readonly TearBuildSelection[];
  readonly policy: TearBuildSynthesisPolicy;
}

export interface TearSynthesizedProgression {
  readonly ledger: TearProgressionLedger;
  readonly reachable: boolean;
  readonly policy: TearBuildSynthesisPolicy;
  readonly provisionalPopulationData: boolean;
  readonly build: Readonly<Record<string, number>>;
  readonly statistics: Readonly<{
    hp: number; maxHp: number; elapsedTicks: number; score: number; style: number;
    kills: number; currency: number; revives: number;
    /** Currency/revives are ledger-owned; combat and timing are synthetic estimates, never release evidence. */
    estimatedFields: readonly ("hp" | "maxHp" | "elapsedTicks" | "score" | "style" | "kills")[];
  }>;
  readonly configurationHash: string;
  readonly explanation?: string;
  readonly nearestReachable?: readonly TearBuildSelection[];
}

type EventWithoutIndex<T> = T extends unknown ? Omit<T, "index"> : never;

function positiveWave(wave: number): void {
  if (!Number.isSafeInteger(wave) || wave < 1 || wave > 10_000) {
    throw new RangeError("targetWave must be an integer from 1 through 10000");
  }
}

function eventBuilder() {
  const events: TearProgressionEvent[] = [];
  return {
    add(event: EventWithoutIndex<TearProgressionEvent>): void {
      events.push(Object.freeze({ ...event, index: events.length }));
    },
    events,
  };
}

function setupEvents(request: TearProgressionRequest, builder: ReturnType<typeof eventBuilder>): void {
  builder.add({ type: "configuration.reset", revision: PRODUCTION_CONFIGURATION_REVISION });
  builder.add({ type: "run.setup", mode: request.mode, difficulty: request.difficulty });
  builder.add({ type: "weapon.selected", weapon: request.weapon });
  for (const [id, value] of Object.entries(request.meta ?? {}).sort(([left], [right]) => left.localeCompare(right))) {
    if (!Number.isFinite(value)) throw new TypeError(`meta value ${id} must be finite`);
    builder.add({ type: "meta.applied", id, value });
  }
}

function freezeLedger(
  events: readonly TearProgressionEvent[],
  targetWave: number,
  draftOpportunities: number,
  tierOpportunities: number,
): TearProgressionLedger {
  const immutableEvents = Object.freeze([...events]);
  return Object.freeze({
    format: "tear-progression-ledger",
    schemaVersion: 1,
    events: immutableEvents,
    targetWave,
    draftOpportunities,
    tierOpportunities,
    progressionHash: stableVerificationHash(immutableEvents),
  });
}

function economyInputs(request: TearProgressionRequest) {
  const difficulty = DIFFICULTY_CATALOG.find((candidate) => candidate.id === request.difficulty);
  if (difficulty === undefined) throw new RangeError(`unknown production difficulty ${request.difficulty}`);
  const economy = request.economy ?? {};
  const finite = (value: number | undefined, fallback: number, label: string): number => {
    if (value === undefined) return fallback;
    if (!Number.isFinite(value) || value < 0) throw new RangeError(`${label} must be a finite non-negative number`);
    return value;
  };
  return Object.freeze({
    difficultyId: difficulty.id,
    baseDifficultyMultiplier: difficulty.modifiers.coinReward,
    score: finite(economy.score, 0, "economy.score"),
    remoteMultiplier: finite(economy.remoteMultiplier, 1, "economy.remoteMultiplier"),
    coinMagnetLevel: finite(economy.coinMagnetLevel, 0, "economy.coinMagnetLevel"),
    fortuneLevel: finite(economy.fortuneLevel, 0, "economy.fortuneLevel"),
  });
}

/**
 * Enumerates the production wave scheduler's potential reward points. Actual
 * boss rewards are resolved by synthesis because production falls back to a
 * draft whenever the current build has no eligible tier-up.
 */
export function buildCanonicalProgressionLedger(request: TearProgressionRequest): TearProgressionLedger {
  positiveWave(request.targetWave);
  const economy = economyInputs(request);
  const builder = eventBuilder();
  setupEvents(request, builder);
  let previousStage = -1;
  let draftOpportunities = 0;
  let tierOpportunities = 0;
  for (let wave = 1; wave <= request.targetWave; wave += 1) {
    const description = describeWave({
      mode: request.mode,
      wave,
      configuredWaves: request.configuredCampaignWaves ?? CAMPAIGN_STAGE_IDS.length * 10,
    });
    const stage = description.campaignStage ?? description.endlessBiome ?? 0;
    if (stage !== previousStage) {
      builder.add({ type: "stage.entered", stage, wave });
      previousStage = stage;
    }
    const boss = description.bossWave || description.miniBossWave;
    builder.add({ type: "wave.started", wave, boss });
    builder.add({ type: "wave.cleared", wave });
    if (boss) {
      builder.add({ type: "boss.defeated", wave, bossIndex: tierOpportunities });
      builder.add({ type: "tier.earned", wave, slot: tierOpportunities });
      tierOpportunities += 1;
    } else {
      builder.add({ type: "draft.earned", wave, slot: draftOpportunities });
      draftOpportunities += 1;
    }
    builder.add({ type: "reward.granted", wave, currency: rewardCurrency(wave, economy) });
  }
  builder.add({ type: "run.completed", wave: request.targetWave });
  return freezeLedger(builder.events, request.targetWave, draftOpportunities, tierOpportunities);
}

function desiredBuild(requested: readonly TearBuildSelection[]): ProgressionDesiredBuild {
  const counts: Record<string, number> = {};
  const tiers: Record<string, number> = {};
  const accepted: TearBuildSelection[] = [];
  const issues: string[] = [];
  const requestedUnique = new Set<string>();
  for (const selection of requested) {
    const upgrade = PRODUCTION_UPGRADE_BY_ID.get(selection.id);
    if (upgrade === undefined) {
      issues.push(`unknown production upgrade ${selection.id}`);
      continue;
    }
    if (!Number.isSafeInteger(selection.tier) || selection.tier < 1) {
      issues.push(`${selection.id} requests illegal tier/count ${String(selection.tier)}`);
      continue;
    }
    if ((upgrade.unique || selection.unique === true) && requestedUnique.has(selection.id)) {
      issues.push(`${selection.id} is unique and cannot be requested twice`);
      continue;
    }
    if (upgrade.unique || selection.unique === true) requestedUnique.add(selection.id);
    if (upgrade.tiers !== undefined) {
      const maximum = maximumUpgradeTier(upgrade);
      if (selection.tier > maximum) {
        issues.push(`${selection.id} requests tier ${String(selection.tier)}; maximum production tier is ${String(maximum)}`);
        continue;
      }
      counts[selection.id] = 1;
      tiers[selection.id] = selection.tier;
    } else {
      const previous = counts[selection.id] ?? 0;
      const next = previous + selection.tier;
      if (upgrade.unique && next > 1) {
        issues.push(`${selection.id} is unique and cannot be selected ${String(next)} times`);
        continue;
      }
      if (upgrade.maxStacks !== undefined && next > upgrade.maxStacks) {
        issues.push(`${selection.id} exceeds its production stack cap of ${String(upgrade.maxStacks)}`);
        continue;
      }
      counts[selection.id] = next;
      tiers[selection.id] = 1;
    }
    accepted.push(Object.freeze({ id: selection.id, tier: selection.tier, ...(upgrade.unique ? { unique: true } : {}) }));
  }
  return Object.freeze({
    counts: Object.freeze(counts),
    tiers: Object.freeze(tiers),
    accepted: Object.freeze(accepted),
    issues: Object.freeze(issues),
  });
}

function applyDraft(build: ProgressionMutableBuild, upgrade: UpgradeDefinition): number {
  const before = build.owned[upgrade.id] ?? 0;
  build.owned[upgrade.id] = before + 1;
  build.tiers[upgrade.id] ??= 1;
  build.ownedOrder.push(upgrade.id);
  return before + 1;
}

function buildSnapshot(build: ProgressionMutableBuild): Readonly<Record<string, number>> {
  const entries = Object.keys(build.owned).sort().map((id) => {
    const upgrade = PRODUCTION_UPGRADE_BY_ID.get(id);
    return [id, upgrade?.tiers === undefined ? build.owned[id] ?? 0 : build.tiers[id] ?? 1] as const;
  });
  return Object.freeze(Object.fromEntries(entries));
}

function rewardCurrency(wave: number, inputs: ReturnType<typeof economyInputs>): number {
  return calculateCoinAward({
    score: inputs.score, wave, difficultyId: inputs.difficultyId,
    baseDifficultyMultiplier: inputs.baseDifficultyMultiplier, remoteMultiplier: inputs.remoteMultiplier,
    coinMagnetLevel: inputs.coinMagnetLevel, fortuneLevel: inputs.fortuneLevel,
  }).earned;
}

function requestedReachability(
  desired: ProgressionDesiredBuild,
  build: ProgressionMutableBuild,
): readonly TearBuildSelection[] {
  return Object.freeze(desired.accepted.flatMap((selection) => {
    const upgrade = PRODUCTION_UPGRADE_BY_ID.get(selection.id);
    if (upgrade === undefined) return [];
    const achieved = upgrade.tiers === undefined
      ? Math.min(selection.tier, build.owned[selection.id] ?? 0)
      : Math.min(selection.tier, build.tiers[selection.id] ?? 0);
    return achieved < 1 ? [] : [Object.freeze({ id: selection.id, tier: achieved, ...(upgrade.unique ? { unique: true } : {}) })];
  }));
}

function desiredIssues(
  desired: ProgressionDesiredBuild,
  build: ProgressionMutableBuild,
): readonly string[] {
  const issues = [...desired.issues];
  for (const [id, count] of Object.entries(desired.counts)) {
    const actual = build.owned[id] ?? 0;
    if (actual < count) issues.push(`${id} requires ${String(count)} draft pick(s), but only ${String(actual)} were reachable`);
  }
  for (const [id, tier] of Object.entries(desired.tiers)) {
    const actual = build.tiers[id] ?? 0;
    if (actual < tier) issues.push(`${id} requires tier ${String(tier)}, but only tier ${String(actual)} was reachable`);
  }
  if (desired.accepted.length > 0 && Object.values(desired.counts).reduce((sum, count) => sum + count, 0) > 0
    && Object.keys(build.owned).length === 0) {
    issues.push("the target has no earned draft opportunities");
  }
  return Object.freeze(issues);
}

function configurationHash(events: readonly TearProgressionEvent[]): string {
  return stableVerificationHash(events.filter((event) =>
    event.type === "configuration.reset"
    || event.type === "run.setup"
    || event.type === "weapon.selected"
    || event.type === "meta.applied"
    || event.type === "configuration.mutated"));
}

function progressionStatistics(
  request: TearProgressionRequest,
  ledger: TearProgressionLedger,
  build: Readonly<Record<string, number>>,
): TearSynthesizedProgression["statistics"] {
  const bossCount = ledger.events.filter((event) => event.type === "boss.defeated").length;
  const currency = ledger.events.reduce((sum, event) => sum + (event.type === "reward.granted" ? event.currency : 0), 0);
  const vitality = build.vitality ?? 0;
  const maxHp = 100 + vitality * 30;
  const difficultyPace = request.difficulty === "extreme" ? 1.3 : request.difficulty === "hard" ? 1.15 : 1;
  const policyPace = request.policy === "low-roll" || request.policy === "anti-synergy" ? 1.18 : 1;
  const elapsedTicks = Math.round(request.targetWave * 3_600 * difficultyPace * policyPace);
  const kills = request.targetWave * 6 + bossCount;
  const style = Math.min(5, 1 + Math.floor((build.offense ?? 0) / 2) + Math.floor(request.targetWave / 25));
  const score = Math.round(kills * 125 * style + bossCount * 5_000);
  const healthRatio = request.policy === "low-roll" ? 0.35
    : request.policy === "anti-synergy" ? 0.5
      : request.policy === "human-population" ? 0.68 : 1;
  return Object.freeze({
    hp: Math.max(1, Math.round(maxHp * healthRatio)),
    maxHp,
    elapsedTicks,
    score,
    style,
    kills,
    currency,
    revives: ledger.events.filter((event) => event.type === "player.revived").length,
    estimatedFields: Object.freeze(["hp", "maxHp", "elapsedTicks", "score", "style", "kills"] as const),
  });
}

export function synthesizeProgression(request: TearProgressionRequest): TearSynthesizedProgression {
  positiveWave(request.targetWave);
  const economy = economyInputs(request);
  const desired = desiredBuild(request.selections ?? []);
  const builder = eventBuilder();
  setupEvents(request, builder);
  const build: ProgressionMutableBuild = { owned: {}, tiers: {}, ownedOrder: [] };
  let previousStage = -1;
  let draftOpportunities = 0;
  let tierOpportunities = 0;
  let bossIndex = 0;

  for (let wave = 1; wave <= request.targetWave; wave += 1) {
    const description = describeWave({
      mode: request.mode,
      wave,
      configuredWaves: request.configuredCampaignWaves ?? CAMPAIGN_STAGE_IDS.length * 10,
    });
    const stage = description.campaignStage ?? description.endlessBiome ?? 0;
    if (stage !== previousStage) {
      builder.add({ type: "stage.entered", stage, wave });
      previousStage = stage;
    }
    const boss = description.bossWave || description.miniBossWave;
    builder.add({ type: "wave.started", wave, boss });
    builder.add({ type: "wave.cleared", wave });
    if (boss) {
      builder.add({ type: "boss.defeated", wave, bossIndex });
      bossIndex += 1;
    }

    const tiers = boss ? tierCandidates(build, desired) : [];
    const tierChoice = tiers[0];
    if (tierChoice !== undefined) {
      const slot = tierOpportunities;
      tierOpportunities += 1;
      builder.add({ type: "tier.earned", wave, slot });
      builder.add({ type: "tier.offered", wave, slot, ids: Object.freeze(tiers.slice(0, 4).map((upgrade) => upgrade.id)) });
      const tier = (build.tiers[tierChoice.id] ?? 1) + 1;
      build.tiers[tierChoice.id] = tier;
      builder.add({ type: "tier.selected", wave, id: tierChoice.id, tier });
      builder.add({
        type: "configuration.mutated", wave, source: "tier", id: tierChoice.id,
        occurrence: build.owned[tierChoice.id] ?? 1, tier,
      });
    } else {
      const candidates = draftCandidates(request, build, desired, wave);
      const choice = candidates[0];
      if (choice === undefined) throw new RangeError(`production upgrade catalogue exhausted at wave ${String(wave)}`);
      const slot = draftOpportunities;
      draftOpportunities += 1;
      builder.add({ type: "draft.earned", wave, slot });
      builder.add({ type: "draft.offered", wave, slot, ids: Object.freeze(candidates.slice(0, 3).map((upgrade) => upgrade.id)) });
      const occurrence = applyDraft(build, choice);
      builder.add({ type: "draft.selected", wave, id: choice.id, tier: build.tiers[choice.id] ?? 1 });
      builder.add({
        type: "configuration.mutated", wave, source: "draft", id: choice.id,
        occurrence, tier: build.tiers[choice.id] ?? 1,
      });
    }
    builder.add({ type: "reward.granted", wave, currency: rewardCurrency(wave, economy) });
  }
  builder.add({ type: "run.completed", wave: request.targetWave });

  const ledger = freezeLedger(builder.events, request.targetWave, draftOpportunities, tierOpportunities);
  const immutableBuild = buildSnapshot(build);
  const issues = [...desiredIssues(desired, build)];
  if (request.policy === "corruption") {
    issues.push("corruption synthesis is deliberately classified as unreachable and must not enter balance evidence");
  }
  const nearestReachable = requestedReachability(desired, build);
  return Object.freeze({
    ledger,
    reachable: issues.length === 0,
    policy: request.policy,
    provisionalPopulationData: request.policy === "human-population" || request.policy === "agent-population",
    build: immutableBuild,
    statistics: progressionStatistics(request, ledger, immutableBuild),
    configurationHash: configurationHash(ledger.events),
    ...(issues.length === 0 ? {} : {
      explanation: issues.join("; "),
      nearestReachable,
    }),
  });
}

export function reconstructProgression(
  ledger: TearProgressionLedger,
): Readonly<{ progressionHash: string; build: Readonly<Record<string, number>>; configurationHash: string }> {
  const setup = ledger.events.find((event) => event.type === "run.setup");
  const weapon = ledger.events.find((event) => event.type === "weapon.selected");
  const reset = ledger.events.find((event) => event.type === "configuration.reset");
  if (setup?.type !== "run.setup" || weapon?.type !== "weapon.selected" || reset?.type !== "configuration.reset") {
    throw new TypeError("ledger is missing canonical configuration reset, run setup, or weapon selection");
  }
  if (!ledger.events.every((event, index) => event.index === index)) {
    throw new TypeError("ledger event indices are not contiguous and canonical");
  }
  const actualProgressionHash = stableVerificationHash(ledger.events);
  if (actualProgressionHash !== ledger.progressionHash) {
    throw new TypeError("ledger progression hash does not match its ordered events");
  }
  const build: ProgressionMutableBuild = { owned: {}, tiers: {}, ownedOrder: [] };
  let pendingMutation: Readonly<{
    source: "draft" | "tier"; id: string; occurrence: number; tier: number;
  }> | null = null;
  for (const event of ledger.events) {
    if (pendingMutation !== null && event.type !== "configuration.mutated") {
      throw new TypeError(`ledger omits the ordered configuration mutation for ${pendingMutation.id}`);
    }
    if (event.type === "draft.selected") {
      const upgrade = PRODUCTION_UPGRADE_BY_ID.get(event.id);
      if (upgrade === undefined) throw new TypeError(`ledger selects unknown production upgrade ${event.id}`);
      if (upgrade.unique && (build.owned[event.id] ?? 0) > 0) throw new TypeError(`ledger selects unique upgrade ${event.id} twice`);
      const occurrence = applyDraft(build, upgrade);
      pendingMutation = Object.freeze({
        source: "draft", id: event.id, occurrence, tier: build.tiers[event.id] ?? 1,
      });
    } else if (event.type === "tier.selected") {
      const upgrade = PRODUCTION_UPGRADE_BY_ID.get(event.id);
      const current = build.tiers[event.id] ?? 0;
      if (upgrade?.tiers === undefined || current < 1
        || event.tier !== current + 1 || event.tier > maximumUpgradeTier(upgrade)) {
        throw new TypeError(`ledger contains illegal tier transition for ${event.id}`);
      }
      build.tiers[event.id] = event.tier;
      pendingMutation = Object.freeze({
        source: "tier", id: event.id, occurrence: build.owned[event.id] ?? 1, tier: event.tier,
      });
    } else if (event.type === "configuration.mutated") {
      if (pendingMutation === null) {
        throw new TypeError(`ledger contains an out-of-order configuration mutation for ${event.id}`);
      }
      if (event.source !== pendingMutation.source
        || event.id !== pendingMutation.id
        || event.occurrence !== pendingMutation.occurrence
        || event.tier !== pendingMutation.tier) {
        throw new TypeError(`ledger contains an out-of-order configuration mutation for ${event.id}`);
      }
      pendingMutation = null;
    }
  }
  if (pendingMutation !== null) throw new TypeError(`ledger omits the ordered configuration mutation for ${pendingMutation.id}`);
  const earnedDrafts = ledger.events.filter((event) => event.type === "draft.earned").length;
  const earnedTiers = ledger.events.filter((event) => event.type === "tier.earned").length;
  if (earnedDrafts !== ledger.draftOpportunities || earnedTiers !== ledger.tierOpportunities) {
    throw new TypeError("ledger opportunity totals do not match its earned reward events");
  }
  const immutableBuild = buildSnapshot(build);
  return Object.freeze({
    progressionHash: actualProgressionHash,
    build: immutableBuild,
    configurationHash: configurationHash(ledger.events),
  });
}
