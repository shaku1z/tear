import { calculateCoinAward } from "./coin-awards";

export interface EconomyRunState {
  readonly wave: number;
  readonly diff: string;
  readonly coinMod: number;
  readonly mods: Readonly<{ owned?: Readonly<Record<string, number>> }>;
}

export interface EconomyMetaPort {
  addCoins(amount: number): void;
  coins(): number;
  level(id: string): number;
}

export interface LiveEconomyRuntimeOptions<TShop> {
  readonly run: () => EconomyRunState;
  readonly remoteCoinMultiplier: () => number;
  readonly meta: EconomyMetaPort;
  readonly shop: readonly TShop[];
  readonly shopId: (item: TShop) => string;
  readonly achievementTracking: () => boolean;
  readonly addProfileStat: (stat: "coinsEarned", amount: number) => void;
}

export interface LiveEconomyRuntimeApi {
  readonly awardCoins: (score: number) => number;
  readonly telemetry: (earned: number) => Readonly<Record<string, number>>;
}

export function createLiveEconomyRuntime<TShop>(options: LiveEconomyRuntimeOptions<TShop>): LiveEconomyRuntimeApi {
  const fortune = (): number => options.run().mods.owned?.fortune ?? 0;
  return Object.freeze({
    awardCoins: (score: number) => {
      const run = options.run();
      const { earned } = calculateCoinAward({
        score, wave: run.wave || 0, difficultyId: run.diff,
        baseDifficultyMultiplier: run.coinMod || 1, remoteMultiplier: options.remoteCoinMultiplier(),
        coinMagnetLevel: options.meta.level("greed"), fortuneLevel: fortune(),
      });
      options.meta.addCoins(earned);
      if (options.achievementTracking()) options.addProfileStat("coinsEarned", earned);
      return earned;
    },
    telemetry: (earned: number) => ({
      earned, wallet: options.meta.coins(), coinMagnet: options.meta.level("greed"),
      fortune: fortune(), bounty: options.run().mods.owned?.bounty ?? 0,
      shopRanks: options.shop.reduce((count, item) => count + options.meta.level(options.shopId(item)), 0),
    }),
  });
}
