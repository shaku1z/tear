export interface CoinAwardInput {
  readonly score: number;
  readonly wave: number;
  readonly difficultyId: string;
  readonly baseDifficultyMultiplier: number;
  readonly remoteMultiplier: number;
  readonly coinMagnetLevel: number;
  readonly fortuneLevel: number;
}

export interface CoinAward {
  readonly earned: number;
  readonly scoreCoins: number;
  readonly depthCoins: number;
  readonly difficultyMultiplier: number;
  readonly fortuneMultiplier: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

export function calculateCoinAward(input: CoinAwardInput): CoinAward {
  let difficultyMultiplier = input.baseDifficultyMultiplier;
  if (input.difficultyId === "onehit") {
    const progress = clamp((input.wave - 8) / 12, 0, 1);
    const easeOut = 1 - (1 - progress) * (1 - progress);
    difficultyMultiplier = (0.70 + 2.35 * easeOut) * input.remoteMultiplier;
  }
  const scoreCoins = Math.floor(input.score * 0.02 * (1 + 0.08 * input.coinMagnetLevel) * difficultyMultiplier);
  const depthCoins = Math.floor(input.wave * 10);
  const fortune = Math.min(5, Math.max(0, input.fortuneLevel));
  const fortuneMultiplier = 1 + 0.12 * fortune + (fortune >= 3 ? 0.25 : 0) + (fortune >= 5 ? 0.35 : 0);
  return Object.freeze({
    earned: Math.floor((scoreCoins + depthCoins) * fortuneMultiplier),
    scoreCoins,
    depthCoins,
    difficultyMultiplier,
    fortuneMultiplier,
  });
}
