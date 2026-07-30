import type { ScreenAction } from "../presentation/screens/contracts";
import type { RunResultInfo } from "../gameplay/run/outcome-planner";

export const C24_LONGITUDINAL_POLICY = Object.freeze({
  id: "c24-credible-cheap-v1",
  maxEpisodes: 24,
  maxSpend: 18_000,
  targets: Object.freeze([
    { id: "tough", level: 1 },
    { id: "sharp", level: 1 },
    { id: "thickskin", level: 1 },
    { id: "lifeline", level: 1 },
    { id: "tough", level: 2 },
    { id: "sharp", level: 2 },
    { id: "thickskin", level: 2 },
    { id: "lifeline", level: 2 },
    { id: "warding", level: 1 },
    { id: "warding", level: 2 },
    { id: "tough", level: 3 },
    { id: "sharp", level: 3 },
    { id: "aircharge", level: 1 },
    { id: "phoenix", level: 1 },
  ]),
} as const);

export interface LongitudinalProgressionObservation {
  readonly wallet: number;
  readonly lifetimeEarned: number;
  readonly levels: Readonly<Record<string, number>>;
  readonly shop: readonly Readonly<{
    id: string;
    level: number;
    maxLevel: number;
    cost: number;
    enabled: boolean;
  }>[];
}

export interface LongitudinalPolicy {
  readonly id: string;
  readonly maxEpisodes: number;
  readonly maxSpend: number;
  readonly targets: readonly Readonly<{ id: string; level: number }>[];
}

export interface LongitudinalPurchasePlan {
  readonly id: string;
  readonly levelBefore: number;
  readonly levelAfter: number;
  readonly cost: number;
}

export interface LongitudinalPurchaseRecord extends LongitudinalPurchasePlan {
  readonly episode: number;
  readonly walletBefore: number;
  readonly walletAfter: number;
  readonly lifetimeEarned: number;
}

export interface LongitudinalEpisodeRecord {
  readonly episode: number;
  readonly seed: number;
  readonly outcome: "defeat" | "victory";
  readonly wave: number;
  readonly score: number;
  readonly coinsEarned: number;
  readonly walletBefore: number;
  readonly walletAfter: number;
  readonly levelsBefore: Readonly<Record<string, number>>;
  readonly levelsAfter: Readonly<Record<string, number>>;
}

export interface LongitudinalJourneySnapshot {
  readonly label: "longitudinal-earned-profile";
  readonly policyId: string;
  readonly maxEpisodes: number;
  readonly maxSpend: number;
  readonly spent: number;
  readonly currentEpisode: number;
  readonly currentSeed: number;
  readonly episodes: readonly LongitudinalEpisodeRecord[];
  readonly purchases: readonly LongitudinalPurchaseRecord[];
  readonly frozenCombatLevels?: Readonly<Record<string, number>>;
  readonly terminalReason?: string;
}

export type LongitudinalDirective =
  | Readonly<{ type: "none" }>
  | Readonly<{ type: "activate"; action: ScreenAction }>
  | Readonly<{ type: "begin-episode"; seed: number }>
  | Readonly<{ type: "complete" }>
  | Readonly<{ type: "fail"; reason: string }>;

const COMBAT_LEVEL_IDS = Object.freeze([
  "warding", "phoenix", "aircharge", "lifeline", "thickskin", "tough", "sharp",
] as const);

function immutableLevels(levels: Readonly<Record<string, number>>): Readonly<Record<string, number>> {
  return Object.freeze({ ...levels });
}

export function freezeC24CombatLevels(
  levels: Readonly<Record<string, number>>,
): Readonly<Record<string, number>> {
  return Object.freeze(Object.fromEntries(COMBAT_LEVEL_IDS.map((id) => [id, levels[id] ?? 0])));
}

export function planLongitudinalPurchase(
  observation: LongitudinalProgressionObservation,
  spent: number,
  policy: LongitudinalPolicy = C24_LONGITUDINAL_POLICY,
): LongitudinalPurchasePlan | null {
  for (const target of policy.targets) {
    const current = observation.levels[target.id] ?? 0;
    if (current >= target.level) continue;
    const item = observation.shop.find((candidate) => candidate.id === target.id);
    if (item?.level !== current || !item.enabled) return null;
    if (item.cost > observation.wallet || spent + item.cost > policy.maxSpend) return null;
    return Object.freeze({
      id: target.id,
      levelBefore: current,
      levelAfter: current + 1,
      cost: item.cost,
    });
  }
  return null;
}

type Phase = "run" | "return-menu" | "shop" | "start-next" | "victory-menu" | "terminal";

/** Pure Journey Director. It emits typed UI actions and never owns persistence or currency mutation. */
export class C24LongitudinalJourneyDirector {
  readonly #baseSeed: number;
  readonly #policy: LongitudinalPolicy;
  #phase: Phase = "run";
  #currentEpisode = 1;
  #currentSeed: number;
  #episodeWalletBefore: number;
  #episodeLevelsBefore: Readonly<Record<string, number>>;
  #spent = 0;
  #episodes: LongitudinalEpisodeRecord[] = [];
  #purchases: LongitudinalPurchaseRecord[] = [];
  #pendingPurchase: LongitudinalPurchasePlan | null = null;
  #pendingWallet = 0;
  #frozenCombatLevels?: Readonly<Record<string, number>>;
  #terminalReason?: string;

  constructor(
    baseSeed: number,
    initial: LongitudinalProgressionObservation,
    policy: LongitudinalPolicy = C24_LONGITUDINAL_POLICY,
  ) {
    if (!Number.isSafeInteger(baseSeed) || baseSeed < 1) throw new RangeError("base seed must be positive");
    if (!Number.isSafeInteger(policy.maxEpisodes) || policy.maxEpisodes < 1) {
      throw new RangeError("longitudinal episode ceiling must be positive");
    }
    if (!Number.isFinite(policy.maxSpend) || policy.maxSpend < 0) {
      throw new RangeError("longitudinal spend ceiling must be non-negative");
    }
    this.#baseSeed = baseSeed;
    this.#currentSeed = baseSeed;
    this.#policy = policy;
    this.#episodeWalletBefore = initial.wallet;
    this.#episodeLevelsBefore = immutableLevels(initial.levels);
  }

  seed(): number { return this.#currentSeed; }

  step(
    screen: string,
    outcome: RunResultInfo | null,
    progression: LongitudinalProgressionObservation,
  ): LongitudinalDirective {
    this.#confirmPendingPurchase(progression);
    if (this.#terminalReason !== undefined) return { type: "fail", reason: this.#terminalReason };
    if ((screen === "gameover" || screen === "win") && this.#phase === "run") {
      if (outcome === null) return this.#fail("terminal-outcome-missing");
      this.#episodes.push(Object.freeze({
        episode: this.#currentEpisode,
        seed: this.#currentSeed,
        outcome: screen === "win" ? "victory" : "defeat",
        wave: outcome.wave,
        score: outcome.score,
        coinsEarned: outcome.earned,
        walletBefore: this.#episodeWalletBefore,
        walletAfter: progression.wallet,
        levelsBefore: this.#episodeLevelsBefore,
        levelsAfter: immutableLevels(progression.levels),
      }));
      if (screen === "win") {
        this.#frozenCombatLevels = freezeC24CombatLevels(progression.levels);
        this.#phase = "victory-menu";
        return { type: "activate", action: { type: "navigate", to: "menu" } };
      }
      if (this.#currentEpisode >= this.#policy.maxEpisodes) {
        this.#frozenCombatLevels = freezeC24CombatLevels(progression.levels);
        return this.#fail("longitudinal-episode-ceiling");
      }
      this.#phase = "return-menu";
      return { type: "activate", action: { type: "navigate", to: "menu" } };
    }
    if (screen === "menu" && this.#phase === "return-menu") {
      this.#phase = "shop";
      return { type: "activate", action: { type: "navigate", to: "shop", resetScroll: true } };
    }
    if (screen === "shop" && this.#phase === "shop") {
      const purchase = planLongitudinalPurchase(progression, this.#spent, this.#policy);
      if (purchase !== null) {
        this.#pendingPurchase = purchase;
        this.#pendingWallet = progression.wallet;
        return { type: "activate", action: { type: "shop.buy", id: purchase.id } };
      }
      this.#phase = "start-next";
      return { type: "activate", action: { type: "navigate", to: "menu" } };
    }
    if (screen === "menu" && this.#phase === "start-next") {
      this.#currentEpisode += 1;
      this.#currentSeed = this.#baseSeed + this.#currentEpisode - 1;
      this.#episodeWalletBefore = progression.wallet;
      this.#episodeLevelsBefore = immutableLevels(progression.levels);
      this.#phase = "run";
      return { type: "begin-episode", seed: this.#currentSeed };
    }
    if (screen === "menu" && this.#phase === "victory-menu") {
      this.#phase = "terminal";
      return { type: "complete" };
    }
    return { type: "none" };
  }

  snapshot(): LongitudinalJourneySnapshot {
    return Object.freeze({
      label: "longitudinal-earned-profile",
      policyId: this.#policy.id,
      maxEpisodes: this.#policy.maxEpisodes,
      maxSpend: this.#policy.maxSpend,
      spent: this.#spent,
      currentEpisode: this.#currentEpisode,
      currentSeed: this.#currentSeed,
      episodes: Object.freeze([...this.#episodes]),
      purchases: Object.freeze([...this.#purchases]),
      ...(this.#frozenCombatLevels === undefined ? {} : { frozenCombatLevels: this.#frozenCombatLevels }),
      ...(this.#terminalReason === undefined ? {} : { terminalReason: this.#terminalReason }),
    });
  }

  #confirmPendingPurchase(progression: LongitudinalProgressionObservation): void {
    const pending = this.#pendingPurchase;
    if (pending === null) return;
    const levelAfter = progression.levels[pending.id] ?? 0;
    if (levelAfter !== pending.levelAfter) {
      this.#fail(`longitudinal-purchase-not-applied:${pending.id}`);
      this.#pendingPurchase = null;
      return;
    }
    this.#spent += pending.cost;
    this.#purchases.push(Object.freeze({
      ...pending,
      episode: this.#currentEpisode,
      walletBefore: this.#pendingWallet,
      walletAfter: progression.wallet,
      lifetimeEarned: progression.lifetimeEarned,
    }));
    this.#pendingPurchase = null;
  }

  #fail(reason: string): LongitudinalDirective {
    this.#phase = "terminal";
    this.#terminalReason = reason;
    return { type: "fail", reason };
  }
}
