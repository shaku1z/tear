import { stableVerificationHash } from "../replay/hash";
import { describeWave } from "../gameplay/run/wave-rules";
import type { TearDifficultyId, TearRunModeId, TearWeaponId } from "./registries";

export type TearBuildSynthesisPolicy =
  | "exact-ledger" | "replay-derived" | "human-population" | "agent-population"
  | "archetype" | "optimized" | "low-roll" | "anti-synergy" | "coverage-seeking" | "corruption";

export type TearProgressionEvent =
  | Readonly<{ index: number; type: "run.setup"; mode: TearRunModeId; difficulty: TearDifficultyId }>
  | Readonly<{ index: number; type: "weapon.selected"; weapon: TearWeaponId }>
  | Readonly<{ index: number; type: "meta.applied"; id: string; value: number }>
  | Readonly<{ index: number; type: "stage.entered"; stage: number; wave: number }>
  | Readonly<{ index: number; type: "wave.started"; wave: number; boss: boolean }>
  | Readonly<{ index: number; type: "wave.cleared"; wave: number }>
  | Readonly<{ index: number; type: "draft.earned"; wave: number; slot: number }>
  | Readonly<{ index: number; type: "draft.selected"; wave: number; id: string; tier: number }>
  | Readonly<{ index: number; type: "boss.defeated"; wave: number; bossIndex: number }>
  | Readonly<{ index: number; type: "tier.earned"; wave: number; slot: number }>
  | Readonly<{ index: number; type: "tier.selected"; wave: number; id: string; tier: number }>
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
  }>;
  readonly configurationHash: string;
  readonly explanation?: string;
  readonly nearestReachable?: readonly TearBuildSelection[];
}

function positiveWave(wave: number): void {
  if (!Number.isSafeInteger(wave) || wave < 1 || wave > 10_000) {
    throw new RangeError("targetWave must be an integer from 1 through 10000");
  }
}

function eventBuilder() {
  const events: TearProgressionEvent[] = [];
  type EventWithoutIndex<T> = T extends unknown ? Omit<T, "index"> : never;
  return {
    add(event: EventWithoutIndex<TearProgressionEvent>): void {
      events.push(Object.freeze({ ...event, index: events.length }));
    },
    events,
  };
}

export function buildCanonicalProgressionLedger(request: TearProgressionRequest): TearProgressionLedger {
  positiveWave(request.targetWave);
  const builder = eventBuilder();
  builder.add({ type: "run.setup", mode: request.mode, difficulty: request.difficulty });
  builder.add({ type: "weapon.selected", weapon: request.weapon });
  for (const [id, value] of Object.entries(request.meta ?? {}).sort(([left], [right]) => left.localeCompare(right))) {
    if (!Number.isFinite(value)) throw new TypeError(`meta value ${id} must be finite`);
    builder.add({ type: "meta.applied", id, value });
  }

  let previousStage = -1;
  let draftOpportunities = 0;
  let tierOpportunities = 0;
  for (let wave = 1; wave <= request.targetWave; wave += 1) {
    const description = describeWave({
      mode: request.mode,
      wave,
      configuredWaves: request.configuredCampaignWaves ?? 50,
    });
    const stage = description.campaignStage ?? description.endlessBiome ?? 0;
    if (stage !== previousStage) {
      builder.add({ type: "stage.entered", stage, wave });
      previousStage = stage;
    }
    builder.add({ type: "wave.started", wave, boss: description.bossWave || description.miniBossWave });
    builder.add({ type: "wave.cleared", wave });
    if (description.bossWave || description.miniBossWave) {
      builder.add({ type: "boss.defeated", wave, bossIndex: tierOpportunities });
      builder.add({ type: "tier.earned", wave, slot: tierOpportunities });
      tierOpportunities += 1;
    } else {
      builder.add({ type: "draft.earned", wave, slot: draftOpportunities });
      draftOpportunities += 1;
    }
    builder.add({ type: "reward.granted", wave, currency: Math.max(1, Math.floor(wave / 2)) });
  }
  builder.add({ type: "run.completed", wave: request.targetWave });
  const events = Object.freeze(builder.events);
  return Object.freeze({
    format: "tear-progression-ledger",
    schemaVersion: 1,
    events,
    targetWave: request.targetWave,
    draftOpportunities,
    tierOpportunities,
    progressionHash: stableVerificationHash(events),
  });
}

function legalSelections(
  requested: readonly TearBuildSelection[],
  opportunities: number,
): Readonly<{ reachable: boolean; accepted: readonly TearBuildSelection[]; explanation?: string }> {
  const accepted: TearBuildSelection[] = [];
  const unique = new Set<string>();
  for (const selection of requested) {
    if (!Number.isSafeInteger(selection.tier) || selection.tier < 1 || selection.tier > 5) {
      return { reachable: false, accepted, explanation: `${selection.id} requests illegal tier ${String(selection.tier)}; legal tiers are 1-5` };
    }
    if (selection.unique === true && unique.has(selection.id)) {
      return { reachable: false, accepted, explanation: `${selection.id} is unique and cannot be selected twice` };
    }
    if (selection.unique === true) unique.add(selection.id);
    const cost = selection.tier;
    if (accepted.reduce((sum, entry) => sum + entry.tier, 0) + cost > opportunities) {
      return {
        reachable: false,
        accepted,
        explanation: `build costs more selections than the ${String(opportunities)} earned opportunities`,
      };
    }
    accepted.push(Object.freeze({ ...selection }));
  }
  return { reachable: true, accepted: Object.freeze(accepted) };
}

export function synthesizeProgression(request: TearProgressionRequest): TearSynthesizedProgression {
  const canonicalLedger = buildCanonicalProgressionLedger(request);
  const selections = request.selections ?? [];
  const legality = legalSelections(selections, canonicalLedger.draftOpportunities + canonicalLedger.tierOpportunities);
  const completion = canonicalLedger.events.at(-1);
  const withoutCompletion = completion?.type === "run.completed"
    ? canonicalLedger.events.slice(0, -1)
    : canonicalLedger.events;
  const selectionEvents: TearProgressionEvent[] = legality.accepted.map((selection, offset) => Object.freeze({
    index: withoutCompletion.length + offset,
    type: "draft.selected",
    wave: request.targetWave,
    id: selection.id,
    tier: selection.tier,
  }));
  const events = Object.freeze([
    ...withoutCompletion,
    ...selectionEvents,
    Object.freeze({
      index: withoutCompletion.length + selectionEvents.length,
      type: "run.completed" as const,
      wave: request.targetWave,
    }),
  ]);
  const ledger: TearProgressionLedger = Object.freeze({
    ...canonicalLedger,
    events,
    progressionHash: stableVerificationHash(events),
  });
  const build = Object.freeze(Object.fromEntries(
    legality.accepted.map((selection) => [selection.id, selection.tier]),
  ));
  const bossCount = ledger.events.filter((event) => event.type === "boss.defeated").length;
  const currency = ledger.events.reduce((sum, event) => sum + (event.type === "reward.granted" ? event.currency : 0), 0);
  const statistics = Object.freeze({
    hp: 100,
    maxHp: 100,
    elapsedTicks: request.targetWave * 3_600,
    score: request.targetWave * 1_000 + bossCount * 5_000,
    style: Math.min(5, 1 + Math.floor(request.targetWave / 10)),
    kills: request.targetWave * 6 + bossCount,
    currency,
    revives: 0,
  });
  const configurationHash = stableVerificationHash({
    mode: request.mode,
    difficulty: request.difficulty,
    weapon: request.weapon,
    meta: request.meta ?? {},
    build,
  });
  return Object.freeze({
    ledger,
    reachable: legality.reachable,
    policy: request.policy,
    provisionalPopulationData: request.policy === "human-population" || request.policy === "agent-population",
    build,
    statistics,
    configurationHash,
    ...(legality.explanation === undefined ? {} : {
      explanation: legality.explanation,
      nearestReachable: legality.accepted,
    }),
  });
}

export function reconstructProgression(
  ledger: TearProgressionLedger,
): Readonly<{ progressionHash: string; build: Readonly<Record<string, number>>; configurationHash: string }> {
  const setup = ledger.events.find((event) => event.type === "run.setup");
  const weapon = ledger.events.find((event) => event.type === "weapon.selected");
  if (setup?.type !== "run.setup" || weapon?.type !== "weapon.selected") {
    throw new TypeError("ledger is missing canonical run setup or weapon selection");
  }
  const selections = ledger.events.filter(
    (event): event is Extract<TearProgressionEvent, { type: "draft.selected" | "tier.selected" }> =>
      event.type === "draft.selected" || event.type === "tier.selected",
  );
  const build = Object.freeze(Object.fromEntries(selections.map((event) => [event.id, event.tier])));
  const meta = Object.fromEntries(ledger.events.filter(
    (event): event is Extract<TearProgressionEvent, { type: "meta.applied" }> => event.type === "meta.applied",
  ).map((event) => [event.id, event.value]));
  return Object.freeze({
    progressionHash: stableVerificationHash(ledger.events),
    build,
    configurationHash: stableVerificationHash({
      mode: setup.mode, difficulty: setup.difficulty, weapon: weapon.weapon, meta, build,
    }),
  });
}
